"""One frozen source, two parallel machines, persistent caches, independent installs."""
import argparse
import concurrent.futures
import gzip
import hashlib
import io
import json
import os
import pathlib
import platform
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import time
import tomllib

from local_update_lib import (digest, lock, read_json, run, safe_child,
                              tree_hashes, verify_tree, write_json, alive, windows_binary_digest)

ROOT = pathlib.Path(__file__).resolve().parent.parent
TOOLS = ('local_update.py', 'local_update_lib.py', 'local_install.py')

def inputs(root):
    names = run(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root).split('\0')
    return {name: (root / name).read_bytes() for name in sorted(set(names))
            if name and not name.startswith(('.scratch/', 'build/', 'docs/', '.git/'))
            and '__pycache__' not in pathlib.PurePosixPath(name).parts and not name.endswith('.pyc')
            and (root / name).is_file()}

def fingerprint(files):
    value = hashlib.sha256()
    for name, content in sorted(files.items()):
        value.update(name.encode() + b'\0' + hashlib.sha256(content).digest())
    return value.hexdigest()

def snapshot(root, state):
    files = inputs(root)
    source = fingerprint(files)
    out = state / 'incoming' / (source + '.tar.gz')
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0) as gz:
        with tarfile.open(fileobj=gz, mode='w') as tar:
            for name, content in files.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(content)
                entry.mode = 0o755 if name.endswith('.sh') else 0o644
                tar.addfile(entry, io.BytesIO(content))
    return out, source

def sync_source(archive, source, workspace):
    workspace.mkdir(parents=True, exist_ok=True)
    marker = workspace.parent / 'source-files.json'
    with tarfile.open(archive) as tar:
        names = [entry.name for entry in tar.getmembers()]
        for name in names:
            safe_child(workspace, name)
        for old in read_json(marker) if marker.exists() else []:
            if old not in names:
                safe_child(workspace, old).unlink(missing_ok=True)
        tar.extractall(workspace, filter='data')
    files = {name: safe_child(workspace, name).read_bytes() for name in names}
    if fingerprint(files) != source:
        raise RuntimeError('Extracted source fingerprint mismatch')
    write_json(marker, names)
    return files

def dependency_key(files):
    return fingerprint({'package.json': files['package.json']})

def dependency_action(workspace, files, installed_key=None, previous_package=None):
    """Never reinstall just because a build cache is missing or force-build is set."""
    if not (workspace / 'node_modules').is_dir():
        return 'install'
    previous_key = installed_key
    if previous_key is None and previous_package is not None:
        previous_key = dependency_key({'package.json': previous_package})
    if previous_key is not None and previous_key != dependency_key(files):
        return 'clean-install'
    return 'reuse'

def validate_versions(files):
    version = json.loads(files['package.json'])['version']
    lockfile = json.loads(files['package-lock.json'])
    values = [lockfile['version'], lockfile['packages']['']['version'],
              json.loads(files['src-tauri/tauri.conf.json'])['version'],
              tomllib.loads(files['Cargo.toml'].decode())['workspace']['package']['version']]
    if not re.fullmatch(r'\d+\.\d+\.\d+', version) or any(value != version for value in values):
        raise RuntimeError('Version files disagree; run the existing bump-version script before building')
    rust_name = tomllib.loads(files['src-tauri/Cargo.toml'].decode())['package']['name']
    rust_versions = [p['version'] for p in tomllib.loads(files['Cargo.lock'].decode())['package'] if p['name'] == rust_name]
    if rust_versions != [version]:
        raise RuntimeError('Cargo.lock version disagrees; run the bump-version script before building')
    return version

def legacy_updaters():
    if os.name == 'nt':
        from local_update_lib import ps
        value = ps('Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "powershell.exe" -and $_.CommandLine -like "*MonoCodeUpdate*install-*.ps1*" } | ForEach-Object { $_.ProcessId }')
        return value.splitlines() if value else []
    processes = run(['ps', 'ax', '-o', 'pid=,command='])
    return [line.split()[0] for line in processes.splitlines()
            if re.search(r'/projects/monocode-build[^ ]*/(?:install-host|finish-mac-host[^ ]*|update-mac)\.py(?:\s|$)', line)]

def status():
    base = pathlib.Path.home() / '.monocode-host/update-jobs'
    return {component: read_json(base / (component+'.json')) if (base / (component+'.json')).exists()
            else {'state': 'not scheduled by this pipeline'} for component in ('host', 'app')}

