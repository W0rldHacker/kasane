import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export const companionPackages = Object.freeze({
  'source-testkit': Object.freeze({
    directory: 'source-testkit',
    name: '@worldhacker/kasane-source-testkit',
  }),
  watch: Object.freeze({
    directory: 'watch',
    name: '@worldhacker/kasane-watch',
  }),
});

function commandFor(name) {
  if (process.platform !== 'win32') return { command: name, prefix: [] };
  if (name === 'pnpm') {
    return {
      command: process.execPath,
      prefix: [
        path.join(
          path.dirname(process.execPath),
          'node_modules',
          'corepack',
          'dist',
          'pnpm.js',
        ),
      ],
    };
  }
  if (name === 'npm') {
    return {
      command: process.execPath,
      prefix: [
        path.join(
          path.dirname(process.execPath),
          'node_modules',
          'npm',
          'bin',
          'npm-cli.js',
        ),
      ],
    };
  }
  return { command: name, prefix: [] };
}

export function run(commandName, arguments_, options = {}) {
  const resolved = commandFor(commandName);
  const result = spawnSync(
    resolved.command,
    [...resolved.prefix, ...arguments_],
    {
      encoding: 'utf8',
      stdio: 'pipe',
      ...options,
    },
  );
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `${commandName} ${arguments_.join(' ')} failed\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  );
  return result;
}

export function resolveCompanion(workspace, selector) {
  const selected = companionPackages[selector];
  assert(
    selected,
    `Unknown companion package ${String(selector)}; use source-testkit or watch`,
  );
  return Object.freeze({
    ...selected,
    root: path.join(workspace, 'packages', selected.directory),
    selector,
  });
}

export async function readCompanionManifest(companion) {
  const manifest = JSON.parse(
    await readFile(path.join(companion.root, 'package.json'), 'utf8'),
  );
  assert.equal(manifest.name, companion.name);
  return manifest;
}

export function sha256(source) {
  return createHash('sha256').update(source).digest('hex');
}

export async function packCompanion(companion, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  const before = new Set(await readdir(outputDirectory));
  run('pnpm', ['pack', '--json', '--pack-destination', outputDirectory], {
    cwd: companion.root,
  });
  const archives = (await readdir(outputDirectory)).filter(
    (file) => file.endsWith('.tgz') && !before.has(file),
  );
  assert.equal(
    archives.length,
    1,
    'Expected exactly one new companion archive',
  );
  return path.join(outputDirectory, archives[0]);
}

export async function auditCompanionTarball(tarball, expectedManifest) {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'kasane-companion-audit-'),
  );
  try {
    const entries = run('tar', ['-tzf', tarball])
      .stdout.split(/\r?\n/u)
      .filter(Boolean)
      .map((entry) => entry.replace(/^package\//u, ''))
      .sort();
    for (const required of [
      'LICENSE',
      'README.md',
      'dist/index.d.ts',
      'dist/index.js',
      'package.json',
    ]) {
      assert(
        entries.includes(required),
        `Packed package is missing ${required}`,
      );
    }
    for (const entry of entries) {
      assert(
        /^(?:LICENSE|README\.md|package\.json|dist\/.+\.(?:d\.ts|js))$/u.test(
          entry,
        ),
        `Unexpected companion package file: ${entry}`,
      );
    }

    run('tar', ['-xzf', tarball, '-C', temporaryRoot]);
    const packedRoot = path.join(temporaryRoot, 'package');
    const packedManifest = JSON.parse(
      await readFile(path.join(packedRoot, 'package.json'), 'utf8'),
    );
    assert.equal(packedManifest.name, expectedManifest.name);
    assert.equal(packedManifest.version, expectedManifest.version);
    assert.equal(packedManifest.type, 'module');
    assert.equal(packedManifest.engines?.node, '>=22');
    assert.equal(
      packedManifest.peerDependencies?.['@worldhacker/kasane'],
      '>=1.0.0 <2',
    );
    if (expectedManifest.private === true) {
      assert.equal(
        packedManifest.private,
        true,
        'Private companion template became publishable',
      );
      assert.equal(
        packedManifest.publishConfig,
        undefined,
        'Private companion template must not define publishConfig',
      );
    } else {
      assert.notEqual(
        packedManifest.private,
        true,
        'Public companion became private',
      );
      assert.equal(packedManifest.publishConfig?.access, 'public');
      assert.equal(packedManifest.publishConfig?.provenance, true);
    }
    for (const lifecycle of [
      'preinstall',
      'install',
      'postinstall',
      'prepare',
      'prepublish',
    ]) {
      assert(
        packedManifest.scripts?.[lifecycle] === undefined,
        `Packed package has forbidden lifecycle script: ${lifecycle}`,
      );
    }
    const rootExport = packedManifest.exports?.['.'];
    assert.equal(rootExport?.types, './dist/index.d.ts');
    assert.equal(rootExport?.import, './dist/index.js');
    for (const [specifier, target] of Object.entries(
      packedManifest.exports ?? {},
    )) {
      assert.equal(
        typeof target?.types,
        'string',
        `${specifier} is missing a types target`,
      );
      assert.equal(
        typeof target?.import,
        'string',
        `${specifier} is missing an import target`,
      );
      for (const exported of [target.types, target.import]) {
        assert(
          entries.includes(exported.replace(/^\.\//u, '')),
          `${specifier} export target is missing from the tarball: ${exported}`,
        );
      }
    }
    assert.equal(packedManifest.dependencies, undefined);

    const packedSources = await Promise.all(
      entries
        .filter((entry) => entry.endsWith('.js') || entry.endsWith('.d.ts'))
        .map((entry) => readFile(path.join(packedRoot, entry), 'utf8')),
    );
    const joined = packedSources.join('\n');
    for (const forbidden of [
      '@worldhacker/kasane/dist',
      '@worldhacker/kasane/internal',
      '@worldhacker/kasane/src',
    ]) {
      assert(
        !joined.includes(forbidden),
        `Packed output contains ${forbidden}`,
      );
    }
    for (const [label, pattern] of [
      ['private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/u],
      ['npm access token', /\bnpm_[A-Za-z0-9]{36,}\b/u],
      ['GitHub access token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/u],
      ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u],
    ]) {
      assert(!pattern.test(joined), `Packed output contains ${label}`);
    }

    const bytes = await readFile(tarball);
    return Object.freeze({
      bytes,
      digest: sha256(bytes),
      entries: Object.freeze(entries),
      manifest: packedManifest,
    });
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}
