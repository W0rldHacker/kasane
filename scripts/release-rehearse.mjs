import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  auditTarball,
  npmPublishDryRunArgs,
  pack,
  run,
} from './check-tarball.mjs';
import { parseVersion } from './release-policy.mjs';

const workspace = process.cwd();
const manifest = JSON.parse(
  await readFile(path.join(workspace, 'package.json'), 'utf8'),
);
const parsed = parseVersion(String(manifest.version));
const channel = parsed.prerelease?.split('.')[0] ?? 'stable';

if (channel === 'alpha' || channel === 'beta') {
  console.log('Stable publish rehearsal is pending the RC version commit');
  process.exit(0);
}

assert(
  channel === 'rc' || channel === 'stable',
  `Unsupported release rehearsal channel: ${channel}`,
);

const candidate = path.join(
  workspace,
  `kasane-${String(manifest.version)}.tgz`,
);
await auditTarball(candidate);

function digest(source) {
  return createHash('sha256').update(source).digest('hex');
}

async function files(directory, prefix = '') {
  const result = new Map();
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [name, source] of await files(absolute, relative)) {
        result.set(name, source);
      }
    } else {
      assert(entry.isFile(), `Non-regular package entry: ${relative}`);
      result.set(relative, await readFile(absolute));
    }
  }
  return result;
}

async function extract(tarball, destination) {
  await mkdir(destination, { recursive: true });
  run('tar', ['-xzf', tarball, '-C', destination]);
  return path.join(destination, 'package');
}

async function assertVersionOnlyDifference(
  rcTarball,
  stableTarball,
  rcVersion,
  stableVersion,
  temporaryRoot,
) {
  const rcDirectory = await extract(
    rcTarball,
    path.join(temporaryRoot, 'compare-rc'),
  );
  const stableDirectory = await extract(
    stableTarball,
    path.join(temporaryRoot, 'compare-stable'),
  );
  const [rcFiles, stableFiles] = await Promise.all([
    files(rcDirectory),
    files(stableDirectory),
  ]);
  assert.deepEqual(
    [...stableFiles.keys()],
    [...rcFiles.keys()],
    'RC and stable projection have different file lists',
  );
  for (const [name, rcSource] of rcFiles) {
    const stableSource = stableFiles.get(name);
    assert(stableSource, `Stable projection is missing ${name}`);
    if (name !== 'package.json') {
      assert.deepEqual(
        stableSource,
        rcSource,
        `Stable projection changed ${name}`,
      );
      continue;
    }
    const rcManifest = JSON.parse(rcSource.toString('utf8'));
    const stableManifest = JSON.parse(stableSource.toString('utf8'));
    assert.equal(rcManifest.version, rcVersion);
    assert.equal(stableManifest.version, stableVersion);
    delete rcManifest.version;
    delete stableManifest.version;
    assert.deepEqual(
      stableManifest,
      rcManifest,
      'Stable package metadata differs beyond version',
    );
  }
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'kasane-rehearse-'));
try {
  const stableVersion = `${String(parsed.major)}.${String(parsed.minor)}.${String(parsed.patch)}`;
  let rcTarball;
  let stableTarball;

  if (channel === 'rc') {
    assert.equal(
      stableVersion,
      '1.0.0',
      'REL-005 must rehearse the 1.0.0 stable release',
    );
    rcTarball = candidate;
    const projectionRoot = path.join(temporaryRoot, 'projection');
    const projectionPackage = await extract(candidate, projectionRoot);
    const projectionManifestPath = path.join(projectionPackage, 'package.json');
    const projectionManifest = JSON.parse(
      await readFile(projectionManifestPath, 'utf8'),
    );
    projectionManifest.version = stableVersion;
    await writeFile(
      projectionManifestPath,
      `${JSON.stringify(projectionManifest, null, 2)}\n`,
    );
    stableTarball = path.join(temporaryRoot, `kasane-${stableVersion}.tgz`);
    await pack(projectionPackage, stableTarball);
  } else {
    stableTarball = candidate;
    const packed = JSON.parse(
      run('npm', [
        'pack',
        `${String(manifest.name)}@rc`,
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        temporaryRoot,
      ]).stdout,
    )[0];
    assert(packed?.filename, 'Could not download the audited RC tarball');
    rcTarball = path.join(temporaryRoot, packed.filename);
  }

  const rcAudit = await auditTarball(rcTarball);
  const stableAudit = await auditTarball(stableTarball);
  await assertVersionOnlyDifference(
    rcTarball,
    stableTarball,
    String(rcAudit.manifest.version),
    String(stableAudit.manifest.version),
    temporaryRoot,
  );
  run('npm', npmPublishDryRunArgs(stableTarball, stableVersion));
  const [rcSource, stableSource] = await Promise.all([
    readFile(rcTarball),
    readFile(stableTarball),
  ]);
  console.log(
    `Stable publish rehearsal passed: ${String(rcAudit.manifest.version)} sha256 ${digest(rcSource)} -> ${String(stableAudit.manifest.version)} sha256 ${digest(stableSource)}; only package.json version differs`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
