import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = path.resolve('dist/index.js');
const declarations = path.resolve('dist/index.d.ts');
const standardSchemaEntry = path.resolve('dist/standard-schema.js');
const standardSchemaDeclarations = path.resolve('dist/standard-schema.d.ts');

await access(entry);
await access(declarations);
await access(standardSchemaEntry);
await access(standardSchemaDeclarations);

const source = await readFile(entry, 'utf8');
for (const commonJsMarker of ['module.exports', 'require(', 'exports.']) {
  if (source.includes(commonJsMarker)) {
    throw new Error(`Build contains CommonJS marker: ${commonJsMarker}`);
  }
}

await import(`${pathToFileURL(entry).href}?build-check=${Date.now()}`);
await import(
  `${pathToFileURL(standardSchemaEntry).href}?build-check=${Date.now()}`
);
console.log('ESM build check passed');
