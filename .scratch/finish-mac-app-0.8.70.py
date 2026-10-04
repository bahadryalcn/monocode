import pathlib, plistlib, sqlite3, subprocess, time
h=pathlib.Path.home()
db=h/'Library/Application Support/com.monocode.desktop.fork/monocode.db'
with sqlite3.connect(f'file:{db}?mode=ro',uri=True) as con:
    assert con.execute('select count(*) from in_flight_sessions').fetchone()[0]==0, 'Desktop has active turns'
app=pathlib.Path('/Applications/MonoCode.app')
stage=pathlib.Path('/Applications/MonoCode-0.8.70-staged.app')
initial=pathlib.Path('/Applications/MonoCode-0.8.70-initial.app')
assert not stage.exists() and not initial.exists()
src=h/'projects/monocode/target/aarch64-apple-darwin/release/bundle/macos/MonoCode.app'
subprocess.run(['ditto',str(src),str(stage)],check=True)
subprocess.run(['codesign','--verify','--deep','--strict',str(stage)],check=True)
subprocess.run(['osascript','-e','tell application "MonoCode" to quit'],check=True)
for _ in range(30):
    if subprocess.run(['pgrep','-x','monocode'],capture_output=True).returncode: break
    time.sleep(1)
else: raise RuntimeError('App did not close')
app.rename(initial)
stage.rename(app)
with (app/'Contents/Info.plist').open('rb') as f: assert plistlib.load(f)['CFBundleShortVersionString']=='0.8.70'
subprocess.run(['open','-a',str(app)],check=True)
print('APP_FINAL_INSTALLED 0.8.70')
