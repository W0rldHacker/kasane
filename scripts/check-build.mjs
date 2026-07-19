import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

const workspace = process.cwd();
const manifest = JSON.parse(
  await readFile(path.resolve('package.json'), 'utf8'),
);

if (manifest.type !== 'module') throw new Error('Package must be ESM-only');
if (manifest.sideEffects !== false) {
  throw new Error('Package must declare sideEffects: false');
}
if (manifest.main !== undefined || manifest.module !== undefined) {
  throw new Error('main/module fields must not compete with package exports');
}
if (manifest.engines?.node !== '>=22') {
  throw new Error('Supported Node.js engine must be >=22');
}
if (
  manifest.dependencies !== undefined &&
  Object.keys(manifest.dependencies).length !== 0
) {
  throw new Error('Runtime dependencies are not allowed without an ADR');
}

const exportNames = Object.keys(manifest.exports ?? {});
if (
  exportNames.length !== 2 ||
  exportNames[0] !== '.' ||
  exportNames[1] !== './standard-schema'
) {
  throw new Error('Supported exports must be exactly . and ./standard-schema');
}

const expectedFiles = [
  'dist/**/*.js',
  'dist/**/*.d.ts',
  'LICENSE',
  'README.md',
  'SECURITY.md',
];
if (JSON.stringify(manifest.files) !== JSON.stringify(expectedFiles)) {
  throw new Error(
    `Package files whitelist must be ${expectedFiles.join(', ')}`,
  );
}

async function allFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry_ of entries) {
    const absolute = path.join(directory, entry_.name);
    if (entry_.isDirectory()) files.push(...(await allFiles(absolute)));
    else files.push(absolute);
  }
  return files;
}

for (const conditions of Object.values(manifest.exports)) {
  if (typeof conditions !== 'object' || conditions === null) {
    throw new Error('Every export must define types and import conditions');
  }
  const conditionNames = Object.keys(conditions);
  if (
    conditionNames.length !== 2 ||
    conditionNames[0] !== 'types' ||
    conditionNames[1] !== 'import'
  ) {
    throw new Error('Every export must order types before import');
  }
  for (const target of Object.values(conditions)) {
    if (typeof target !== 'string' || !target.startsWith('./dist/')) {
      throw new Error(`Invalid public export target: ${String(target)}`);
    }
    await access(path.resolve(target));
  }
}

const entry = path.resolve('dist/index.js');
const declarations = path.resolve('dist/index.d.ts');
const standardSchemaEntry = path.resolve('dist/standard-schema.js');
const standardSchemaDeclarations = path.resolve('dist/standard-schema.d.ts');

await access(entry);
await access(declarations);
await access(standardSchemaEntry);
await access(standardSchemaDeclarations);

const emittedFiles = await allFiles(path.resolve('dist'));
for (const emittedFile of emittedFiles) {
  const relative = path.relative(workspace, emittedFile).replaceAll('\\', '/');
  if (emittedFile.endsWith('.ts') && !emittedFile.endsWith('.d.ts')) {
    throw new Error(`Source tree leaked into build output: ${relative}`);
  }
  if (!emittedFile.endsWith('.js') && !emittedFile.endsWith('.d.ts')) continue;

  const source = await readFile(emittedFile, 'utf8');
  if (emittedFile.endsWith('.js')) {
    const syntax = ts.createSourceFile(
      emittedFile,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    function rejectCommonJs(node) {
      if (
        (ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'require') ||
        (ts.isIdentifier(node) && node.text === 'exports') ||
        (ts.isPropertyAccessExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'module' &&
          node.name.text === 'exports')
      ) {
        throw new Error(`Build contains CommonJS syntax: ${relative}`);
      }
      ts.forEachChild(node, rejectCommonJs);
    }
    rejectCommonJs(syntax);
  }

  const imports = ts.preProcessFile(source, true, true).importedFiles;
  for (const imported of imports) {
    if (
      imported.fileName.startsWith('.') &&
      !imported.fileName.endsWith('.js')
    ) {
      throw new Error(
        `Relative emitted import is missing .js: ${imported.fileName} in ${relative}`,
      );
    }
  }

  const mapPath = `${emittedFile}.map`;
  await access(mapPath);
  const map = JSON.parse(await readFile(mapPath, 'utf8'));
  if (
    map.version !== 3 ||
    !Array.isArray(map.sources) ||
    map.sources.length === 0
  ) {
    throw new Error(`Invalid source map: ${path.relative(workspace, mapPath)}`);
  }
  if (!source.includes(`sourceMappingURL=${path.basename(mapPath)}`)) {
    throw new Error(
      `Emitted file does not reference its source map: ${relative}`,
    );
  }
}

await import(`${pathToFileURL(entry).href}?build-check=${Date.now()}`);
await import(
  `${pathToFileURL(standardSchemaEntry).href}?build-check=${Date.now()}`
);
console.log('ESM build check passed');
