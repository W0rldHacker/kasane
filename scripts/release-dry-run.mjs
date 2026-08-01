import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  assertVersionTag,
  npmTagForVersion,
  parseChangeset,
  pendingChangesetFiles,
} from './release-policy.mjs';
import { npmPublishDryRunArgs, pack } from './check-tarball.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const versionScript = path.join(root, 'scripts', 'release-version.mjs');
const prettierCli = path.join(
  root,
  'node_modules',
  'prettier',
  'bin',
  'prettier.cjs',
);
const changesetCli = path.join(
  root,
  'node_modules',
  '@changesets',
  'cli',
  'bin.js',
);
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'kasane-release-'));

function changesetsConfig() {
  return {
    $schema: 'https://unpkg.com/@changesets/config@3.1.1/schema.json',
    changelog: false,
    commit: false,
    fixed: [],
    linked: [],
    access: 'public',
    baseBranch: 'main',
    updateInternalDependencies: 'patch',
    ___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH: {
      onlyUpdatePeerDependentsWhenOutOfRange: true,
    },
    ignore: [],
  };
}

async function fixture(name, type, expected, options = {}) {
  const directory = path.join(temporaryRoot, name);
  await mkdir(path.join(directory, '.changeset'), { recursive: true });
  await writeFile(
    path.join(directory, 'package.json'),
    `${JSON.stringify(
      {
        name: '@worldhacker/kasane',
        version: options.startVersion ?? '1.0.0',
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(directory, '.changeset', 'config.json'),
    `${JSON.stringify(changesetsConfig())}\n`,
  );
  await writeFile(
    path.join(directory, 'CHANGELOG.md'),
    '# Changelog\n\n<!-- release-notes -->\n\n### Added\n\n### Changed\n\n### Fixed\n\n### Security\n',
  );
  if (options.prerelease) {
    const pre = spawnSync(
      process.execPath,
      [changesetCli, 'pre', 'enter', options.prereleaseTag ?? 'alpha'],
      {
        cwd: directory,
        encoding: 'utf8',
      },
    );
    assert.equal(
      pre.status,
      0,
      pre.stderr || 'Could not enter prerelease mode',
    );
  } else if (options.preState) {
    await writeFile(
      path.join(directory, '.changeset', 'pre.json'),
      `${JSON.stringify(options.preState, null, 2)}\n`,
    );
  }
  const metadata = options.promotion
    ? '\n\nPromotion: 1.0\n\nPromotion-Approval: release-manager-reviewed\n\nMigration: docs/migrations.md#01-beta-to-10-release-candidate'
    : type === 'major'
      ? '\nBreaking: true\nBreaking-Approval: maintainer-reviewed\nMigration: docs/migrations.md#fixture'
      : '';
  const category = options.category ?? 'Changed';
  await writeFile(
    path.join(directory, '.changeset', `${name}.md`),
    `---\n'@worldhacker/kasane': ${type}\n---\n\n${category}: Exercise ${type} release classification.${metadata}\n`,
  );
  const result = spawnSync(process.execPath, [versionScript], {
    cwd: directory,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'package.json'), 'utf8'),
  );
  assert.equal(manifest.version, expected, `${name} version`);
  const changelog = await readFile(
    path.join(directory, 'CHANGELOG.md'),
    'utf8',
  );
  assert(
    changelog.includes(`## ${expected}`),
    `${name} changelog version is missing`,
  );
  assert(
    changelog.includes(`### ${category}`),
    `${name} changelog category is missing`,
  );
  const format = spawnSync(
    process.execPath,
    [prettierCli, '--check', path.join(directory, 'CHANGELOG.md')],
    { cwd: directory, encoding: 'utf8' },
  );
  assert.equal(format.status, 0, format.stderr || format.stdout);
}

