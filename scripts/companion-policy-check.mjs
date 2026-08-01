import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const readJson = async (file) =>
  JSON.parse(await readFile(path.join(root, file), 'utf8'));
const [core, testkit, template, watch, cli, changesets] = await Promise.all([
  readJson('package.json'),
  readJson('packages/source-testkit/package.json'),
  readJson('packages/companion-template/package.json'),
  readJson('packages/watch/package.json'),
  readJson('packages/cli/package.json'),
  readJson('.changeset/config.json'),
]);

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
assert.equal(testkit.name, '@worldhacker/kasane-source-testkit');
assert.notEqual(testkit.private, true, 'Source testkit must be publishable');
assert.equal(template.private, true, 'Copyable template must not be published');
assert.equal(watch.name, '@worldhacker/kasane-watch');
assert.notEqual(watch.private, true, 'Watch companion must be publishable');
assert.equal(cli.name, '@worldhacker/kasane-cli');
assert.notEqual(cli.private, true, 'CLI companion must be publishable');
assert.deepEqual(cli.bin, { kasane: './dist/bin.js' });
for (const manifest of [testkit, template, watch, cli]) {
  assert.equal(
    manifest.peerDependencies?.['@worldhacker/kasane'],
    '>=1.0.0 <2',
  );
  assert.equal(
    manifest.dependencies,
    undefined,
    `${manifest.name} has runtime dependencies`,
  );
}
assert.deepEqual(
  changesets.fixed,
  [],
  'Companion packages need separate release groups',
);
assert.deepEqual(
  changesets.linked,
  [],
  'Companion versions must not be linked',
);
assert.equal(
  changesets.___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH
    ?.onlyUpdatePeerDependentsWhenOutOfRange,
  true,
  'Core releases must preserve compatible companion peer ranges',
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

const sourceRoots = [
  path.join(root, 'packages', 'source-testkit', 'src'),
  path.join(root, 'packages', 'companion-template', 'src'),
  path.join(root, 'packages', 'watch', 'src'),
  path.join(root, 'packages', 'cli', 'src'),
];
const runtimeFiles = (await Promise.all(sourceRoots.map(sourceFiles))).flat();
for (const file of runtimeFiles) {
  const source = await readFile(file, 'utf8');
  const sourceRoot = sourceRoots.find(
    (candidate) =>
      file === candidate || file.startsWith(`${candidate}${path.sep}`),
  );
  assert(sourceRoot, `Could not resolve companion source root for ${file}`);
  const specifiers = [
    ...source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/gu),
  ].map((match) => match[1]);
  for (const specifier of specifiers) {
    if (specifier.startsWith('.')) {
      const resolved = path.resolve(path.dirname(file), specifier);
      assert(
        resolved.startsWith(`${sourceRoot}${path.sep}`),
        `Companion runtime import escapes its package: ${specifier} in ${path.relative(root, file)}`,
      );
    } else {
      assert(
        specifier === '@worldhacker/kasane' || specifier.startsWith('node:'),
        `Companion runtime import is not a public core contract: ${specifier} in ${path.relative(root, file)}`,
      );
    }
  }
  for (const forbidden of [
    '@worldhacker/kasane/',
    '../../src',
    '../../dist',
    'merge(',
    'registerLayerSourceMetadata',
  ]) {
    assert(
      !source.includes(forbidden),
      `Companion runtime crosses the core boundary: ${forbidden} in ${path.relative(root, file)}`,
    );
  }
}

console.log(
  `Companion policy check passed: public testkit/watch/CLI packages, private template, independent release groups, stable compatible peer ranges, zero core dependencies, and ${runtimeFiles.length} public-contract source files`,
);
