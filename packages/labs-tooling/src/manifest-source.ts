import ts from 'typescript';

import { validateManifestForDirectory, type LabManifestV1 } from './manifest.js';

function literalValue(node: ts.Expression): unknown {
  if (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node)
  ) {
    return literalValue(node.expression);
  }
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literalValue);
  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(
      properties(node).map((property) => [
        property.name.getText().replace(/^['"]|['"]$/g, ''),
        literalValue(property.initializer),
      ]),
    );
  }
  throw new Error(
    'Lifecycle commands require a literal manifest object; computed values need a manual edit.',
  );
}

function properties(node: ts.ObjectLiteralExpression): ts.PropertyAssignment[] {
  const result: ts.PropertyAssignment[] = [];
  const names = new Set<string>();
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
      throw new Error('Lifecycle commands do not rewrite spreads or computed manifest fields.');
    }
    const name = property.name.getText().replace(/^['"]|['"]$/g, '');
    if (names.has(name)) throw new Error(`Duplicate manifest field: ${name}`);
    names.add(name);
    result.push(property);
  }
  return result;
}

export function parseManifestSource(
  source: string,
  slug: string,
): {
  manifest: LabManifestV1;
  update: (manifest: LabManifestV1) => string;
} {
  const file = ts.createSourceFile('lab.config.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = file.statements.find(ts.isExportAssignment);
  if (declaration === undefined || declaration.isExportEquals) {
    throw new Error('Expected a default-exported manifest object.');
  }
  let expression = declaration.expression;
  while (
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isParenthesizedExpression(expression)
  ) {
    expression = expression.expression;
  }
  if (!ts.isObjectLiteralExpression(expression)) {
    throw new Error('Lifecycle commands require a default-exported literal manifest object.');
  }
  const object = expression;
  const fields = properties(object);
  const manifest = validateManifestForDirectory(literalValue(object), slug);
  return {
    manifest,
    update(next) {
      const edits: { start: number; end: number; text: string }[] = [];
      const additions: string[] = [];
      for (const key of ['status', 'dates', 'lifecycle', 'successor'] as const) {
        if (JSON.stringify(manifest[key]) === JSON.stringify(next[key])) continue;
        const field = fields.find(
          (item) => item.name.getText().replace(/^['"]|['"]$/g, '') === key,
        );
        if (field === undefined) {
          additions.push(`${key}: ${JSON.stringify(next[key])}`);
        } else {
          edits.push({
            start: field.initializer.getStart(file),
            end: field.initializer.end,
            text: JSON.stringify(next[key]),
          });
        }
      }
      if (additions.length > 0) {
        const last = fields.at(-1);
        if (last === undefined) throw new Error('The manifest has no fields.');
        edits.push({ start: last.end, end: last.end, text: `, ${additions.join(', ')}` });
      }
      return edits
        .sort((a, b) => b.start - a.start)
        .reduce(
          (text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end),
          source,
        );
    },
  };
}