async function companionFixture({ fixtureName, packageName, packagePath }) {
  const directory = path.join(temporaryRoot, fixtureName);
  const packageDirectory = path.join(directory, 'packages', packagePath);
  await mkdir(path.join(directory, '.changeset'), { recursive: true });
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(
    path.join(directory, 'package.json'),
    `${JSON.stringify(
      { name: '@worldhacker/kasane', private: true, version: '1.0.0' },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(packageDirectory, 'package.json'),
    `${JSON.stringify({ name: packageName, version: '0.1.0' }, null, 2)}\n`,
  );
  await writeFile(
    path.join(directory, 'pnpm-workspace.yaml'),
    'packages:\n  - .\n  - packages/*\n',
  );
  await writeFile(
    path.join(directory, '.changeset', 'config.json'),
    `${JSON.stringify(changesetsConfig())}\n`,
  );
  await writeFile(
    path.join(packageDirectory, 'CHANGELOG.md'),
    '# Changelog\n\n<!-- release-notes -->\n',
  );
  await writeFile(
    path.join(directory, '.changeset', `${packagePath}.md`),
    `---\n'${packageName}': minor\n---\n\nAdded: Exercise an independent companion release.\n`,
  );
  const result = spawnSync(process.execPath, [versionScript], {
    cwd: directory,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const core = JSON.parse(
    await readFile(path.join(directory, 'package.json'), 'utf8'),
  );
  const companion = JSON.parse(
    await readFile(path.join(packageDirectory, 'package.json'), 'utf8'),
  );
  assert.equal(core.version, '1.0.0', 'Companion release changed core');
  assert.equal(companion.version, '0.2.0');
  assert(
    (
      await readFile(path.join(packageDirectory, 'CHANGELOG.md'), 'utf8')
    ).includes('## 0.2.0'),
    'Companion changelog version is missing',
  );
}

async function corePatchCompatibilityFixture() {
  const directory = path.join(temporaryRoot, 'core-patch-companions');
  const companions = [
    {
      name: '@worldhacker/kasane-cli',
      packagePath: 'cli',
      version: '0.1.0',
    },
    {
      name: '@worldhacker/kasane-source-testkit',
      packagePath: 'source-testkit',
      version: '0.1.0',
    },
    {
      name: '@worldhacker/kasane-watch',
      packagePath: 'watch',
      version: '0.1.0',
    },
    {
      name: '@worldhacker/kasane-companion-template',
      packagePath: 'companion-template',
      version: '0.0.0',
      private: true,
    },
  ];
  await mkdir(path.join(directory, '.changeset'), { recursive: true });
  await writeFile(
    path.join(directory, 'package.json'),
    `${JSON.stringify(
      { name: '@worldhacker/kasane', version: '1.0.0' },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(directory, 'pnpm-workspace.yaml'),
    'packages:\n  - .\n  - packages/*\n',
  );
  await writeFile(
    path.join(directory, '.changeset', 'config.json'),
    `${JSON.stringify(changesetsConfig())}\n`,
  );
  await writeFile(
    path.join(directory, 'CHANGELOG.md'),
    '# Changelog\n\n<!-- release-notes -->\n',
  );
  for (const companion of companions) {
    const packageDirectory = path.join(
      directory,
      'packages',
      companion.packagePath,
    );
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(
      path.join(packageDirectory, 'package.json'),
      `${JSON.stringify(
        {
          name: companion.name,
          version: companion.version,
          ...(companion.private === true ? { private: true } : {}),
          peerDependencies: {
            '@worldhacker/kasane': '>=1.0.0 <2',
          },
        },
        null,
        2,
      )}\n`,
    );
  }
  await writeFile(
    path.join(directory, '.changeset', 'core-patch.md'),
    "---\n'@worldhacker/kasane': patch\n---\n\nFixed: Exercise a compatible core patch.\n",
  );

  const result = spawnSync(process.execPath, [versionScript], {
    cwd: directory,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const core = JSON.parse(
    await readFile(path.join(directory, 'package.json'), 'utf8'),
  );
  assert.equal(core.version, '1.0.1');
  for (const companion of companions) {
    const manifest = JSON.parse(
      await readFile(
        path.join(directory, 'packages', companion.packagePath, 'package.json'),
        'utf8',
      ),
    );
    assert.equal(
      manifest.version,
      companion.version,
      `${companion.name} version changed during a core-only patch`,
    );
    assert.equal(
      manifest.peerDependencies?.['@worldhacker/kasane'],
      '>=1.0.0 <2',
      `${companion.name} lost support for an already compatible core version`,
    );
  }
}

try {
  await fixture('patch', 'patch', '1.0.1');
  await corePatchCompatibilityFixture();
  await fixture('security-patch', 'patch', '1.0.1', {
    category: 'Security',
  });
  await companionFixture({
    fixtureName: 'source-testkit-release-group',
    packageName: '@worldhacker/kasane-source-testkit',
    packagePath: 'source-testkit',
  });
  await companionFixture({
    fixtureName: 'watch-release-group',
    packageName: '@worldhacker/kasane-watch',
    packagePath: 'watch',
  });
  await companionFixture({
    fixtureName: 'cli-release-group',
    packageName: '@worldhacker/kasane-cli',
    packagePath: 'cli',
  });
  await fixture('minor', 'minor', '1.1.0');
  await fixture('major', 'major', '2.0.0');
  await fixture('prerelease', 'minor', '1.1.0-alpha.0', { prerelease: true });
  await fixture('initial-alpha', 'minor', '0.1.0-alpha.0', {
    prerelease: true,
    startVersion: '0.0.0',
  });
  await fixture('channel-transition-rc', 'major', '1.0.0-rc.1', {
    prerelease: true,
    prereleaseTag: 'rc',
    promotion: true,
    startVersion: '0.1.0-beta.1',
  });
  await fixture('stable-from-approved-rc', 'major', '1.0.0', {
    promotion: true,
    startVersion: '1.0.0-rc.1',
    preState: {
      mode: 'exit',
      tag: 'rc',
      initialVersions: { '@worldhacker/kasane': '0.1.0-alpha.0' },
      changesets: ['stable-from-approved-rc'],
    },
  });
  await fixture('next-rc-after-fix', 'patch', '1.0.0-rc.2', {
    prerelease: true,
    prereleaseTag: 'rc',
    startVersion: '1.0.0-rc.1',
  });

  const missing = path.join(temporaryRoot, 'missing');
  await mkdir(path.join(missing, '.changeset'), { recursive: true });
  await writeFile(
    path.join(missing, 'package.json'),
    '{"name":"@worldhacker/kasane","version":"1.0.0"}\n',
  );
  await writeFile(path.join(missing, 'CHANGELOG.md'), '# Changelog\n');
  const missingResult = spawnSync(process.execPath, [versionScript], {
    cwd: missing,
    encoding: 'utf8',
  });
  assert.notEqual(
    missingResult.status,
    0,
    'Missing changeset must block versioning',
  );

  assert.equal(npmTagForVersion('1.0.0'), 'latest');
  assert.equal(npmTagForVersion('1.1.0-alpha.0'), 'next');
  assert.equal(npmTagForVersion('1.1.0-beta.0'), 'beta');
  assert.equal(npmTagForVersion('1.1.0-rc.0'), 'rc');
  assert.equal(
    assertVersionTag('1.0.0-rc.1', {
      latest: '0.1.0-beta.1',
      rc: '1.0.0-rc.1',
    }),
    'rc',
  );
  assert.throws(
    () =>
      assertVersionTag('1.0.0-rc.1', {
        latest: '0.1.0-beta.1',
        rc: '1.0.0-rc.0',
      }),
    /rc points to/u,
    'A mismatched registry tag must block release verification',
  );
  assert.deepEqual(
    npmPublishDryRunArgs('kasane-0.1.0-alpha.0.tgz', '0.1.0-alpha.0').slice(-3),
    ['--tag', 'next', '--provenance'],
  );
  assert.throws(
    () => npmTagForVersion('1.1.0-canary.0'),
    /Unsupported prerelease channel/u,
    'Invalid publish channel must fail before npm publish',
  );
  assert.throws(
    () =>
      parseChangeset(
        "---\n'@worldhacker/kasane': minor\n---\n\nChanged: Break beta users.\nBreaking: true\n",
        'unapproved-beta.md',
      ),
    /Breaking-Approval/u,
    'A breaking prerelease change without explicit approval must fail',
  );
  assert.deepEqual(
    pendingChangesetFiles(['README.md', 'consumed.md', 'pending.md'], {
      mode: 'pre',
      changesets: ['consumed'],
    }),
    ['pending.md'],
    'Prerelease changesets recorded in pre.json must be treated as consumed',
  );
  assert.deepEqual(
    pendingChangesetFiles(['README.md', 'pending.md']),
    ['pending.md'],
    'Ordinary pending changesets must continue to block publication',
  );

  const blockedPublishDirectory = path.join(temporaryRoot, 'blocked-publish');
  await mkdir(path.join(blockedPublishDirectory, '.changeset'), {
    recursive: true,
  });
  await writeFile(
    path.join(blockedPublishDirectory, 'package.json'),
    JSON.stringify({
      name: '@worldhacker/kasane',
      version: '1.0.1',
      publishConfig: { access: 'public', provenance: true },
    }),
  );
  await writeFile(
    path.join(blockedPublishDirectory, 'CHANGELOG.md'),
    '# Changelog\n\n## 1.0.1 - 2000-01-01\n',
  );
  await writeFile(
    path.join(blockedPublishDirectory, '.changeset', 'pending.md'),
    "---\n'@worldhacker/kasane': patch\n---\n\nFixed: Pending release.\n",
  );
  const blockedPublish = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'release-publish.mjs'), '--dry-run'],
    { cwd: blockedPublishDirectory, encoding: 'utf8' },
  );
  assert.notEqual(
    blockedPublish.status,
    0,
    'A publish dry-run with pending Changesets must fail',
  );

  const policy = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'release-policy-check.mjs')],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  assert.equal(policy.status, 0, policy.stderr || policy.stdout);

  const build = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'build.mjs')],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const publishDirectory = path.join(temporaryRoot, 'publish');
  await mkdir(publishDirectory, { recursive: true });
  const publishManifest = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  );
  publishManifest.version = '0.0.1';
  await writeFile(
    path.join(publishDirectory, 'package.json'),
    `${JSON.stringify(publishManifest, null, 2)}\n`,
  );
  await Promise.all(
    ['README.md', 'LICENSE', 'SECURITY.md'].map((file) =>
      cp(path.join(root, file), path.join(publishDirectory, file)),
    ),
  );
  await cp(path.join(root, 'dist'), path.join(publishDirectory, 'dist'), {
    recursive: true,
  });
  await writeFile(
    path.join(publishDirectory, 'CHANGELOG.md'),
    '# Changelog\n\n## 0.0.1 - 2000-01-01\n\n### Changed\n\n- Release rehearsal.\n',
  );
  await pack(publishDirectory, path.join(publishDirectory, 'kasane-0.0.1.tgz'));
  const publishDryRun = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'release-publish.mjs'), '--dry-run'],
    { cwd: publishDirectory, encoding: 'utf8' },
  );
  assert.equal(
    publishDryRun.status,
    0,
    publishDryRun.stderr || publishDryRun.stdout,
  );
  console.log(
    'Release dry-run passed: patch with stable companion peer ranges, security patch, minor, major, initial alpha, RC channel transition, stable exit from approved RC, new RC after fix, tag mismatch, prerelease, missing changeset, package publish rehearsal, and failed publish plan',
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
