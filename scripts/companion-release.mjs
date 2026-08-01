import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
  auditCompanionTarball,
  packCompanion,
  readCompanionManifest,
  resolveCompanion,
  run,
  sha256,
} from './companion-release-utils.mjs';
import {
  assertVersionTag,
  npmTagForVersion,
  parseChangeset,
  pendingChangesetFiles,
} from './release-policy.mjs';

const workspace = process.cwd();
const command = process.argv[2];
const selectorArgument = process.argv.find((argument) =>
  argument.startsWith('--package='),
);
const selector =
  selectorArgument?.slice('--package='.length) ??
  process.env.KASANE_COMPANION_PACKAGE;
const companion = resolveCompanion(workspace, selector);
const manifest = await readCompanionManifest(companion);
const artifactRoot = path.join(workspace, 'artifacts', 'companions');
const registryPropagationAttempts = 73;
const registryPropagationDelayMs = 10_000;

function assertManifest() {
  assert.notEqual(manifest.version, '0.0.0', 'Placeholder cannot be published');
  assert.notEqual(
    manifest.private,
    true,
    'Private package cannot be published',
  );
  assert.equal(manifest.publishConfig?.access, 'public');
  assert.equal(manifest.publishConfig?.provenance, true);
  assert.equal(
    manifest.peerDependencies?.['@worldhacker/kasane'],
    '>=1.0.0 <2',
  );
}

