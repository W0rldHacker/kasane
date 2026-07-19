import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { auditTarball } from './check-tarball.mjs';
import { npmTagForVersion, pendingChangesetFiles } from './release-policy.mjs';

const dryRun = process.argv.includes('--dry-run');
const packageJson = JSON.parse(
  await readFile(path.join(process.cwd(), 'package.json'), 'utf8'),
);
if (packageJson.version === '0.0.0') {
  throw new Error('Placeholder version 0.0.0 cannot be published');
}
if (packageJson.private === true)
  throw new Error('Private packages cannot be published');
if (packageJson.publishConfig?.access !== 'public') {
  throw new Error('publishConfig.access must be public');
}
const tag = npmTagForVersion(packageJson.version);
const tarball = path.join(process.cwd(), `kasane-${packageJson.version}.tgz`);
const changesetDirectory = path.join(process.cwd(), '.changeset');
const changesetFiles = await readdir(changesetDirectory).catch((error) => {
  if (error?.code === 'ENOENT') return [];
  throw error;
});
const preState = await readFile(
  path.join(changesetDirectory, 'pre.json'),
  'utf8',
)
  .then((source) => JSON.parse(source))
  .catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
const pendingChangesets = pendingChangesetFiles(changesetFiles, preState);
if (pendingChangesets.length > 0) {
  throw new Error('Pending Changesets must be consumed by the release PR');
}
const changelog = await readFile(
  path.join(process.cwd(), 'CHANGELOG.md'),
  'utf8',
);
if (!changelog.includes(`## ${packageJson.version} -`)) {
  throw new Error('CHANGELOG.md is missing the current release version');
}
if (process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN) {
  throw new Error('Long-lived npm tokens are not accepted by this workflow');
}
await access(tarball).catch(() => {
  throw new Error(
    `Audited release tarball is missing: ${path.basename(tarball)}; run pnpm pack:check`,
  );
});
const audited = await auditTarball(tarball);
if (audited.manifest.version !== packageJson.version) {
  throw new Error('Audited tarball version does not match package.json');
}
if (!dryRun) {
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REF_NAME !== 'main' ||
    !process.env.ACTIONS_ID_TOKEN_REQUEST_URL ||
    !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  ) {
    throw new Error(
      'Publishing requires the protected main-branch GitHub Actions OIDC job',
    );
  }
}
const args = [
  'publish',
  tarball,
  '--ignore-scripts',
  '--access',
  'public',
  '--tag',
  tag,
  '--provenance',
];
if (dryRun) args.push('--dry-run');
console.log(
  `${dryRun ? 'Validating' : 'Publishing'} ${packageJson.name}@${packageJson.version} with npm tag ${tag}`,
);
const command = process.platform === 'win32' ? process.execPath : 'npm';
const commandArgs =
  process.platform === 'win32'
    ? [
        path.join(
          path.dirname(process.execPath),
          'node_modules',
          'npm',
          'bin',
          'npm-cli.js',
        ),
        ...args,
      ]
    : args;

async function publishedArtifactMatches() {
  const npmPrefix = process.platform === 'win32' ? commandArgs.slice(0, 1) : [];
  const packageSpec = `${packageJson.name}@${packageJson.version}`;
  const view = spawnSync(
    command,
    [...npmPrefix, 'view', packageSpec, 'version', '--json'],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  if (view.error) throw view.error;
  if (view.status !== 0) {
    const output = `${view.stdout ?? ''}\n${view.stderr ?? ''}`;
    if (/\b(?:E404|ETARGET)\b|No matching version/iu.test(output)) {
      return false;
    }
    throw new Error(`Could not inspect ${packageSpec}:\n${output}`);
  }
  if (JSON.parse(view.stdout) !== packageJson.version) {
    throw new Error(
      `Registry returned an unexpected version for ${packageSpec}`,
    );
  }

  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'kasane-published-'),
  );
  try {
    const packedResult = spawnSync(
      command,
      [
        ...npmPrefix,
        'pack',
        packageSpec,
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        temporaryRoot,
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    if (packedResult.error) throw packedResult.error;
    if (packedResult.status !== 0) {
      throw new Error(
        `Could not download ${packageSpec}:\n${packedResult.stdout ?? ''}\n${packedResult.stderr ?? ''}`,
      );
    }
    const packed = JSON.parse(packedResult.stdout)[0];
    if (!packed?.filename) {
      throw new Error('npm pack did not return the published tarball filename');
    }
    const [local, registry] = await Promise.all([
      readFile(tarball),
      readFile(path.join(temporaryRoot, packed.filename)),
    ]);
    const digest = (source) =>
      createHash('sha256').update(source).digest('hex');
    const localHash = digest(local);
    const registryHash = digest(registry);
    if (localHash !== registryHash) {
      throw new Error(
        `Published ${packageSpec} differs from the audited artifact: ${registryHash} != ${localHash}`,
      );
    }
    console.log(
      `${packageSpec} is already published with matching sha256 ${localHash}; skipping duplicate npm publish`,
    );
    return true;
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

if (!dryRun && (await publishedArtifactMatches())) {
  process.exit(0);
}
const result = spawnSync(command, commandArgs, {
  cwd: process.cwd(),
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
