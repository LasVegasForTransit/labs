import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

const requiredScripts = ['dev', 'build', 'build:archive', 'test', 'test:e2e'] as const;

interface PackageJson {
  scripts?: Record<string, string>;
}

export function validateApplicationPackage(_slug: string, packageJson: PackageJson): string[] {
  return requiredScripts.filter((script) => packageJson.scripts?.[script] === undefined);
}

function owningApplication(file: string): string | null {
  const normalized = file.split(path.sep).join('/');
  const match = /^apps\/([^/]+)\//.exec(normalized);
  return match?.[1] ?? null;
}

export function validateWorkspaceImport(sourceFile: string, specifier: string): string | null {
  const sourceApplication = owningApplication(sourceFile);
  if (sourceApplication === null) return null;

  let targetApplication: string | null;
  if (specifier.startsWith('.')) {
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(sourceFile), specifier),
    );
    targetApplication = owningApplication(resolved);
  } else {
    const match = /^@lvbt\/lab-([^/]+)(?:\/|$)/.exec(specifier);
    targetApplication = match?.[1] ?? null;
  }

  if (targetApplication !== null && targetApplication !== sourceApplication) {
    return `Application ${sourceApplication} must not import application ${targetApplication}.`;
  }
  return null;
}

function typescriptImports(source: string, file: string): string[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const imports: string[] = [];

  function visit(node: ts.Node): void {
    const dynamicImportArgument = ts.isCallExpression(node) ? node.arguments[0] : undefined;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      dynamicImportArgument !== undefined &&
      ts.isStringLiteral(dynamicImportArgument)
    ) {
      imports.push(dynamicImportArgument.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(absolutePath)));
    else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) files.push(absolutePath);
  }
  return files;
}

export async function inspectWorkspace(root: string): Promise<string[]> {
  const failures: string[] = [];
  const appsDirectory = path.join(root, 'apps');
  const entries = await readdir(appsDirectory, { withFileTypes: true });

  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const appDirectory = path.join(appsDirectory, entry.name);
    const packageJson = JSON.parse(
      await readFile(path.join(appDirectory, 'package.json'), 'utf8'),
    ) as PackageJson;
    const missingScripts = validateApplicationPackage(entry.name, packageJson);
    if (missingScripts.length > 0) {
      failures.push(`${entry.name} is missing scripts: ${missingScripts.join(', ')}.`);
    }

    for (const file of await sourceFiles(path.join(appDirectory, 'src'))) {
      const source = await readFile(file, 'utf8');
      const relativeFile = path.relative(root, file).split(path.sep).join('/');
      for (const specifier of typescriptImports(source, relativeFile)) {
        const failure = validateWorkspaceImport(relativeFile, specifier);
        if (failure !== null) failures.push(`${relativeFile}: ${failure}`);
      }
    }
  }

  return failures;
}
