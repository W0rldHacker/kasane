import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { npmTagForVersion } from './release-policy.mjs';

const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const allowlistPath = path.join(workspace, 'scripts', 'tarball-allowlist.json');

const secretPatterns = [
  ['private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/u],
  ['npm access token', /\bnpm_[A-Za-z0-9]{36,}\b/u],
  ['GitHub access token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/u],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/u],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/u],
];
const installLifecycleScripts = ['preinstall', 'install', 'postinstall'];

function commandFor(name) {
  if (process.platform !== 'win32') return { command: name, prefix: [] };
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
  return { command: name, prefix: [] };
}

export function run(commandName, arguments_, options = {}) {
  const resolved = commandFor(commandName);
  const result = spawnSync(
    resolved.command,
    [...resolved.prefix, ...arguments_],
    {
      cwd: options.cwd ?? workspace,
      encoding: 'utf8',
      env: options.env ?? process.env,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${commandName} ${arguments_.join(' ')}`,
        result.stdout,
        result.stderr,
        result.error?.message,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return { stderr: result.stderr.trim(), stdout: result.stdout.trim() };
}

async function allFiles(directory, prefix = '') {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await allFiles(absolute, relative)));
      continue;
    }
    const metadata = await lstat(absolute);
    if (!metadata.isFile()) {
      throw new Error(`Tarball contains a non-regular file: ${relative}`);
    }
    files.push({ absolute, path: relative, size: metadata.size });
  }
  return files;
}

export async function loadAllowlist(file = allowlistPath) {
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(parsed.schemaVersion, 1, 'Unsupported tarball allowlist schema');
  return parsed;
}

function isAllowedPath(packedPath, allowlist) {
  if (allowlist.allowedTopLevelFiles.includes(packedPath)) return true;
  if (!packedPath.startsWith('dist/')) return false;
  return allowlist.allowedDistExtensions.some((extension) =>
    packedPath.endsWith(extension),
  );
}

function scanSecrets(packedPath, source) {
  const findings = [];
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(source)) findings.push(`${label} in ${packedPath}`);
  }
  return findings;
}

function assertManifest(manifest, paths, allowlist) {
  assert.equal(manifest.name, '@worldhacker/kasane');
  assert.equal(manifest.type, 'module', 'Packed package must be ESM');
  assert.equal(
    manifest.sideEffects,
    false,
    'Packed package must be side-effect free',
  );
  assert.equal(
    manifest.engines?.node,
    '>=22',
    'Packed Node.js floor must be >=22',
  );
  assert.equal(
    manifest.types,
    './dist/index.d.ts',
    'Root types export is broken',
  );
  assert.deepEqual(
    manifest.exports,
    allowlist.exports,
    'Packed exports differ from the approved public exports',
  );
  for (const conditions of Object.values(allowlist.exports)) {
    for (const target of Object.values(conditions)) {
      assert(
        paths.has(target.slice(2)),
        `Packed export target is missing: ${target}`,
      );
    }
  }
  for (const field of [
    'dependencies',
    'optionalDependencies',
    'bundledDependencies',
    'bundleDependencies',
  ]) {
    const value = manifest[field];
    assert(
      value === undefined || Object.keys(value).length === 0,
      `Packed package has forbidden runtime dependency field: ${field}`,
    );
  }
  for (const script of installLifecycleScripts) {
    assert.equal(
      manifest.scripts?.[script],
      undefined,
      `Packed package has forbidden lifecycle script: ${script}`,
    );
  }
  assert.equal(
    manifest.publishConfig?.access,
    'public',
    'Packed publish access must be public',
  );
  assert.equal(
    manifest.publishConfig?.provenance,
    true,
    'Packed publish metadata must request npm provenance',
  );
  assert.match(
    manifest.repository?.url ?? '',
    /^git\+https:\/\/github\.com\/W0rldHacker\/kasane\.git$/u,
    'Packed provenance metadata must identify the public source repository',
  );
}

export async function auditPackageDirectory(packageDirectory, allowlist) {
  const files = (await allFiles(packageDirectory)).sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const paths = new Set(files.map((file) => file.path));
  const errors = [];

  for (const requiredPath of allowlist.requiredFiles) {
    if (!paths.has(requiredPath))
      errors.push(`Missing required file: ${requiredPath}`);
  }
  for (const file of files) {
    if (!isAllowedPath(file.path, allowlist)) {
      errors.push(`Unexpected packed file: ${file.path}`);
    }
    const source = await readFile(file.absolute, 'utf8');
    for (const finding of scanSecrets(file.path, source)) {
      errors.push(`Secret-like content detected: ${finding}`);
    }
  }

  const unpackedSize = files.reduce((total, file) => total + file.size, 0);
  if (unpackedSize >= allowlist.maxUnpackedSizeBytes) {
    errors.push(
      `Unpacked size ${String(unpackedSize)} bytes exceeds budget ` +
        `${String(allowlist.maxUnpackedSizeBytes - 1)} bytes`,
    );
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));

  const manifest = JSON.parse(
    await readFile(path.join(packageDirectory, 'package.json'), 'utf8'),
  );
  assertManifest(manifest, paths, allowlist);
  return { files, manifest, unpackedSize };
}

async function safeTarEntries(tarball) {
  const { stdout } = run('tar', ['-tzf', tarball]);
  const entries = stdout.split(/\r?\n/u).filter(Boolean);
  for (const entry of entries) {
    const normalized = entry.replaceAll('\\', '/');
    assert(
      normalized === 'package' || normalized.startsWith('package/'),
      `Tarball entry escapes package root: ${entry}`,
    );
    assert(
      !normalized.split('/').includes('..'),
      `Unsafe tarball entry: ${entry}`,
    );
  }
  return entries;
}

export async function auditTarball(tarball, allowlist) {
  const effectiveAllowlist = allowlist ?? (await loadAllowlist());
  const absoluteTarball = path.resolve(tarball);
  await safeTarEntries(absoluteTarball);
  const extractionRoot = await mkdtemp(
    path.join(os.tmpdir(), 'kasane-tarball-'),
  );
  try {
    run('tar', ['-xzf', absoluteTarball, '-C', extractionRoot]);
    return await auditPackageDirectory(
      path.join(extractionRoot, 'package'),
      effectiveAllowlist,
    );
  } finally {
    await rm(extractionRoot, { force: true, recursive: true });
  }
}

async function sha256(file) {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}

export async function pack(directory, output) {
  await mkdir(path.dirname(output), { recursive: true });
  await rm(output, { force: true });
  run('pnpm', ['pack', '--out', output], { cwd: directory });
  return output;
}

async function checkReproducible(tarball) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'kasane-repro-'));
  try {
    const second = path.join(temporaryRoot, path.basename(tarball));
    await pack(workspace, second);
    const [firstHash, secondHash] = await Promise.all([
      sha256(tarball),
      sha256(second),
    ]);
    assert.equal(
      secondHash,
      firstHash,
      'Repeated pnpm pack output is not reproducible',
    );
    return firstHash;
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

export function npmPublishDryRunArgs(tarball, version) {
  return [
    'publish',
    tarball,
    '--dry-run',
    '--ignore-scripts',
    '--access',
    'public',
    '--tag',
    npmTagForVersion(version),
    '--provenance',
  ];
}

function runPackageTools(tarball) {
  const publint = path.join(
    workspace,
    'node_modules',
    'publint',
    'src',
    'cli.js',
  );
  const attw = path.join(
    workspace,
    'node_modules',
    '@arethetypeswrong',
    'cli',
    'dist',
    'index.js',
  );
  run(process.execPath, [publint, tarball, '--strict']);
  run(process.execPath, [
    attw,
    tarball,
    '--config-path',
    path.join(workspace, '.attw.json'),
  ]);
}

async function main() {
  const manifest = JSON.parse(
    await readFile(path.join(workspace, 'package.json'), 'utf8'),
  );
  const tarball = path.join(workspace, `kasane-${manifest.version}.tgz`);
  await pack(workspace, tarball);
  const audit = await auditTarball(tarball);
  const hash = await checkReproducible(tarball);
  runPackageTools(tarball);
  console.log(
    `Tarball check passed: ${path.basename(tarball)}, ` +
      `${String(audit.files.length)} files, ${String(audit.unpackedSize)} bytes unpacked, ` +
      `sha256 ${hash}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
