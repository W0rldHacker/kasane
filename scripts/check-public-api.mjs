import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

const dist = path.resolve('dist');
const reportPath = path.resolve('etc/kasane.api.md');

async function declarationFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await declarationFiles(absolute)));
    else if (entry.name.endsWith('.d.ts')) files.push(absolute);
  }
  return files;
}

function normalizeDeclaration(source) {
  const clean = source
    .replace(/^\/\/# sourceMappingURL=.*$/gmu, '')
    .trim()
    .replaceAll('\r\n', '\n');
  const syntax = ts.createSourceFile(
    'kasane.api.d.ts',
    clean,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  return ts
    .createPrinter({ newLine: ts.NewLineKind.LineFeed })
    .printFile(syntax)
    .trim();
}

const files = await declarationFiles(dist);
const forbiddenFacadeNames = [
  '#private',
  'ConfigSnapshotImplementation',
  'ConfigSnapshotOptions',
  'LayerRegistry',
  'ProvenanceTree',
  'SecretFingerprintIndex',
  'SnapshotRedactor',
  'node_modules',
];
const facadeFiles = new Set([
  path.resolve('dist/index.d.ts'),
  path.resolve('dist/kasane.d.ts'),
  path.resolve('dist/public-types.d.ts'),
  path.resolve('dist/snapshot/public.d.ts'),
  path.resolve('dist/standard-schema.d.ts'),
]);

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const syntax = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  function inspect(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const position = syntax.getLineAndCharacterOfPosition(node.getStart());
      throw new Error(
        `Public declaration contains explicit any: ${path.relative(process.cwd(), file)}:${String(position.line + 1)}`,
      );
    }
    ts.forEachChild(node, inspect);
  }
  inspect(syntax);

  for (const statement of syntax.statements) {
    if (
      (ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith('.') && !specifier.startsWith('node:')) {
        throw new Error(
          `Declaration leaks an external dependency: ${specifier} in ${path.relative(process.cwd(), file)}`,
        );
      }
    }
  }

  if (facadeFiles.has(file)) {
    for (const forbidden of forbiddenFacadeNames) {
      if (source.includes(forbidden)) {
        throw new Error(
          `Public facade leaks private declaration ${forbidden}: ${path.relative(process.cwd(), file)}`,
        );
      }
    }
  }
}

const entry = normalizeDeclaration(
  await readFile(path.resolve('dist/index.d.ts'), 'utf8'),
);
const report = await readFile(reportPath, 'utf8');
const match = report.match(
  /<!-- API-REPORT:START -->\s*```ts\s*([\s\S]*?)\s*```\s*<!-- API-REPORT:END -->/u,
);
if (match?.[1] === undefined) {
  throw new Error('API report markers are missing');
}
if (normalizeDeclaration(match[1]) !== entry) {
  throw new Error(
    'Public API report is stale. Update etc/kasane.api.md intentionally.',
  );
}

console.log(`Public API check passed (${String(files.length)} declarations)`);
