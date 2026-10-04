import datetime
import pathlib
import re
import shutil
import sys

home = pathlib.Path.home()
stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
backup = home / '.monocode-host' / 'backups' / ('autonomy-' + stamp)
backup.mkdir(parents=True, exist_ok=True)
block = '''<!-- monocode-autonomy:start -->
## Unattended MonoCode tasks

For host-started tasks, goal planners, stewards and their reviewers, use these rules in preference to generic workflow defaults:
- Work in the folder and branch assigned by the host, including an existing host-managed worktree. Do not create another worktree, switch to main, or edit the integration checkout. The host owns task commits and approved merges. Preserve dirty work. This does not authorize pushes, external publication, production changes or destructive cleanup.
- A task prompt is the spec. Do not set up issue trackers or ask for a separate spec when the host has supplied one. Perform authorized local work autonomously; report a concrete blocker when required access or user information is missing.
- Use one agent per task/review by default. Review both standards and task correctness yourself. Do not invoke the multi-agent review skill or spawn nested reviewers unless the user explicitly requests delegation for this task.
- Inspect Git state, then read only relevant files and guidance. Reuse the project's existing contracts and verified environment facts. Foundation discovery is optional when those already establish the affected stack; do not initialize metadata during a read-only review.
- Keep tool output bounded: request relevant sections or extracted facts, normally at most 4000 tokens per call. Index large documents once and return focused answers; do not print full documents after indexing them. Fetch more only to resolve a specific uncertainty.
- Run meaningful focused checks once. Repeat after a relevant edit, a failure, or an unresolved concern. Do not rerun the same test through several command aliases just to restate success. An independent reviewer may verify the worker's claims once.
- Keep development builds/tests usable while enforcing publishing restrictions separately. Do not turn an ordinary development command into a release gate without an explicit requirement.
- Preserve the assigned model. Routine work uses medium reasoning; raise effort only for difficult diagnosis, security, data migration or architecture. Do not change a task's explicitly assigned effort.
- Do not refresh token-usage reports on every unattended turn, launch visible terminals, or add setup chores unrelated to the deliverable. Usage reporting is on request or handled by the host summary.
- Finish with the delivered files, checks and concrete open blockers. Separate local implementation from simulator, physical-device and release acceptance; never claim unavailable acceptance passed.
<!-- monocode-autonomy:end -->
'''
for rel in ['.codex/AGENTS.md', '.claude/CLAUDE.md']:
    p = home / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists():
        shutil.copy2(p, backup / (p.parent.name + '-' + p.name))
        tx = p.read_text(encoding='utf-8')
    else:
        tx = ''
    tx = re.sub(r'\n?<!-- monocode-autonomy:start -->.*?<!-- monocode-autonomy:end -->\n?', '\n', tx, flags=re.S)
    if sys.platform == 'darwin':
        tx = tx.replace('Run `python3 -B /Users/bahadryalcn/projects/agent-foundation/', 'Run `/opt/homebrew/bin/python3.12 -B /Users/bahadryalcn/projects/agent-foundation/')
    p.write_text(tx.rstrip() + '\n\n' + block, encoding='utf-8')
    print('UPDATED', p, 'bytes', p.stat().st_size)
print('BACKUP', backup)
