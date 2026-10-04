import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const dir = join(homedir(), '.monocode-host');
const db = new DatabaseSync(join(dir, 'host.db'));
db.exec('PRAGMA busy_timeout=5000');
const state = JSON.parse(readFileSync(join(dir, 'running.json'), 'utf8'));
const environmentId = db.prepare("SELECT value FROM metadata WHERE key='environmentId'").get().value;
const token = randomBytes(32).toString('base64url');
const id = randomUUID();
db.prepare('INSERT INTO devices VALUES (?, ?, ?)').run(id, 'temporary-autonomy-configuration', createHash('sha256').update(token).digest('hex'));
async function call(method, params = {}) {
  const response = await fetch(`http://127.0.0.1:${state.port}/rpc`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 1, environmentId, method, params }), signal: AbortSignal.timeout(15000),
  });
  const value = await response.json();
  if (!response.ok || value.error) throw new Error(method + ': ' + (value.error?.message ?? value.error ?? response.status));
  return value.result;
}
try {
  const tasks = await call('tasks.list');
  const backup = join(dir, 'backups', 'autonomy-tasks-' + Date.now());
  mkdirSync(backup, { recursive: true, mode: 0o700 });
  writeFileSync(join(backup, 'tasks.json'), JSON.stringify(tasks, null, 2), { mode: 0o600 });
  const routine = new Set(['qibla', 'calendar', 'daily', 'dhikr', 'guides']);
  const goalRows = db.prepare('SELECT value FROM goals').all().map(r => JSON.parse(r.value));
  let edited = 0;
  for (const task of tasks) {
    if (task.status !== 'queued' || task.goalId !== '72610961-96d6-47ea-9d6e-bf592e49f8ce') continue;
    const project = db.prepare('SELECT cwd FROM projects WHERE id=?').get(task.projectId);
    const goal = goalRows.find(g => g.id === task.goalId);
    const key = goal?.plan?.tasks?.find(p => p.title === task.title)?.key;
    const original = task.prompt;
    if (original.includes('\n\nOtonom çalışma: Hostun atadığı klasör/dalda çalış.')) continue;
    task.prompt = original.replaceAll(project.cwd, 'the host-assigned project checkout');
    task.prompt += '\n\nOtonom çalışma: Hostun atadığı klasör/dalda çalış. Birleşmiş proje sözleşmelerini yeniden kullan; yalnız görevin gerektirdiği belgeleri oku. Tek ajan kullan. Odaklı kontrolleri değişiklik veya hata olmadıkça tekrar çalıştırma. Geliştirme doğrulaması ile yayın/cihaz kabulünü ayrı tut. Açık kabul engellerini sonuçta belirt.';
    if (routine.has(key)) task.modelSettings = { ...task.modelSettings, reasoningEffort: 'medium' };
    const { status, ...input } = task;
    await call('tasks.save', { task: input });
    console.log('UPDATED_QUEUED', key, task.modelSettings.reasoningEffort);
    edited++;
  }
  console.log('TASKS_UPDATED', edited, 'RUNNING_UNCHANGED', tasks.filter(t => ['running','verifying'].includes(t.status)).length);
  try {
    const current = await call('host.settings.get');
    console.log('HOST_LIMITS', JSON.stringify({ maxRunningTasks: current.maxRunningTasks, dailyAgentMinutes: current.dailyAgentMinutes }));
  } catch { console.log('HOST_LIMITS', 'installed host uses built-in two-task limit'); }
} finally {
  db.prepare('DELETE FROM devices WHERE id=?').run(id);
  db.close();
}
