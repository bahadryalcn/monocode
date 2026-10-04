import json
import pathlib
import shutil

root = pathlib.Path.home() / 'projects/monocode-build-0.8.62-auto-merge'
assert not root.exists()
shutil.copytree(root.with_name('monocode-build-0.8.62'), root, symlinks=True,
                ignore=shutil.ignore_patterns('target', 'dist', 'build', '.git'))
snippets = json.loads(pathlib.Path('/tmp/annem-auto-merge-snippets.json').read_text(encoding='utf-8-sig'))
def replace(source, before, after):
    assert source.count(before) == 1, before
    return source.replace(before, after)
p = root / 'src/features/tasks/model/hostTasks.ts'
s = p.read_text()
s = replace(s, '  review?: boolean;', '  review?: boolean;\n  autoMerge?: boolean;')
s = replace(s, '  merged?: boolean;', '  merged?: boolean;\n  autoMerged?: boolean;\n  mergedAt?: number;')
s = replace(s, '(v.review !== undefined && typeof v.review !== "boolean")', '(v.review !== undefined && typeof v.review !== "boolean") ||\n    (v.autoMerge !== undefined && typeof v.autoMerge !== "boolean")')
s = replace(s, '    review: v.review !== false,', '    review: v.review !== false,\n    ...(v.autoMerge === true ? { autoMerge: true } : {}),')
p.write_text(s + '\n' + snippets['blocker'])
p = root / 'host/tasks.ts'
s = p.read_text()
s = replace(s, '  canEditTask,', '  autoMergeBlocker,\n  canEditTask,')
s = replace(s, 'const { verifyCommand, ...kept } = previous;', 'const { verifyCommand, autoMerge, ...kept } = previous;')
s = replace(s, '        mergeError,', '        mergeError,\n        autoMerged,\n        mergedAt,')
s = replace(s, 'if (latest) this.enterReview({ ...latest, verification, diffStat });', 'if (latest) await this.enterReview({ ...latest, verification, diffStat });')
s = replace(s, '      this.enterReview({ ...latest, verification, diffStat });', '      await this.enterReview({ ...latest, verification, diffStat });')
begin = s.index('  private enterReview(')
end = s.index('  /** What the task branch', begin)
s = s[:begin] + snippets['enterReview'] + s[end:]
s = replace(s, 'private async deliver(task: HostTask): Promise<HostTask>', 'private async deliver(task: HostTask, auto = false): Promise<HostTask>')
s = replace(s, '        merged: true,', '        merged: true,\n        mergedAt: now,\n        ...(auto ? { autoMerged: true } : {}),')
p.write_text(s)
p = root / 'host/tasks.test.ts'
p.write_text(p.read_text() + '\n' + snippets['tests'])
print('Prepared isolated source:', root)
