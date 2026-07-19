import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { run } from './check-tarball.mjs';
import { npmTagForVersion, parseVersion } from './release-policy.mjs';

const workspace = process.cwd();
const manifest = JSON.parse(
  await readFile(path.join(workspace, 'package.json'), 'utf8'),
);
const tag = npmTagForVersion(manifest.version);
const packageSpec = `${manifest.name}@${tag}`;
const localTarball = path.join(workspace, `kasane-${manifest.version}.tgz`);

function sha256(source) {
  return createHash('sha256').update(source).digest('hex');
}

async function registryMetadata() {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const version = JSON.parse(
        run('npm', ['view', packageSpec, 'version', '--json']).stdout,
      );
      const tags = JSON.parse(
        run('npm', ['view', manifest.name, 'dist-tags', '--json']).stdout,
      );
      const integrity = JSON.parse(
        run('npm', ['view', packageSpec, 'dist.integrity', '--json']).stdout,
      );
      return { integrity, tags, version };
    } catch (error) {
      lastError = error;
      if (attempt < 6) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
  }
  throw lastError;
}

async function registryPack(temporaryRoot) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      return JSON.parse(
        run('npm', [
          'pack',
          packageSpec,
          '--ignore-scripts',
          '--json',
          '--pack-destination',
          temporaryRoot,
        ]).stdout,
      )[0];
    } catch (error) {
      lastError = error;
      if (attempt < 6) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
  }
  throw lastError;
}

const metadata = await registryMetadata();
assert.equal(
  metadata.version,
  manifest.version,
  `${tag} points to wrong version`,
);
assert.equal(metadata.tags[tag], manifest.version, `Missing ${tag} dist-tag`);
if (parseVersion(manifest.version).prerelease !== null) {
  assert.notEqual(
    metadata.tags.latest,
    manifest.version,
    'Prerelease must not receive latest',
  );
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'kasane-registry-'));
try {
  const packed = await registryPack(temporaryRoot);
  assert(packed?.filename, 'npm pack did not return the registry tarball');
  const [local, registry] = await Promise.all([
    readFile(localTarball),
    readFile(path.join(temporaryRoot, packed.filename)),
  ]);
  const localHash = sha256(local);
  const registryHash = sha256(registry);
  assert.equal(
    registryHash,
    localHash,
    'Registry tarball differs from the workflow artifact',
  );
  console.log(
    `Published release verified: ${packageSpec}, sha256 ${registryHash}, integrity ${String(metadata.integrity)}`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
