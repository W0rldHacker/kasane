import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

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

async function installTarball(consumer, tarball, expectedVersion) {
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
    consumer,
  );

  const manifest = JSON.parse(
    await readFile(
      path.join(
        consumer,
        'node_modules',
        '@w0rldhacker',
        'kasane',
        'package.json',
      ),
      'utf8',
    ),
  );
  if (
    manifest.name !== '@w0rldhacker/kasane' ||
    manifest.version !== expectedVersion
  ) {
    throw new Error('Consumer did not install the packed kasane artifact');
  }
}

const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), 'kasane-consumers-'),
);
try {
  const packedOutput = run(
    npm,
    [
      ...npmArguments,
      'pack',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      temporaryRoot,
    ],
    workspace,
  );
  const packed = JSON.parse(packedOutput)[0];
  if (
    packed === undefined ||
    typeof packed.filename !== 'string' ||
    typeof packed.version !== 'string'
  ) {
    throw new Error('npm pack did not produce package metadata');
  }
  const tarball = path.join(temporaryRoot, packed.filename);

  for (const name of ['js-esm', 'ts-nodenext']) {
    await assertFixtureDoesNotEscape(name);
    const consumer = path.join(temporaryRoot, name);
    await cp(path.join(fixtures, name), consumer, { recursive: true });
    await installTarball(consumer, tarball, packed.version);

    if (name === 'js-esm') {
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
    `Packed JS ESM and TS NodeNext consumers passed with TypeScript ${String(typescriptManifest.version)}`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
