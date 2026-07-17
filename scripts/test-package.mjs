import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const workspace = process.cwd();
const npm = process.platform === 'win32' ? process.execPath : 'npm';
const npmArguments =
  process.platform === 'win32'
    ? [
        path.join(
          path.dirname(process.execPath),
          'node_modules/npm/bin/npm-cli.js',
        ),
      ]
    : [];

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd ?? workspace,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${arguments_.join(' ')}`,
        result.stdout,
        result.stderr,
        result.error?.message,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return result.stdout.trim();
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'kasane-package-'));
try {
  const packedOutput = run(npm, [
    ...npmArguments,
    'pack',
    '--ignore-scripts',
    '--json',
    '--pack-destination',
    temporaryRoot,
  ]);
  const packed = JSON.parse(packedOutput)[0];
  if (packed === undefined || typeof packed.filename !== 'string') {
    throw new Error('npm pack did not produce package metadata');
  }

  const paths = new Set(packed.files.map((file) => file.path));
  const required = [
    'LICENSE',
    'README.md',
    'SECURITY.md',
    'dist/index.d.ts',
    'dist/index.js',
    'dist/standard-schema.d.ts',
    'dist/standard-schema.js',
    'package.json',
  ];
  for (const requiredPath of required) {
    if (!paths.has(requiredPath)) {
      throw new Error(`Packed package is missing ${requiredPath}`);
    }
  }
  for (const packedPath of paths) {
    if (
      packedPath !== 'package.json' &&
      packedPath !== 'README.md' &&
      packedPath !== 'LICENSE' &&
      packedPath !== 'SECURITY.md' &&
      !packedPath.startsWith('dist/')
    ) {
      throw new Error(`Unexpected packed file: ${packedPath}`);
    }
  }

  const consumer = path.join(temporaryRoot, 'consumer');
  await mkdir(consumer);
  await writeFile(
    path.join(consumer, 'package.json'),
    `${JSON.stringify({ name: 'kasane-package-consumer', private: true, type: 'module' }, null, 2)}\n`,
  );
  const tarball = path.join(temporaryRoot, packed.filename);
  run(
    npm,
    [
      ...npmArguments,
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      tarball,
    ],
    { cwd: consumer },
  );

  const consumerSource = `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { kasane } from 'kasane';
import { isStandardSchemaV1 } from 'kasane/standard-schema';

assert.equal(typeof kasane, 'function');
assert.equal(typeof isStandardSchemaV1, 'function');
assert.equal(typeof (await import('kasane')).kasane, 'function');

for (const specifier of [
  'kasane/dist/index.js',
  'kasane/internal',
  'kasane/snapshot/public',
  'kasane/src/index.js',
  'kasane/watch',
]) {
  await assert.rejects(
    import(specifier),
    (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  );
}

const require = createRequire(import.meta.url);
assert.throws(
  () => require('kasane'),
  (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
);
`;
  const consumerEntry = path.join(consumer, 'index.mjs');
  await writeFile(consumerEntry, consumerSource);
  run(process.execPath, [consumerEntry], { cwd: consumer });

  const installedManifest = JSON.parse(
    await readFile(
      path.join(consumer, 'node_modules/kasane/package.json'),
      'utf8',
    ),
  );
  if (
    installedManifest.dependencies !== undefined &&
    Object.keys(installedManifest.dependencies).length !== 0
  ) {
    throw new Error('Packed package has runtime dependencies');
  }

  console.log(
    `Packed ESM consumer passed on Node ${process.versions.node} (${String(paths.size)} files)`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