async function assertReleaseReady({ allowBootstrapToken = false } = {}) {
  assertManifest();
  if (
    !allowBootstrapToken &&
    (process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN)
  ) {
    throw new Error('Long-lived npm tokens are not accepted by this workflow');
  }
  if (allowBootstrapToken) {
    assert(
      process.env.NODE_AUTH_TOKEN,
      'Bootstrap publish requires the protected NODE_AUTH_TOKEN mapping',
    );
    assert(
      !process.env.NPM_TOKEN,
      'Bootstrap token must be exposed only through NODE_AUTH_TOKEN',
    );
  }
  const changelog = await readFile(
    path.join(companion.root, 'CHANGELOG.md'),
    'utf8',
  );
  assert(
    changelog.includes(`## ${manifest.version} -`),
    `${companion.name} CHANGELOG.md is missing ${manifest.version}`,
  );

  const changesetRoot = path.join(workspace, '.changeset');
  const files = await readdir(changesetRoot);
  const preState = await readFile(path.join(changesetRoot, 'pre.json'), 'utf8')
    .then((source) => JSON.parse(source))
    .catch((error) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
  for (const file of pendingChangesetFiles(files, preState)) {
    const entry = parseChangeset(
      await readFile(path.join(changesetRoot, file), 'utf8'),
      file,
    );
    assert.notEqual(
      entry.packageName,
      companion.name,
      `Pending Changeset ${file} for ${companion.name} must be consumed by the release PR`,
    );
  }
}

async function prepareArtifact() {
  assertManifest();
  const expectedArtifactRoot = path.join(workspace, 'artifacts', 'companions');
  assert.equal(artifactRoot, expectedArtifactRoot);
  await rm(artifactRoot, { force: true, recursive: true });
  await mkdir(artifactRoot, { recursive: true });
  const tarball = await packCompanion(companion, artifactRoot);
  const audit = await auditCompanionTarball(tarball, manifest);
  console.log(
    `Prepared ${companion.name}@${manifest.version}: ${path.relative(workspace, tarball)}, sha256 ${audit.digest}`,
  );
  return tarball;
}

async function releaseArtifact() {
  const archives = (
    await readdir(artifactRoot).catch((error) => {
      if (error?.code === 'ENOENT') return [];
      throw error;
    })
  ).filter((file) => file.endsWith('.tgz'));
  assert.equal(
    archives.length,
    1,
    'Expected exactly one audited companion tarball; run companion:release:pack',
  );
  const tarball = path.join(artifactRoot, archives[0]);
  await auditCompanionTarball(tarball, manifest);
  return tarball;
}

function npmPublishArguments(tarball, dryRun) {
  const arguments_ = [
    'publish',
    tarball,
    '--ignore-scripts',
    '--access',
    'public',
    '--tag',
    npmTagForVersion(manifest.version),
    '--provenance',
  ];
  if (dryRun) arguments_.push('--dry-run');
  return arguments_;
}

function isMissingRegistryVersion(output) {
  return /\b(?:E404|ETARGET)\b|No matching version/iu.test(output);
}

function registryPackageExists() {
  try {
    const result = run('npm', ['view', manifest.name, 'name', '--json'], {
      cwd: workspace,
    });
    assert.equal(JSON.parse(result.stdout), manifest.name);
    return true;
  } catch (error) {
    const output =
      typeof error?.message === 'string' ? error.message : String(error);
    if (isMissingRegistryVersion(output)) return false;
    throw error;
  }
}

async function registryTarball(temporaryRoot) {
  const result = run(
    'npm',
    [
      'pack',
      `${manifest.name}@${manifest.version}`,
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      temporaryRoot,
    ],
    { cwd: workspace },
  );
  const packed = JSON.parse(result.stdout)[0];
  assert(packed?.filename, 'npm pack did not return a registry tarball');
  return path.join(temporaryRoot, packed.filename);
}

async function registryArtifactMatches(localTarball, missingAllowed) {
  let view;
  try {
    view = run(
      'npm',
      ['view', `${manifest.name}@${manifest.version}`, 'version', '--json'],
      { cwd: workspace },
    );
  } catch (error) {
    const output =
      typeof error?.message === 'string' ? error.message : String(error);
    if (missingAllowed && isMissingRegistryVersion(output)) return false;
    throw error;
  }
  assert.equal(JSON.parse(view.stdout), manifest.version);
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'kasane-companion-registry-'),
  );
  try {
    const downloaded = await registryTarball(temporaryRoot);
    const [local, registry] = await Promise.all([
      readFile(localTarball),
      readFile(downloaded),
    ]);
    assert.equal(
      sha256(registry),
      sha256(local),
      `Published ${manifest.name}@${manifest.version} differs from the audited artifact`,
    );
    return true;
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

function assertProtectedWorkflow() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.GITHUB_REF_NAME, 'main');
  assert(
    process.env.ACTIONS_ID_TOKEN_REQUEST_URL,
    'GitHub OIDC URL is missing',
  );
  assert(
    process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
    'GitHub OIDC token is missing',
  );
  assert(process.env.GITHUB_SHA, 'GITHUB_SHA is missing');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: workspace,
    encoding: 'utf8',
  }).trim();
  assert.equal(
    head,
    process.env.GITHUB_SHA,
    'Checkout is not the audited commit',
  );
  const dirty = execFileSync('git', ['status', '--porcelain'], {
    cwd: workspace,
    encoding: 'utf8',
  }).trim();
  assert.equal(dirty, '', 'Protected publish checkout must be clean');
}

async function publishedCheck(tarball) {
  let lastError;
  for (let attempt = 1; attempt <= registryPropagationAttempts; attempt += 1) {
    try {
      assert(await registryArtifactMatches(tarball, false));
      const tags = JSON.parse(
        run('npm', ['view', manifest.name, 'dist-tags', '--json'], {
          cwd: workspace,
        }).stdout,
      );
      assertVersionTag(manifest.version, tags);
      const integrity = JSON.parse(
        run(
          'npm',
          [
            'view',
            `${manifest.name}@${manifest.version}`,
            'dist.integrity',
            '--json',
          ],
          { cwd: workspace },
        ).stdout,
      );
      const digest = sha256(await readFile(tarball));
      console.log(
        `Published companion verified: ${manifest.name}@${manifest.version}, sha256 ${digest}, integrity ${String(integrity)}`,
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt < registryPropagationAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, registryPropagationDelayMs),
        );
      }
    }
  }
  throw lastError;
}

