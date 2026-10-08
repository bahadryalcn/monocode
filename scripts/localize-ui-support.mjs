// Explicitly selected application-owned UI helpers, never provider protocols.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const targets = [
  'src/app/model/appLifecycle.ts', 'src/app/model/updater.ts',
  'src/features/notifications/model/notificationEvents.ts',
  'src/features/sessions/model/backgroundStop.ts',
  'src/features/settings/model/appearance.ts',
  'src/features/sessions/model/sessionFolderCommand.ts',
  'src/features/sessions/model/resumeCommand.ts',
  'src/features/sessions/model/orchestratorCommand.ts',
  'src/features/sessions/model/operatorCommand.ts',
  'src/features/sessions/model/mcpCommand.ts',
  'src/features/sessions/model/draftCommand.ts',
  'src/features/sessions/model/compact.ts',
  'src/features/sessions/model/btw.ts',
];
const props = new Set(['title', 'label', 'description', 'okLabel', 'cancelLabel']);
for (const file of targets) {
  const code = fs.readFileSync(file, 'utf8');
  if (code.includes('shared/i18n')) continue;
  const tree = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const edits = [];
  function translation(node) {
    let key, values = [];
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) key = node.text;
    else if (ts.isTemplateExpression(node)) {
      key = node.head.text;
      node.templateSpans.forEach((span,i) => { key += `{p${i}}` + span.literal.text; values.push(`p${i}: ${span.expression.getText(tree)}`); });
    } else return null;
    return `t(${JSON.stringify(key)}${values.length ? ', { ' + values.join(', ') + ' }' : ''})`;
  }
  function visit(node) {
    if (ts.isPropertyAssignment(node) && props.has(node.name.getText(tree))) {
      const value = translation(node.initializer);
      if (value) { edits.push({start: node.getStart(tree), end: node.end, value: `get ${node.name.getText(tree)}() { return ${value}; }`}); return; }
    }
    if (ts.isCallExpression(node) && ['ask', 'message'].includes(node.expression.getText(tree))) {
      const value = node.arguments[0] && translation(node.arguments[0]);
      if (value) edits.push({start: node.arguments[0].getStart(tree), end: node.arguments[0].end, value});
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (!edits.length) continue;
  let result = code;
  for (const edit of edits.sort((a,b) => b.start - a.start)) result = result.slice(0,edit.start) + edit.value + result.slice(edit.end);
  const relative = path.relative(path.dirname(file), 'src/shared/i18n').replaceAll('\\', '/');
  fs.writeFileSync(file, `import { t } from "${relative}";\n` + result);
}
