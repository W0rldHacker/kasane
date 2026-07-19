import { spawnSync } from 'node:child_process';
import { access, cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { npmTagForVersion, parseVersion } from './release-policy.mjs';

const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const fixtures = path.join(workspace, 'test', 'consumers');
const manifest = JSON.parse(
  await readFile(path.join(workspace, 'package.json'), 'utf8'),
);
const parsedVersion = parseVersion(String(manifest.version));
const releaseChannel = parsedVersion.prerelease?.split('.')[0] ?? 'stable';
if (releaseChannel === 'alpha') {
  console.log(
    'Published-alpha upgrade is pending the Changesets beta version commit',
  );
  process.exit(0);
}

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

function run(command, arguments_, cwd) {
  const result = spawnSync(command, arguments_, {
    cwd,
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

async function installedVersion(consumer) {
  return String(
    JSON.parse(
      await readFile(
        path.join(
          consumer,
          'node_modules',
          '@worldhacker',
          'kasane',
          'package.json',
        ),
        'utf8',
      ),
    ).version,
  );
}

function install(consumer, packageReference) {
  run(
    npm,
    [
      ...npmArguments,
      'install',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      packageReference,
    ],
    consumer,
  );
}

async function assertDependencyBoundary(consumer) {
  const entries = await readdir(path.join(consumer, 'node_modules'));
  const unexpected = entries.filter(
    (entry) => entry !== '.package-lock.json' && entry !== '@worldhacker',
  );
  if (unexpected.length > 0) {
    throw new Error(
      `Upgrade consumer installed unexpected dependencies: ${unexpected.join(', ')}`,
    );
  }
}

const packed = process.argv.includes('--packed');
const registry = process.argv.includes('--registry');
if (packed === registry) {
  throw new Error('Choose exactly one of --packed or --registry');
}
const sourceVersions = {
  beta: '0.1.0-alpha.0',
  rc: '0.1.0-beta.1',
  stable: '1.0.0-rc.1',
};
const sourceVersion = sourceVersions[releaseChannel];
if (sourceVersion === undefined) {
  throw new Error(`Unsupported upgrade source for ${releaseChannel}`);
}
const fromSpec = `@worldhacker/kasane@${sourceVersion}`;
const toSpec = registry
  ? `${String(manifest.name)}@${npmTagForVersion(String(manifest.version))}`
  : path.join(workspace, `kasane-${String(manifest.version)}.tgz`);
if (packed) await access(toSpec);

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'kasane-upgrade-'));
try {
  for (const name of ['backend-service', 'test-infrastructure']) {
    const consumer = path.join(temporaryRoot, name);
    await cp(path.join(fixtures, name), consumer, { recursive: true });

    install(consumer, fromSpec);
    if ((await installedVersion(consumer)) !== sourceVersion) {
      throw new Error(`${name} did not install ${sourceVersion}`);
    }
    run(process.execPath, ['index.mjs'], consumer);

    install(consumer, toSpec);
    if ((await installedVersion(consumer)) !== manifest.version) {
      throw new Error(`${name} did not upgrade to ${String(manifest.version)}`);
    }
    await assertDependencyBoundary(consumer);
    run(process.execPath, ['index.mjs'], consumer);

    if (releaseChannel === 'rc' || releaseChannel === 'stable') {
      install(consumer, fromSpec);
      if ((await installedVersion(consumer)) !== sourceVersion) {
        throw new Error(`${name} did not roll back to ${sourceVersion}`);
      }
      await assertDependencyBoundary(consumer);
      run(process.execPath, ['index.mjs'], consumer);
    }
  }

  console.log(
    `${releaseChannel === 'beta' ? 'Published-alpha upgrade' : 'Upgrade and rollback rehearsal'} passed for backend and test-infrastructure consumers on Node ${process.versions.node}: ${sourceVersion} -> ${String(manifest.version)}${releaseChannel === 'beta' ? '' : ` -> ${sourceVersion}`}`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
