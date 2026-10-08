// One-time, syntax-aware migration. Only UI literals are changed; identifiers,
// commands, paths, user content and provider messages are never translated.
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const apply = process.argv.includes('--apply');
const uiProps = new Set(['title', 'label', 'description', 'placeholder', 'aria-label', 'alt', 'tooltip', 'emptyText', 'heading', 'subtitle', 'actionLabel', 'confirmLabel', 'cancelLabel']);
const catalogPath = 'src/shared/i18n/locales/en.json';
const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, 'utf8')) : {};
const report = [];
function files(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
function jsxWhitespace(raw) {
  raw = raw.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|ldquo|rdquo|lsquo|rsquo);/gi, (_, entity) => {
    const named = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’'};
    if (entity[0] === '#') return String.fromCodePoint(parseInt(entity.slice(entity[1].toLowerCase() === 'x' ? 2 : 1), entity[1].toLowerCase() === 'x' ? 16 : 10));
    return named[entity.toLowerCase()];
  });
  const lines = raw.replace(/\r/g, '').split('\n');
  let last = -1;
  lines.forEach((line, i) => { if (/[^ \t]/.test(line)) last = i; });
  return lines.map((line, i) => {
    line = line.replace(/\t/g, ' ');
    if (i !== 0) line = line.replace(/^ +/, '');
    if (i !== lines.length - 1) line = line.replace(/ +$/, '');
    return line ? line + (i !== last ? ' ' : '') : '';
  }).join('');
}
for (const file of files('src').filter(f => (f.endsWith('.tsx') || f === path.join('src', 'features', 'settings', 'model', 'settings.ts')) && !f.includes('.test.') && !f.includes(path.join('shared', 'i18n')))) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes('shared/i18n') || source.includes('/i18n"')) continue;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  const textOf = node => source.slice(node.getStart(tree), node.end);
  const add = (node, replacement) => edits.push({start: node.getStart(tree), end: node.end, replacement});
  function translate(node) {
    let key, values = [];
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) key = node.text;
    else if (ts.isTemplateExpression(node)) {
      key = node.head.text;
      node.templateSpans.forEach((span, i) => { key += `{p${i}}` + span.literal.text; values.push(`p${i}: ${textOf(span.expression)}`); });
    } else return null;
    if (!/[A-Za-z]{2}/.test(key) || /^(?:https?:|\/|#[0-9a-f]+$)/i.test(key)) return null;
    catalog[key] = key;
    return `t(${JSON.stringify(key)}${values.length ? ', { ' + values.join(', ') + ' }' : ''})`;
  }
  function visibleExpression(node) {
    const translated = translate(node);
    if (translated) { add(node, translated); return; }
    if (ts.isConditionalExpression(node)) { visibleExpression(node.whenTrue); visibleExpression(node.whenFalse); }
    else if (ts.isParenthesizedExpression(node)) visibleExpression(node.expression);
    else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(node.operatorToken.kind)) visibleExpression(node.right);
  }
  function visit(node) {
    if (ts.isJsxText(node)) {
      const key = jsxWhitespace(node.text);
      if (/[A-Za-z]{2}/.test(key)) {
        catalog[key] = key;
        edits.push({start: node.pos, end: node.end, replacement: `{t(${JSON.stringify(key)})}`});
      }
      return;
    }
    if (ts.isJsxAttribute(node) && uiProps.has(node.name.text) && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) {
        const translated = translate(node.initializer);
        if (translated) add(node.initializer, `{${translated}}`);
      } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) visibleExpression(node.initializer.expression);
      return;
    }
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      visibleExpression(node.expression);
    }
    if (ts.isPropertyAssignment(node) && uiProps.has(node.name.getText(tree).replace(/["']/g, ''))) {
      const translated = translate(node.initializer);
      if (translated) {
        // A getter keeps module-level option/search metadata live across a switch.
        add(node, `get ${node.name.getText(tree)}() { return ${translated}; }`);
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (!edits.length) continue;
  function components(node) {
    let name;
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) name = node.name?.text;
    else if (ts.isArrowFunction(node) && ts.isVariableDeclaration(node.parent)) name = node.parent.name.getText(tree);
    if (name && /^[A-Z]/.test(name) && node.body && ts.isBlock(node.body)) {
      edits.push({start: node.body.getStart(tree) + 1, end: node.body.getStart(tree) + 1, replacement: '\n  useLocale();'});
    }
    ts.forEachChild(node, components);
  }
  components(tree);
  const hook = edits.some(e => e.replacement.includes('useLocale();'));
  const relative = path.relative(path.dirname(file), 'src/shared/i18n').replaceAll('\\', '/');
  const modulePath = relative.startsWith('.') ? relative : './' + relative;
  let result = source;
  // Skip nested edits covered by a translated template/attribute.
  const kept = edits.filter(e => !edits.some(other => other !== e && other.start <= e.start && other.end >= e.end && other.end > other.start && (other.start < e.start || other.end > e.end)));
  for (const e of kept.sort((a,b) => b.start - a.start)) result = result.slice(0,e.start) + e.replacement + result.slice(e.end);
  result = `import { t${hook ? ', useLocale' : ''} } from "${modulePath}";\n` + result;
  if (apply) fs.writeFileSync(file, result);
  report.push({file, changes: kept.length});
}
fs.writeFileSync('src/shared/i18n/locales/en.json', JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({files: report.length, messages: Object.keys(catalog).length, applied: apply}));
