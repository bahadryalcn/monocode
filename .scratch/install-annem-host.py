import os
import pathlib
import plistlib
import shutil
import sqlite3
import subprocess

home = pathlib.Path.home()
host = home / '.monocode-host'
old = host / 'runtime/0.8.62-darwin-arm64-manual'
new = host / 'runtime/0.8.62-darwin-arm64-auto-merge'
source = home / 'projects/monocode-build-0.8.62-auto-merge/build/host'
plist = home / 'Library/LaunchAgents/com.monocode.host.plist'
assert not new.exists()
with sqlite3.connect(host / 'host.db') as db:
    assert db.execute("select count(*) from tasks where json_extract(value, '$.status') in ('running','verifying')").fetchone()[0] == 0
shutil.copytree(old, new)
shutil.copy2(source / 'monocode-host.mjs', new / 'host.mjs')
shutil.copy2(source / 'monocode-host.mjs.map', new / 'host.mjs.map')
shutil.copy2(plist, host / 'com.monocode.host.plist.before-auto-merge')
shutil.copy2(host / 'runtime-path', host / 'runtime-path.before-auto-merge')
data = plistlib.loads(plist.read_bytes())
data['ProgramArguments'] = [arg.replace(str(old), str(new)) for arg in data['ProgramArguments']]
data['EnvironmentVariables']['PATH'] = data['EnvironmentVariables']['PATH'].replace(str(old), str(new))
domain = 'gui/%s' % os.getuid()
subprocess.run(['launchctl', 'bootout', domain, str(plist)], check=True)
plist.write_bytes(plistlib.dumps(data))
(host / 'runtime-path').write_text(str(new) + '\n')
subprocess.run(['launchctl', 'bootstrap', domain, str(plist)], check=True)
print('Installed:', new)