def stage(name, command, workspace, env, release, timings):
    print(f'[{sys.platform}] {name}', flush=True)
    started = time.monotonic()
    try:
        run(command, cwd=workspace, env=env, log=release / (name + '.log'), timeout=3600)
    finally:
        timings[name] = round(time.monotonic() - started, 2)
        write_json(release / 'timings.json', timings)

def queue_install(release):
    manifest = read_json(release / 'manifest.json')
    base = pathlib.Path.home() / '.monocode-host' / 'update-jobs'
    base.mkdir(parents=True, exist_ok=True)
    results = {}
    for component in ('host', 'app'):
        record = base / (component + '.json')
        old = read_json(record) if record.exists() else {}
        if old.get('id') == manifest['id'] and old.get('state') == 'installed':
            try:
                if component == 'host':
                    runtime = pathlib.Path((pathlib.Path.home()/'.monocode-host/runtime-path').read_text().strip())
                    verify_tree(runtime, manifest['hostHashes'])
                else:
                    binary = (pathlib.Path(os.environ['LOCALAPPDATA'])/'MonoCode/monocode.exe' if os.name == 'nt'
                              else pathlib.Path('/Applications/MonoCode.app/Contents/MacOS/monocode'))
                    if (windows_binary_digest(binary) if os.name == 'nt' else digest(binary)) != manifest['binaryHash']:
                        raise RuntimeError('Installed binary changed')
                results[component] = str(record)
                continue
            except (OSError, RuntimeError):
                pass
        if alive(old.get('pid')):
            if old.get('id') != manifest['id']:
                raise RuntimeError(f'{component} updater already running for another package; see {record}')
            results[component] = str(record)
            continue
        log = release / ('install-' + component + '.log')
        options = dict(stdin=subprocess.DEVNULL, cwd=release)
        if os.name == 'nt':
            options['creationflags'] = subprocess.CREATE_NO_WINDOW
        else:
            options['start_new_session'] = True
        write_json(record, {'pid': None, 'id': manifest['id'], 'state': 'launching', 'log': str(log)})
        with log.open('ab') as output:
            child = subprocess.Popen([sys.executable, str(release / 'local_install.py'),
                                      str(release / 'manifest.json'), component],
                                     stdout=output, stderr=output, **options)
        write_json(release / ('launch-'+component+'.json'), {'pid': child.pid, 'log': str(log)})
        results[component] = str(record)
    write_json(release / 'install-jobs.json', results)
    print(f'[{sys.platform}] install jobs scheduled; state: {base}', flush=True)

def finish_build(release, build_only=False):
    if build_only:
        print(f'[{sys.platform}] build-only package verified: {release}', flush=True)
    else:
        queue_install(release)


