"""Regression checks only: never builds, installs, contacts SSH, or stops processes."""
import io
from contextlib import closing
import json
import pathlib
import sqlite3
import tarfile
import tempfile
import time
import unittest
from unittest.mock import patch

from local_update import dependency_action, dependency_key, fingerprint, sync_source, queue_install, validate_versions, finish_build, host_key
from local_update_lib import backup, count, safe_child, write_json, read_json, alive, digest, windows_binary_digest
from local_install import wait_idle, stop_windows_host

class LocalUpdateTests(unittest.TestCase):
    def test_shared_provider_edit_invalidates_host_cache(self):
        files = {'host/cli.ts': b'entry',
                 'src/integrations/harness/providers/codex/codex.ts': b'old'}
        before = host_key(files)
        files['src/integrations/harness/providers/codex/codex.ts'] = b'excludeTurns: true'
        self.assertNotEqual(before, host_key(files))
        after = host_key(files)
        files['src/integrations/harness/providers/codex/codexLive.test.ts'] = b'test'
        self.assertEqual(after, host_key(files))

    def test_exited_windows_host_does_not_require_a_live_lifecycle_endpoint(self):
        with patch('local_install.read_json', return_value={'pid': 123, 'port': 3774}), \
             patch('local_install.alive', return_value=False), patch('local_install.lifecycle') as lifecycle:
            self.assertEqual(stop_windows_host(), 3774)
        lifecycle.assert_not_called()

    def test_live_windows_host_requires_shutdown_before_installation(self):
        with patch('local_install.read_json', return_value={'pid': 123, 'port': 3774}), \
             patch('local_install.alive', side_effect=[True, False, False]), \
             patch('local_install.lifecycle', return_value=123) as lifecycle:
            self.assertEqual(stop_windows_host(), 3774)
        lifecycle.assert_called_once_with('stop')

    def test_windows_lifecycle_failure_with_live_pid_does_not_allow_a_service_swap(self):
        with patch('local_install.read_json', return_value={'pid': 123, 'port': 3774}), \
             patch('local_install.alive', return_value=True), \
             patch('local_install.lifecycle', side_effect=ConnectionError('unavailable')):
            with self.assertRaises(ConnectionError):
                stop_windows_host()

    def test_build_only_does_not_schedule_installation(self):
        with patch('local_update.queue_install') as install:
            finish_build(pathlib.Path('verified-package'), build_only=True)
        install.assert_not_called()

    def test_default_build_preserves_installation_behavior(self):
        release = pathlib.Path('verified-package')
        with patch('local_update.queue_install') as install:
            finish_build(release)
        install.assert_called_once_with(release)

    def test_nsis_bundle_marker_is_the_only_normalized_executable_difference(self):
        with tempfile.TemporaryDirectory() as folder:
            built = pathlib.Path(folder) / 'built.exe'
            installed = pathlib.Path(folder) / 'installed.exe'
            built.write_bytes(b'MZ-prefix-__TAURI_BUNDLE_TYPE_VAR_UNK-suffix')
            installed.write_bytes(b'MZ-prefix-__TAURI_BUNDLE_TYPE_VAR_NSS-suffix')
            self.assertEqual(windows_binary_digest(installed), digest(built))
            self.assertEqual(windows_binary_digest(built), digest(built))
            installed.write_bytes(b'MZ-changed-__TAURI_BUNDLE_TYPE_VAR_NSS-suffix')
            self.assertNotEqual(windows_binary_digest(installed), digest(built))
            for data in (b'missing', b'__TAURI_BUNDLE_TYPE_VAR_MSI',
                         b'__TAURI_BUNDLE_TYPE_VAR_NSS__TAURI_BUNDLE_TYPE_VAR_UNK'):
                installed.write_bytes(data)
                with self.assertRaises(RuntimeError):
                    windows_binary_digest(installed)

    def test_process_liveness_is_read_only(self):
        import os
        self.assertTrue(alive(os.getpid()))
        self.assertFalse(alive(None))

    def test_mixed_version_source_is_rejected_before_build(self):
        files = {'package.json': b'{"version":"0.8.70"}',
                 'package-lock.json': b'{"version":"0.8.70","packages":{"":{"version":"0.8.70"}}}',
                 'src-tauri/tauri.conf.json': b'{"version":"0.8.71"}',
                 'Cargo.toml': b'[workspace.package]\nversion="0.8.70"'}
        with self.assertRaises(RuntimeError):
            validate_versions(files)

    def test_matching_version_and_rust_lock_are_accepted(self):
        files = {'package.json': b'{"version":"0.8.70"}',
                 'package-lock.json': b'{"version":"0.8.70","packages":{"":{"version":"0.8.70"}}}',
                 'src-tauri/tauri.conf.json': b'{"version":"0.8.70"}',
                 'Cargo.toml': b'[workspace.package]\nversion="0.8.70"',
                 'src-tauri/Cargo.toml': b'[package]\nname="monocode"',
                 'Cargo.lock': b'[[package]]\nname="monocode"\nversion="0.8.70"'}
        self.assertEqual(validate_versions(files), '0.8.70')

    def test_only_package_json_controls_dependency_key(self):
        def files(version, dependency='1.0.0'):
            return {'package.json': json.dumps({'version': version, 'dependencies': {'a': dependency}}).encode(),
                    'package-lock.json': json.dumps({'version': version, 'packages': {'': {'version': version},
                                                   'node_modules/a': {'version': dependency}}}).encode()}
        self.assertNotEqual(dependency_key(files('0.8.70')), dependency_key(files('0.8.71')))
        self.assertNotEqual(dependency_key(files('0.8.70')), dependency_key(files('0.8.70', '2.0.0')))
        first = files('0.8.70')
        changed_lock = dict(first, **{'package-lock.json': b'changed', 'pnpm-lock.yaml': b'changed'})
        self.assertEqual(dependency_key(first), dependency_key(changed_lock))

    def test_dependency_install_policy_preserves_existing_modules(self):
        files = {'package.json': b'{"version":"0.8.70"}'}
        with tempfile.TemporaryDirectory() as folder:
            workspace = pathlib.Path(folder)
            self.assertEqual(dependency_action(workspace, files), 'install')
            (workspace/'node_modules').mkdir()
            self.assertEqual(dependency_action(workspace, files), 'reuse')
            self.assertEqual(dependency_action(workspace, files, dependency_key(files)), 'reuse')
            self.assertEqual(dependency_action(workspace, files, previous_package=files['package.json']), 'reuse')
            self.assertEqual(dependency_action(workspace, files, previous_package=b'{}'), 'clean-install')
            self.assertEqual(dependency_action(workspace, files, 'old'), 'clean-install')

    def test_bad_database_read_never_means_idle(self):
        reports = []
        with patch('local_install.count', side_effect=[sqlite3.OperationalError('busy'), 2, 0]), patch('local_install.time.sleep') as sleep:
            wait_idle('unused', 'unused', lambda state, **values: reports.append(values['activeSessions']))
        self.assertEqual(reports, [None, 2, 0])
        self.assertEqual(sleep.call_count, 2)

    def test_missing_database_count_fails_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(sqlite3.OperationalError):
                count(pathlib.Path(folder)/'missing.db', 'select 0')

    def test_paths_cannot_escape_managed_workspace(self):
        with tempfile.TemporaryDirectory() as folder:
            for name in ('../outside', '/outside', '.'):
                with self.assertRaises(ValueError):
                    safe_child(folder, name)

    def test_archive_root_and_stale_files_without_removing_cache(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            workspace = root/'source'
            workspace.mkdir()
            (workspace/'removed.ts').write_text('old')
            (workspace/'node_modules').mkdir()
            (workspace/'node_modules/cache').write_text('keep')
            write_json(root/'source-files.json', ['removed.ts'])
            files = {'src/örnek.ts': b'new', 'package.json': b'{}'}
            archive = root/'source.tar'
            with tarfile.open(archive, 'w') as tar:
                for name, value in files.items():
                    entry = tarfile.TarInfo(name)
                    entry.size = len(value)
                    tar.addfile(entry, io.BytesIO(value))
            self.assertEqual(sync_source(archive, fingerprint(files), workspace), files)
            self.assertFalse((workspace/'removed.ts').exists())
            self.assertEqual((workspace/'node_modules/cache').read_text(), 'keep')

    def test_backup_is_complete_and_bounded_when_locked(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            db = root/'db'
            with closing(sqlite3.connect(db)) as con, con:
                con.execute('create table rows (value)')
                con.execute('insert into rows values (42)')
            backup(db, root/'copy')
            self.assertEqual(count(root/'copy', 'select value from rows'), 42)
            with closing(sqlite3.connect(db)) as writer, writer:
                writer.execute('begin exclusive')
                started = time.monotonic()
                with self.assertRaises(TimeoutError):
                    backup(db, root/'locked-copy', seconds=0.05)
                self.assertLess(time.monotonic()-started, 3)

    def test_same_pending_package_does_not_spawn_second_helper(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            release = root/'release'
            release.mkdir()
            write_json(release/'manifest.json', {'id': 'same'})
            base = root/'.monocode-host/update-jobs'
            for component in ('host', 'app'):
                write_json(base/(component+'.json'), {'id': 'same', 'pid': 123})
            with patch('local_update.pathlib.Path.home', return_value=root), patch('local_update.alive', return_value=True), patch('local_update.subprocess.Popen') as spawn:
                queue_install(release)
            spawn.assert_not_called()

    def test_pending_different_package_refuses_double_installer(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            release = root/'release'
            release.mkdir()
            write_json(release/'manifest.json', {'id': 'new'})
            write_json(root/'.monocode-host/update-jobs/host.json', {'id': 'old', 'pid': 123})
            with patch('local_update.pathlib.Path.home', return_value=root), patch('local_update.alive', return_value=True), patch('local_update.subprocess.Popen') as spawn:
                with self.assertRaises(RuntimeError):
                    queue_install(release)
            spawn.assert_not_called()

if __name__ == '__main__':
    unittest.main()
