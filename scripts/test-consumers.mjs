import { spawnSync } from 'node:child_process';
import { access, cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { npmTagForVersion } from './release-policy.mjs';

const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const fixtures = path.join(workspace, 'test', 'consumers');
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

async function assertFixtureDoesNotEscape(name) {
  const directory = path.join(fixtures, name);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:[cm]?[jt]s|json)$/u.test(entry.name)) {
      continue;
    }
    const source = await readFile(path.join(directory, entry.name), 'utf8');
    if (/from\s+['"](?:\.\.\/)+/u.test(source)) {
      throw new Error(`${name}/${entry.name} imports outside its consumer`);
    }
  }
}

async function installPackage(consumer, packageReference, expectedVersion) {
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

  const manifest = JSON.parse(
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
  );
  if (
    manifest.name !== '@worldhacker/kasane' ||
    manifest.version !== expectedVersion
  ) {
    throw new Error('Consumer did not install the expected kasane release');
  }

  const installedEntries = await readdir(path.join(consumer, 'node_modules'));
  const unexpected = installedEntries.filter(
    (entry) => entry !== '.package-lock.json' && entry !== '@worldhacker',
  );
  if (unexpected.length > 0) {
    throw new Error(
      `Consumer installed unexpected dependencies: ${unexpected.join(', ')}`,
    );
  }
}

const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), 'kasane-consumers-'),
);
try {
  const workspaceManifest = JSON.parse(
    await readFile(path.join(workspace, 'package.json'), 'utf8'),
  );
  const packed = process.argv.includes('--packed');
  const registryArgument = process.argv.indexOf('--registry');
  const registry = registryArgument !== -1;
  if (packed && registry) {
    throw new Error('--packed and --registry are mutually exclusive');
  }
  const registrySpec = registry
    ? (process.argv[registryArgument + 1] ??
      `${String(workspaceManifest.name)}@${npmTagForVersion(String(workspaceManifest.version))}`)
    : undefined;
  const tarball = packed
    ? path.join(workspace, `kasane-${String(workspaceManifest.version)}.tgz`)
    : path.join(
        temporaryRoot,
        `kasane-${String(workspaceManifest.version)}.tgz`,
      );
  if (packed) {
    await access(tarball);
  } else {
    const pnpm = process.platform === 'win32' ? process.execPath : 'pnpm';
    const pnpmArguments =
      process.platform === 'win32'
        ? [
            path.join(
              path.dirname(process.execPath),
              'node_modules/corepack/dist/pnpm.js',
            ),
          ]
        : [];
    run(pnpm, [...pnpmArguments, 'pack', '--out', tarball], workspace);
  }

  const runtimeConsumers = [
    'backend-service',
    'js-esm',
    'test-infrastructure',
    'tooling',
  ];
  for (const name of [...runtimeConsumers, 'ts-nodenext']) {
    await assertFixtureDoesNotEscape(name);
    const consumer = path.join(temporaryRoot, name);
    await cp(path.join(fixtures, name), consumer, { recursive: true });
    await installPackage(
      consumer,
      registrySpec ?? tarball,
      workspaceManifest.version,
    );

    if (runtimeConsumers.includes(name)) {
      run(process.execPath, ['index.mjs'], consumer);
      continue;
    }

    const typescript = path.join(
      workspace,
      'node_modules',
      'typescript',
      'bin',
      'tsc',
    );
    const typeRoots = path.join(workspace, 'node_modules', '@types');
    run(
      process.execPath,
      [
        typescript,
        '-p',
        'tsconfig.json',
        '--typeRoots',
        typeRoots,
        '--types',
        'node',
      ],
      consumer,
    );
    run(process.execPath, ['dist/index.js'], consumer);
  }

  const typescriptManifest = JSON.parse(
    await readFile(
      path.join(workspace, 'node_modules', 'typescript', 'package.json'),
      'utf8',
    ),
  );
  console.log(
    `${registry ? 'Registry prerelease' : 'Packed'} backend, tooling, test-infrastructure, JS ESM, and TS NodeNext consumers passed on Node ${process.versions.node} ` +
      `with TypeScript ${String(typescriptManifest.version)} and no dev dependencies`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
