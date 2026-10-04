import datetime
import hashlib
import json
import pathlib
import secrets
import sqlite3
import subprocess
import time
import urllib.request
import uuid

home = pathlib.Path.home()
root = home / 'projects/annem'
host = home / '.monocode-host'
db = sqlite3.connect(host / 'host.db', timeout=30)
goal_id = '72610961-96d6-47ea-9d6e-bf592e49f8ce'
stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
backup = host / 'backups' / ('resume-annem-' + stamp)
backup.mkdir(mode=0o700)
with sqlite3.connect(backup / 'host.db') as target:
    db.backup(target)
def git(*args):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()
assert git('branch', '--show-current') == 'master'
goal = json.loads(db.execute('select value from goals where id=?', (goal_id,)).fetchone()[0])
tasks = [json.loads(row[0]) for row in db.execute('select value from tasks')]
own = [t for t in tasks if t['id'] in goal['taskIds']]
assert len(own) == 20
assert all(t['status'] in ('queued', 'review') for t in own)
reviews = [t for t in own if t['status'] == 'review']
assert len(reviews) == 2
assert all(t['verification']['review']['verdict'] == 'pass' for t in reviews)
(backup / 'status-before.txt').write_text(git('status', '--porcelain', '--untracked-files=all'))
(backup / 'tracked-before.patch').write_text(git('diff', '--binary', 'HEAD'))
print('Backup:', backup, flush=True)
if git('status', '--porcelain', '--untracked-files=all'):
    print(git('stash', 'push', '--include-untracked', '-m', 'MonoCode pre-0.8.62 main-checkout leftovers ' + stamp), flush=True)
stash = git('rev-parse', 'refs/stash')
(backup / 'stash.txt').write_text(stash + '\n')
assert not git('status', '--porcelain', '--untracked-files=no')
print('Saved leftovers:', stash, flush=True)

# A one-use local credential lets the live host own task transitions and cleanup.
# Its plaintext never leaves this process and its row is removed in finally.
device_id = str(uuid.uuid4())
token = secrets.token_urlsafe(32)
db.execute('insert into devices values (?,?,?)', (device_id, 'Temporary local goal recovery', hashlib.sha256(token.encode()).hexdigest()))
db.commit()
environment_id = db.execute("select value from metadata where key='environmentId'").fetchone()[0]
port = json.loads((host / 'running.json').read_text())['port']
def rpc(method, params):
    body = json.dumps(dict(version=1, environmentId=environment_id, method=method, params=params)).encode()
    req = urllib.request.Request('http://127.0.0.1:%s/rpc' % port, data=body, headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=150) as response:
        reply = json.load(response)
    if 'error' in reply:
        raise RuntimeError(reply['error'])
    return reply['result']
try:
    for task in own:
        if task['status'] == 'queued':
            data = dict(task, autoMerge=True)
            data.pop('status', None)
            result = rpc('tasks.save', {'task': data})
            assert result['autoMerge'] is True
    goal['autoMerge'] = True
    goal['updatedAt'] = int(time.time() * 1000)
    db.execute('update goals set value=? where id=?', (json.dumps(goal, ensure_ascii=False), goal_id))
    db.commit()
    for task in reviews:
        result = rpc('tasks.move', {'taskId': task['id'], 'to': 'done'})
        print('Merged:', result['title'], result['status'], result.get('merged'), flush=True)
    result = rpc('tasks.list', {})
    print('Task states:', [(t['title'], t['status'], t.get('autoMerge', False)) for t in result if t['id'] in goal['taskIds']], flush=True)
finally:
    db.execute('delete from devices where id=?', (device_id,))
    db.commit()
    db.close()