def worker(request):
    if (os.name == 'nt' and platform.machine().lower() not in ('amd64', 'x86_64')) or (os.name != 'nt' and (sys.platform != 'darwin' or platform.machine() != 'arm64')):
        raise RuntimeError('Local updater supports Windows x64 and Apple Silicon Mac only')
    state = pathlib.Path(request['stateRoot']).expanduser().resolve()
    release = state / 'runs' / request['id']
    release.mkdir(parents=True, exist_ok=True)
    legacy = legacy_updaters()
    if legacy:
        raise RuntimeError('Previous ad-hoc updater still running (PID '+','.join(legacy)+'); finish it before starting this pipeline')
    for component, old in status().items():
        if alive(old.get('pid')) and old.get('id') != request['id']:
            raise RuntimeError(f'{component} has a pending package; see --status before starting another update')
    if request.get('installOnly'):
        # Reuse the immutable package with current installation bug fixes.
        # An already-running helper has imported its own code and keeps its job.
        for name in TOOLS:
            shutil.copy2(pathlib.Path(__file__).parent / name, release / name)
        queue_install(release)
        return
    with lock(state / 'build.lock'):
        archive = pathlib.Path(request['archive']).expanduser()
        if digest(archive) != request['archiveHash']:
            raise RuntimeError('Transferred archive checksum mismatch')
        workspace = state / 'source'
        package_file = workspace / 'package.json'
        previous_package = package_file.read_bytes() if package_file.exists() else None
        files = sync_source(archive, request['source'], workspace)
        version = validate_versions(files)
        workspace = state / 'source'
        env = os.environ.copy()
        env['PATH'] = str(pathlib.Path.home() / '.cargo/bin') + os.pathsep + env['PATH']
        if sys.platform == 'darwin':
            env['PATH'] = str(pathlib.Path.home() / 'Library/pnpm/bin') + ':/opt/homebrew/bin:' + env['PATH']
        env['PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN'] = 'false'
        env['CARGO_TARGET_DIR'] = str(pathlib.Path(request['cargoTarget']).expanduser().resolve())
        env['MONOCODE_HOST_RUNTIME_CACHE'] = str(state / 'runtime-cache')
        if os.name == 'nt':
            env['RUSTUP_TOOLCHAIN'] = 'stable-x86_64-pc-windows-msvc'
            env.setdefault('TAURI_SIGNING_PRIVATE_KEY', str(pathlib.Path.home() / '.tauri/monocode-fork.key'))
        if request['mode'] == 'local':
            env.update(CARGO_PROFILE_RELEASE_LTO='false', CARGO_PROFILE_RELEASE_CODEGEN_UNITS='16',
                       CARGO_PROFILE_RELEASE_INCREMENTAL='true')
        else:
            for name in ('LTO', 'CODEGEN_UNITS', 'INCREMENTAL'):
                env.pop('CARGO_PROFILE_RELEASE_'+name, None)
        cache_file = state / 'build-cache.json'
        cache = read_json(cache_file) if cache_file.exists() else {}
        pnpm_version = run(['pnpm', '--version'], cwd=workspace, env=env)
        expected_pnpm = json.loads(files['package.json'])['packageManager'].removeprefix('pnpm@')
        if pnpm_version != expected_pnpm:
            raise RuntimeError(f'pnpm {expected_pnpm} required; found {pnpm_version}')
        timings = {}
        # Tests/docs do not affect shipped JS/Rust. Package/config/version files do.
        shipped = {n: b for n, b in files.items() if '.test.' not in n and not n.startswith('tests/')}
        keys = {
            'deps': dependency_key(files),
            'host': fingerprint({n: b for n, b in shipped.items() if n.startswith('host/') or n.startswith('package.') or n == 'LICENSE'}),
            'web': fingerprint({n: b for n, b in shipped.items()
                                if not n.startswith(('host/', 'src-tauri/', 'Cargo.', 'scripts/', '.github/'))
                                and n not in ('AGENTS.md', 'README.md', 'LICENSE')}),
        }
        toolchain = run(['rustc', '--version'], cwd=workspace, env=env)
        native = {n: b for n, b in shipped.items() if n.startswith(('src-tauri/', 'Cargo.'))}
        profile = {k: v for k, v in env.items() if k.startswith('CARGO_PROFILE_RELEASE_')}
        keys['native'] = fingerprint(native) + keys['web'] + request['mode'] + toolchain + json.dumps(profile, sort_keys=True)
        def needed(key, exists):
            return request.get('forceBuild') or cache.get(key) != keys[key] or not exists
        # Separate marker: older build-cache deps keys included npm lock/version normalization.
        deps_marker = state / 'installed-package.json'
        installed_key = read_json(deps_marker).get('hash') if deps_marker.exists() else None
        action = dependency_action(workspace, files, installed_key, previous_package)
        if action == 'clean-install':
            modules = safe_child(workspace, 'node_modules')
            if modules.is_symlink() or modules.is_junction():
                raise RuntimeError('Refusing to clean linked node_modules; use a real managed directory')
            shutil.rmtree(modules)
        if action != 'reuse':
            stage('dependencies', ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline'], workspace, env, release, timings)
        else:
            print('Dependencies reused: package.json unchanged; no install', flush=True)
        write_json(deps_marker, {'hash': keys['deps']})
        windows = os.name == 'nt'
        target = 'win32-x64' if windows else 'darwin-arm64'
        host = workspace / 'build/host-packages' / target
        if needed('host', (host / 'host.mjs').exists()):
            stage('host', ['pnpm', 'run', 'host:package', '--directory-only'], workspace, env, release, timings)
            cache['host'] = keys['host']
            write_json(cache_file, cache)
        if needed('web', (workspace / 'dist/index.html').exists()):
            stage('web', ['pnpm', 'run', 'build'], workspace, env, release, timings)
            cache['web'] = keys['web']
            write_json(cache_file, cache)
        # Web was built explicitly once; Tauri must not run it for a second time.
        override = workspace / 'local-update-tauri.json'
        override.write_text('{"build":{"beforeBuildCommand":""}}', encoding='utf-8')
        cargo = pathlib.Path(env['CARGO_TARGET_DIR'])
        artifacts = cargo / ('release' if windows else 'aarch64-apple-darwin/release')
        app = artifacts / 'bundle/nsis' / f'MonoCode_{version}_x64-setup.exe' if windows else artifacts / 'bundle/macos/MonoCode.app'
        native_binary = artifacts / ('monocode.exe' if windows else 'bundle/macos/MonoCode.app/Contents/MacOS/monocode')
        matches = app.exists() and native_binary.exists() and cache.get('binaryHash') == digest(native_binary)
        if matches and windows:
            matches = pathlib.Path(str(app)+'.sig').exists() and cache.get('installerHash') == digest(app)
        if matches and not windows:
            try:
                run(['codesign', '--verify', '--deep', '--strict', str(app)])
            except Exception:
                matches = False
        if needed('native', matches):
            command = ['pnpm', 'exec', 'tauri', 'build', '--ci', '--bundles', 'nsis' if windows else 'app',
                       '--config', 'src-tauri/tauri.fork.conf.json' if windows else 'src-tauri/tauri.fork.macos.conf.json',
                       '--config', override.name]
            if not windows:
                command += ['--target', 'aarch64-apple-darwin']
            stage('native', command, workspace, env, release, timings)
            cache['native'] = keys['native']
        cache['binaryHash'] = digest(native_binary)
        if windows:
            cache['installerHash'] = digest(app)
        write_json(cache_file, cache)
        # Copy immutable payloads before releasing the build workspace lock.
        payload = release / 'host'
        if payload.exists():
            verify_tree(payload, tree_hashes(host))
        else:
            shutil.copytree(host, payload)
        if windows:
            shutil.copy2(app, release / 'setup.exe')
            shutil.copy2(str(app) + '.sig', release / 'setup.exe.sig')
            native_exe = artifacts / 'monocode.exe'
            binary_hash = windows_binary_digest(native_exe)
            app_hashes = {'setup.exe': digest(release / 'setup.exe'), 'setup.exe.sig': digest(release / 'setup.exe.sig')}
        else:
            destination = release / 'MonoCode.app'
            if not destination.exists():
                # ditto preserves bundle links and permissions.
                run(['ditto', str(app), str(destination)])
            run(['codesign', '--verify', '--deep', '--strict', str(destination)])
            binary_hash = digest(destination / 'Contents/MacOS/monocode')
            app_hashes = tree_hashes(destination)
        for name in TOOLS:
            shutil.copy2(workspace / 'scripts' / name, release / name)
        manifest = {'id': request['id'], 'version': version, 'source': request['source'], 'mode': request['mode'],
                    'platform': target, 'hostHashes': tree_hashes(payload), 'appHashes': app_hashes,
                    'binaryHash': binary_hash, 'timings': timings}
        write_json(release / 'manifest.json', manifest)
        write_json(cache_file, cache)
        write_json(state / 'latest.json', request)
    finish_build(release, request.get('buildOnly', False))

def main():
    if sys.version_info < (3, 12):
        raise RuntimeError('Python 3.12+ is required (no third-party packages)')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--platforms', default='windows,mac' if os.name == 'nt' else 'mac')
    parser.add_argument('--version')
    parser.add_argument('--plan', action='store_true')
    parser.add_argument('--install-only', action='store_true')
    parser.add_argument('--build-only', action='store_true')
    parser.add_argument('--release', action='store_true')
    parser.add_argument('--force-build', action='store_true')
    parser.add_argument('--worker')
    parser.add_argument('--snapshot-request', help='Reuse one frozen source across independent platform agents')
    parser.add_argument('--status', action='store_true')
    parser.add_argument('--status-worker', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.install_only and (args.version or args.release or args.force_build or args.build_only):
        raise ValueError('--install-only reuses the previous version/mode; do not combine it with build options')
    if args.worker:
        worker(read_json(pathlib.Path(args.worker).expanduser()))
        return
    if args.status_worker:
        print(json.dumps(status(), indent=2))
        return
    config = read_json(ROOT / 'scripts/local-update.config.json')
    platforms = args.platforms.split(',')
    if not set(platforms) <= {'windows', 'mac'}:
        raise ValueError('Platforms must be windows and/or mac')
    if 'windows' in platforms and os.name != 'nt':
        raise ValueError('The Windows coordinator must run on Windows; use --platforms mac here')
    if args.version and not re.fullmatch(r'\d+\.\d+\.\d+', args.version):
        raise ValueError('Version must be x.y.z')
    mode = 'release' if args.release else 'local'
    if args.status:
        if 'windows' in platforms:
            print('Windows:', json.dumps(status(), indent=2))
        if 'mac' in platforms:
            if sys.platform == 'darwin':
                print('Mac:', json.dumps(status(), indent=2))
            else:
                host = config['mac']['ssh']
                code = 'import pathlib,json; p=pathlib.Path.home()/".monocode-host/update-jobs"; print(json.dumps({k:json.loads((p/(k+".json")).read_text()) if (p/(k+".json")).exists() else {"state":"not scheduled by this pipeline"} for k in ("host","app")}))'
                command = f'{shlex.quote(config["mac"]["python"])} -c {shlex.quote(code)}'
                print('Mac:', run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, command], timeout=30))
        return
    if args.plan:
        print(json.dumps({'platforms': platforms, 'mode': mode, 'build': not args.install_only,
                          'version': args.version or read_json(ROOT / 'package.json')['version'],
                          'steps': (['reuse last manifest'] if args.install_only else ['freeze once', 'parallel cached builds']) +
                                   ['verify artifacts'] + ([] if args.build_only else ['independent idle host/app install jobs']),
                          'install': not args.build_only, 'config': config}, indent=2))
        return
    state = pathlib.Path(config['stateRoot']).expanduser().resolve()
    if args.snapshot_request and (len(platforms) != 1 or args.version or args.install_only or args.force_build):
        raise ValueError('snapshot-request requires one platform and no version/install-only/force-build options')
    coordinator_lock = ('coordinator-' + platforms[0] + '.lock') if args.snapshot_request else 'coordinator.lock'
    with lock(state / coordinator_lock):
        if args.version and not args.install_only:
            run(['node', 'scripts/bump-version.mjs', args.version], cwd=ROOT)
        if args.snapshot_request:
            previous = read_json(pathlib.Path(args.snapshot_request))
            if previous['mode'] != mode:
                raise ValueError('Snapshot build mode does not match requested mode')
        elif args.install_only:
            previous = read_json(state / 'coordinator-latest.json')
        else:
            archive, source = snapshot(ROOT, state)
            previous = {'archive': str(archive), 'archiveHash': digest(archive), 'source': source,
                        'id': source[:16] + '-' + mode, 'mode': mode}
            if args.force_build:
                previous['id'] += '-' + str(time.time_ns())
        def update(platform):
            request = dict(previous, installOnly=args.install_only, buildOnly=args.build_only,
                           forceBuild=args.force_build, stateRoot=config['stateRoot'])
            machine = config[platform]
            if platform == 'windows' or sys.platform == 'darwin':
                request['cargoTarget'] = str((ROOT / machine['cargoTarget']).resolve()) if not machine['cargoTarget'].startswith('~') else machine['cargoTarget']
                worker(request)
            else:
                host = machine['ssh']
                remote = '.monocode-build/incoming/' + previous['id']
                remote_tools = '.monocode-build/tools/' + previous['id']
                run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host,
                     f'mkdir -p "$HOME/{remote}" "$HOME/{remote_tools}"'], timeout=30)
                if not args.install_only:
                    run(['scp', '-q', previous['archive'], f'{host}:{remote}/source.tar.gz'], timeout=120)
                for name in TOOLS:
                    run(['scp', '-q', str(ROOT / 'scripts' / name), f'{host}:{remote_tools}/{name}'], timeout=60)
                request.update(archive='~/'+remote+'/source.tar.gz', cargoTarget=machine['cargoTarget'])
                local_request = state / ('request-' + platform + '.json')
                write_json(local_request, request)
                run(['scp', '-q', str(local_request), f'{host}:{remote}/request.json'], timeout=60)
                command = f'{shlex.quote(machine["python"])} "$HOME/{remote_tools}/local_update.py" --worker "$HOME/{remote}/request.json"'
                # Keep per-machine output/logs, no shell interpolation of project paths.
                run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, command],
                    log=state / ('mac-' + previous['id'] + '.log'), timeout=7200)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures = {pool.submit(update, platform): platform for platform in platforms}
            failures = []
            for future in concurrent.futures.as_completed(futures):
                platform = futures[future]
                try:
                    future.result()
                    result = 'build complete' if args.build_only else 'install jobs scheduled'
                    print(f'{platform}: package verified; {result}', flush=True)
                except Exception as error:
                    failures.append(platform)
                    print(f'{platform}: FAILED ({type(error).__name__}: {error}); inspect logs in {state}', flush=True)
            write_json(state / 'coordinator-latest.json', previous)
            if failures:
                raise RuntimeError('Update failed: ' + ', '.join(failures))

if __name__ == '__main__':
    main()
