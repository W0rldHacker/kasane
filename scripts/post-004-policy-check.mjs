import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const experimentRoot = path.join(root, 'experiments', 'post-004');
const manifest = JSON.parse(
  await readFile(path.join(experimentRoot, 'package.json'), 'utf8'),
);
assert.equal(manifest.name, '@kasane/post-004-experiments');
assert.equal(manifest.private, true, 'POST-004 prototypes must remain private');
assert.equal(
  manifest.exports,
  undefined,
  'Experiments must not define exports',
);
assert.equal(manifest.publishConfig, undefined, 'Experiments must not publish');

const core = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
);
assert.deepEqual(core.exports, {
  '.': { types: './dist/index.d.ts', import: './dist/index.js' },
  './standard-schema': {
    types: './dist/standard-schema.d.ts',
    import: './dist/standard-schema.js',
  },
});
assert.equal(
  core.dependencies,
  undefined,
  'Core must retain zero dependencies',
);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await sourceFiles(absolute)));
    else if (entry.isFile() && entry.name.endsWith('.ts'))
      result.push(absolute);
  }
  return result;
}

const runtimeRoots = [
  path.join(experimentRoot, 'src'),
  path.join(experimentRoot, 'scripts'),
];
for (const file of (await Promise.all(runtimeRoots.map(sourceFiles))).flat()) {
  const source = await readFile(file, 'utf8');
  const specifiers = [
    ...source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/gu),
  ].map((match) => match[1]);
  for (const specifier of specifiers) {
    if (specifier.startsWith('.')) continue;
    assert(
      specifier === '@worldhacker/kasane' ||
        specifier === '@worldhacker/kasane-watch' ||
        specifier.startsWith('node:'),
      `POST-004 prototype import is outside public contracts: ${specifier}`,
    );
  }
  for (const forbidden of ['../../src', '../../dist', '@worldhacker/kasane/']) {
    assert(
      !source.includes(forbidden),
      `POST-004 prototype crosses a stable boundary: ${forbidden}`,
    );
  }
}

for (const directory of await readdir(path.join(root, 'packages'), {
  withFileTypes: true,
})) {
  if (!directory.isDirectory()) continue;
  const packagePath = path.join(
    root,
    'packages',
    directory.name,
    'package.json',
  );
  const packageManifest = JSON.parse(await readFile(packagePath, 'utf8'));
  for (const group of [
    'dependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    assert.equal(
      packageManifest[group]?.['@kasane/post-004-experiments'],
      undefined,
      `${packageManifest.name} depends on removable POST-004 experiments`,
    );
  }
}

console.log(
  'POST-004 policy check passed: private removable package, public-only imports, unchanged core exports, and no public package dependency',
);
