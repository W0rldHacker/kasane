import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { auditTarball, loadAllowlist, pack } from './check-tarball.mjs';

const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), 'kasane-package-tests-'),
);
const allowlist = await loadAllowlist();

function manifest(overrides = {}) {
  return {
    name: '@w0rldhacker/kasane',
    version: '1.0.0-test.0',
    type: 'module',
    sideEffects: false,
    engines: { node: '>=22' },
    types: './dist/index.d.ts',
    exports: allowlist.exports,
    files: ['**/*'],
    publishConfig: { access: 'public', provenance: true },
    repository: {
      type: 'git',
      url: 'git+https://github.com/W0rldHacker/kasane.git',
    },
    devDependencies: { 'fixture-only-dev-dependency': '1.0.0' },
    ...overrides,
  };
}

async function fixture(name, options = {}) {
  const directory = path.join(temporaryRoot, name);
  await mkdir(path.join(directory, 'dist'), { recursive: true });
  const files = {
    LICENSE: 'MIT\n',
    'README.md': '# Fixture\n',
    'SECURITY.md': '# Security\n',
    'dist/index.d.ts': 'export declare const kasane: unknown;\n',
    'dist/index.js': 'export const kasane = true;\n',
    'dist/standard-schema.d.ts':
      'export declare const isStandardSchemaV1: unknown;\n',
    'dist/standard-schema.js': 'export const isStandardSchemaV1 = true;\n',
    ...options.files,
  };
  for (const [relative, source] of Object.entries(files)) {
    if (options.omit?.includes(relative)) continue;
    const destination = path.join(directory, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, source);
  }
  await writeFile(
    path.join(directory, 'package.json'),
    `${JSON.stringify(manifest(options.manifest), null, 2)}\n`,
  );
  const tarball = path.join(temporaryRoot, `${name}.tgz`);
  await pack(directory, tarball);
  return tarball;
}

async function rejects(name, expected, options) {
  const tarball = await fixture(name, options);
  await assert.rejects(() => auditTarball(tarball, allowlist), expected);
}

try {
  await auditTarball(await fixture('valid'), allowlist);
  await rejects(
    'forbidden-file',
    /Unexpected packed file: coverage\/report\.json/u,
    {
      files: { 'coverage/report.json': '{"private":true}\n' },
    },
  );
  await rejects('missing-readme', /Missing required file: README\.md/u, {
    omit: ['README.md'],
  });
  await rejects('broken-type-export', /Packed exports differ/u, {
    manifest: {
      exports: {
        ...allowlist.exports,
        '.': {
          types: './dist/missing.d.ts',
          import: './dist/index.js',
        },
      },
    },
  });
  await rejects(
    'source-map-secret',
    /npm access token in dist\/index\.js\.map/u,
    {
      files: {
        'dist/index.js.map':
          '{"version":3,"sourcesContent":["npm_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ"]}\n',
      },
    },
  );
  await rejects('install-script', /forbidden lifecycle script: install/u, {
    manifest: { scripts: { install: 'node install.js' } },
  });
  console.log(
    'Tarball negative tests passed: forbidden file, missing README, broken types, source-map secret, and install script',
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
