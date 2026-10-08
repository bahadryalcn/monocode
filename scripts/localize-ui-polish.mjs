import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
function files(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? files(path.join(dir,e.name)) : [path.join(dir,e.name)]);
}
for (const file of files('src').filter(f => f.endsWith('.tsx') && !f.includes('.test.') && !f.includes(path.join('shared','i18n')))) {
  const code = fs.readFileSync(file,'utf8');
  if (!/import .*\bt\b.*i18n/.test(code)) continue;
  const tree = ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const edits = [];
  let needsLocale = false;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't' && ts.isStringLiteral(node.arguments[0])) {
      let ancestor = node.parent, technical = false;
      while (ancestor) {
        if (ts.isJsxElement(ancestor) && ['code','pre','kbd','samp'].includes(ancestor.openingElement.tagName.getText(tree))) technical = true;
        ancestor = ancestor.parent;
      }
      if (technical || /^(?:~\/|[A-Z_]{3,}$|\{\"mcpServers\"|irm https:|curl -|npm test$|export function$)/.test(node.arguments[0].text)) {
        edits.push({start:node.getStart(tree),end:node.end,value:JSON.stringify(node.arguments[0].text)});
        return;
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't' && ts.isStringLiteral(node.arguments[0]) && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
      const conditional = node.arguments[1].properties.filter(p => ts.isPropertyAssignment(p) && ts.isConditionalExpression(p.initializer) && ts.isStringLiteral(p.initializer.whenTrue) && ts.isStringLiteral(p.initializer.whenFalse));
      if (conditional.length) {
        function expand(index, message) {
          if (index === conditional.length) return JSON.stringify(message);
          const prop = conditional[index], choice = prop.initializer, slot = `{${prop.name.getText(tree)}}`;
          return `(${choice.condition.getText(tree)} ? ${expand(index+1,message.replaceAll(slot,choice.whenTrue.text))} : ${expand(index+1,message.replaceAll(slot,choice.whenFalse.text))})`;
        }
        const rest = node.arguments[1].properties.filter(p => !conditional.includes(p)).map(p => p.getText(tree));
        edits.push({start:node.getStart(tree),end:node.end,value:`t(${expand(0,node.arguments[0].text)}${rest.length ? ', { ' + rest.join(', ') + ' }' : ''})`});
        return;
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ['toLocaleString','toLocaleDateString','toLocaleTimeString'].includes(node.expression.name.text)) {
      const first = node.arguments[0];
      if (!first || first.kind === ts.SyntaxKind.UndefinedKeyword || first.getText(tree) === 'undefined' || (ts.isStringLiteral(first) && ['en','en-US','en-GB'].includes(first.text))) {
        if (first) edits.push({start:first.getStart(tree),end:first.end,value:'getLocale()'});
        else edits.push({start:node.expression.end + 1,end:node.expression.end + 1,value:'getLocale()'});
        needsLocale = true;
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useMemo' && node.arguments[1] && ts.isArrayLiteralExpression(node.arguments[1])) {
      let translated = false;
      function find(child) { if (ts.isCallExpression(child) && child.expression.getText(tree) === 't') translated = true; ts.forEachChild(child,find); }
      find(node.arguments[0]);
      if (translated && !node.arguments[1].getText(tree).includes('getLocale()')) {
        const deps = node.arguments[1];
        edits.push({start:deps.getStart(tree)+1,end:deps.getStart(tree)+1,value:'getLocale(), '});
        needsLocale = true;
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(tree);
  if (!edits.length) continue;
  let result = code;
  for (const edit of edits.sort((a,b) => b.start - a.start)) result = result.slice(0,edit.start) + edit.value + result.slice(edit.end);
  if (needsLocale && !/^import \{[^\n]*\bgetLocale\b/.test(result)) result = result.replace(/^import \{ ([^\n]+) \} from ("[^\n]+i18n");/, 'import { $1, getLocale } from $2;');
  const outputTree = ts.createSourceFile(file,result,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let calls = 0;
  function count(node) { if (ts.isCallExpression(node) && node.expression.getText(outputTree) === 't') calls++; ts.forEachChild(node,count); }
  count(outputTree);
  if (!calls) result = result.replace(/^import \{ t, /,'import { ');
  fs.writeFileSync(file,result);
}