async function registrySmoke() {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'kasane-companion-smoke-'),
  );
  const cache = path.join(temporaryRoot, 'npm-cache');
  try {
    await writeFile(
      path.join(temporaryRoot, 'package.json'),
      '{"private":true,"type":"module"}\n',
    );
    let installed = false;
    let lastError;
    for (
      let attempt = 1;
      attempt <= registryPropagationAttempts && !installed;
      attempt += 1
    ) {
      try {
        run(
          'npm',
          [
            'install',
            '--ignore-scripts',
            '--no-audit',
            '--no-fund',
            '--cache',
            cache,
            '@worldhacker/kasane@1',
            `${manifest.name}@${manifest.version}`,
          ],
          { cwd: temporaryRoot },
        );
        installed = true;
      } catch (error) {
        lastError = error;
        if (attempt < registryPropagationAttempts) {
          await new Promise((resolve) =>
            setTimeout(resolve, registryPropagationDelayMs),
          );
        }
      }
    }
    if (!installed) throw lastError;
    let smokeSource;
    if (companion.selector === 'source-testkit') {
      smokeSource = `import { assertSafeProviderReference, runSourceConformance } from '${manifest.name}';\nif (typeof assertSafeProviderReference !== 'function' || typeof runSourceConformance !== 'function') process.exit(1);\n`;
    } else if (companion.selector === 'cli') {
      smokeSource = `import { CLI_OUTPUT_SCHEMA_VERSION, loadCliConfig, runCli } from '${manifest.name}';\nif (CLI_OUTPUT_SCHEMA_VERSION !== 1 || typeof loadCliConfig !== 'function' || typeof runCli !== 'function') process.exit(1);\n`;
    } else {
      smokeSource = `import { watchFiles, watchProvider, watchSnapshots } from '${manifest.name}';\nimport { watchFiles as fileSubpath } from '${manifest.name}/file';\nimport { watchProvider as providerSubpath } from '${manifest.name}/provider';\nif ([watchFiles, watchProvider, watchSnapshots, fileSubpath, providerSubpath].some((value) => typeof value !== 'function')) process.exit(1);\n`;
    }
    await writeFile(path.join(temporaryRoot, 'smoke.mjs'), smokeSource);
    run(process.execPath, ['smoke.mjs'], { cwd: temporaryRoot });
    console.log(
      `Fresh-cache registry smoke passed: ${manifest.name}@${manifest.version} on Node ${process.versions.node}`,
    );
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

switch (command) {
  case 'pack':
    await prepareArtifact();
    break;
  case 'rehearse': {
    await assertReleaseReady();
    const tarball = await releaseArtifact();
    run('npm', npmPublishArguments(tarball, true), { cwd: workspace });
    console.log(
      `Companion publish rehearsal passed: ${manifest.name}@${manifest.version}`,
    );
    break;
  }
  case 'publish': {
    await assertReleaseReady();
    assertProtectedWorkflow();
    const tarball = await releaseArtifact();
    if (await registryArtifactMatches(tarball, true)) {
      console.log(
        `${manifest.name}@${manifest.version} already matches the audited artifact; skipping duplicate publish`,
      );
      break;
    }
    const result = run('npm', npmPublishArguments(tarball, false), {
      cwd: workspace,
      stdio: 'inherit',
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
    break;
  }
  case 'bootstrap-publish': {
    await assertReleaseReady({ allowBootstrapToken: true });
    assertProtectedWorkflow();
    assert(
      !registryPackageExists(),
      `${manifest.name} already exists; bootstrap credentials must never publish updates`,
    );
    const tarball = await releaseArtifact();
    const result = run('npm', npmPublishArguments(tarball, false), {
      cwd: workspace,
      stdio: 'inherit',
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
    break;
  }
  case 'published-check':
    await assertReleaseReady();
    await publishedCheck(await releaseArtifact());
    break;
  case 'registry-smoke':
    assertManifest();
    await registrySmoke();
    break;
  default:
    throw new Error(
      'Use pack, rehearse, publish, bootstrap-publish, published-check, or registry-smoke',
    );
}
