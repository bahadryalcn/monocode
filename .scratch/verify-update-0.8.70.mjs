import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
const dir = join(homedir(), '.monocode-host');
const db = new DatabaseSync(join(dir, 'host.db'));
db.exec('PRAGMA busy_timeout=5000');
const state = JSON.parse(readFileSync(join(dir, 'running.json'), 'utf8'));
const environmentId = db.prepare("SELECT value FROM metadata WHERE key='environmentId'").get().value;
const id = randomUUID(), token = randomBytes(32).toString('base64url');
db.prepare('INSERT INTO devices VALUES (?, ?, ?)').run(id, 'temporary-release-verification', createHash('sha256').update(token).digest('hex'));
try {
  for (const method of ['environment.describe','host.settings.get','tasks.list','goals.list','stewards.list']) {
    const res = await fetch(`http://127.0.0.1:${state.port}/rpc`, {
      method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({version:1,environmentId,method,params:{}}),signal:AbortSignal.timeout(15000),
    });
    const reply = await res.json();
    if (!res.ok || reply.error) throw new Error(method+': '+JSON.stringify(reply.error??res.status));
    console.log(method, Array.isArray(reply.result) ? 'OK count='+reply.result.length : 'OK');
  }
  console.log('DB', db.prepare('PRAGMA quick_check').get().quick_check);
} finally {
  db.prepare('DELETE FROM devices WHERE id=?').run(id);
  db.close();
}
