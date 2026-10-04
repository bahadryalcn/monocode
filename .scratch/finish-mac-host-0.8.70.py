import json, os, pathlib, plistlib, shutil, sqlite3, subprocess, time

home = pathlib.Path.home()
base = home / '.monocode-host'
backup = base / 'backups/update-0.8.70'
new = base / 'runtime/0.8.70-darwin-arm64-manual'
plist = home / 'Library/LaunchAgents/com.monocode.host.plist'
log = home / 'projects/monocode-build-0.8.70/install.log'

def say(message):
    with log.open('a') as f:
        f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + message + '\n')

def count(db, sql):
    with sqlite3.connect(f'file:{db}?mode=ro', uri=True, timeout=10) as con:
        return con.execute(sql).fetchone()[0]

last = None
while True:
    active = count(base / 'host.db', "select count(*) from sessions where status='running' or shell_running=1")
    if active != last:
        say(f'HOST_WAIT_ACTIVE {active}')
        last = active
    if active == 0:
        break
    time.sleep(10)
for name in ['host.db']:
    with sqlite3.connect(base/name) as src, sqlite3.connect(backup/(name+'.before-switch')) as dst:
        src.backup(dst)
shutil.copy2(plist, backup/'com.monocode.host.plist')
shutil.copy2(base/'runtime-path', backup/'runtime-path')
with plist.open('rb') as f:
    config = plistlib.load(f)
previous = config['ProgramArguments'][0].rsplit('/bin/node', 1)[0]
config['ProgramArguments'] = [v.replace(previous, str(new)) for v in config['ProgramArguments']]
config['EnvironmentVariables']['PATH'] = config['EnvironmentVariables']['PATH'].replace(previous, str(new))
subprocess.run(['launchctl', 'bootout', f'gui/{os.getuid()}', str(plist)], check=True)
with plist.open('wb') as f:
    plistlib.dump(config, f)
(base/'runtime-path').write_text(str(new)+'\n')
subprocess.run(['launchctl', 'bootstrap', f'gui/{os.getuid()}', str(plist)], check=True)
for _ in range(30):
    result = subprocess.run([str(new/'monocode-host'), 'status'], capture_output=True, text=True)
    if 'Host is running' in result.stdout:
        say('HOST_INSTALLED 0.8.70 '+result.stdout.strip())
        break
    time.sleep(1)
else:
    raise RuntimeError('New host did not become ready; inspect install.log')
