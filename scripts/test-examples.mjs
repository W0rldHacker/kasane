import { spawnSync } from 'node:child_process';
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const examplesRoot = path.join(workspace, 'examples');
const exampleNames = [
  'backend',
  'basic',
  'custom-parser',
  'custom-source',
  'diff',
  'secrets',
];
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

function spawn(command, arguments_, cwd, timeout = 120_000) {
  return spawnSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    timeout,
  });
}

function requireSuccess(command, arguments_, cwd) {
  const result = spawn(command, arguments_, cwd);
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
  return result.stdout;
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(entryPath)));
    else if (entry.isFile() && /\.(?:js|mjs)$/u.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

async function inspectExample(name) {
  const directory = path.join(examplesRoot, name);
  const runs = [
    { entry: 'index.mjs', expected: 'expected.txt' },
    ...(name === 'basic'
      ? [
          {
            entry: 'quick-start.mjs',
            expected: 'quick-start.expected.txt',
          },
        ]
      : []),
  ];
  const canaries = new Set();
  let importsPublicPackage = false;

  for (const file of await sourceFiles(directory)) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/\b[A-Z][A-Z0-9_]*CANARY\b/gu)) {
      if (match[0] !== undefined) canaries.add(match[0]);
    }
    for (const match of source.matchAll(
      /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/gu,
    )) {
      const specifier = match[1];
      if (specifier === 'kasane') importsPublicPackage = true;
      if (specifier?.startsWith('kasane/')) {
        throw new Error(`${name} uses a deep Kasane import: ${specifier}`);
      }
      if (specifier?.startsWith('..')) {
        throw new Error(`${name} imports outside its example directory.`);
      }
    }
  }
  if (!importsPublicPackage) {
    throw new Error(`${name} does not import the public Kasane package.`);
  }

  return {
    canaries,
    directory,
    runs: await Promise.all(
      runs.map(async (run) => ({
        entry: run.entry,
        expected: await readFile(path.join(directory, run.expected), 'utf8'),
      })),
    ),
  };
}

async function installPackedPackage(consumer, tarball, expectedVersion) {
  requireSuccess(
    npm,
    [
      ...npmArguments,
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-save',
      '--package-lock=false',
      tarball,
    ],
    consumer,
  );
  const manifest = JSON.parse(
    await readFile(
      path.join(consumer, 'node_modules', 'kasane', 'package.json'),
      'utf8',
    ),
  );
  if (manifest.name !== 'kasane' || manifest.version !== expectedVersion) {
    throw new Error('Example did not install the packed Kasane artifact.');
  }
}

const discovered = (await readdir(examplesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (JSON.stringify(discovered) !== JSON.stringify(exampleNames)) {
  throw new Error('Executable example directory set is incomplete.');
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'kasane-examples-'));
try {
  const packedOutput = requireSuccess(
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
    throw new Error('npm pack did not produce package metadata.');
  }
  const tarball = path.join(temporaryRoot, packed.filename);

  for (const name of exampleNames) {
    const definition = await inspectExample(name);
    const consumer = path.join(temporaryRoot, name);
    const startedAt = performance.now();
    await cp(definition.directory, consumer, { recursive: true });
    await writeFile(
      path.join(consumer, 'package.json'),
      `${JSON.stringify(
        {
          name: `kasane-example-${name}`,
          private: true,
          type: 'module',
        },
        undefined,
        2,
      )}\n`,
      'utf8',
    );
    await installPackedPackage(consumer, tarball, packed.version);

    for (const run of definition.runs) {
      const result = spawn(process.execPath, [run.entry], consumer);
      for (const canary of definition.canaries) {
        if (result.stdout.includes(canary) || result.stderr.includes(canary)) {
          throw new Error(`${name}/${run.entry} exposed a test secret canary.`);
        }
      }
      if (result.status !== 0) {
        throw new Error(
          [`Example failed: ${name}/${run.entry}`, result.stdout, result.stderr]
            .filter(Boolean)
            .join('\n'),
        );
      }
      if (result.stderr !== '') {
        throw new Error(`${name}/${run.entry} wrote unexpected stderr output.`);
      }
      if (result.stdout !== run.expected) {
        throw new Error(
          `${name}/${run.entry} output mismatch.\nExpected: ${JSON.stringify(run.expected)}\nActual: ${JSON.stringify(result.stdout)}`,
        );
      }
    }

    const durationMs = Math.round(performance.now() - startedAt);
    process.stdout.write(`${name} example passed (${String(durationMs)}ms)\n`);
  }

  process.stdout.write(
    `Packed examples passed on Node ${process.versions.node} (${String(exampleNames.length)} clean installs).\n`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
