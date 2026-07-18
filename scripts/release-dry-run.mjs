import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { npmTagForVersion, parseChangeset } from './release-policy.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const versionScript = path.join(root, 'scripts', 'release-version.mjs');
const changesetCli = path.join(
  root,
  'node_modules',
  '@changesets',
  'cli',
  'bin.js',
);
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'kasane-release-'));

async function fixture(name, type, expected, options = {}) {
  const directory = path.join(temporaryRoot, name);
  await mkdir(path.join(directory, '.changeset'), { recursive: true });
  await writeFile(
    path.join(directory, 'package.json'),
    `${JSON.stringify({ name: '@w0rldhacker/kasane', version: '1.0.0' }, null, 2)}\n`,
  );
  await writeFile(
    path.join(directory, '.changeset', 'config.json'),
    `${JSON.stringify({
      $schema: 'https://unpkg.com/@changesets/config@3.1.1/schema.json',
      changelog: false,
      commit: false,
      fixed: [],
      linked: [],
      access: 'public',
      baseBranch: 'main',
      updateInternalDependencies: 'patch',
      ignore: [],
    })}\n`,
  );
  await writeFile(
    path.join(directory, 'CHANGELOG.md'),
    '# Changelog\n\n<!-- release-notes -->\n\n### Added\n\n### Changed\n\n### Fixed\n\n### Security\n',
  );
  if (options.prerelease) {
    const pre = spawnSync(
      process.execPath,
      [changesetCli, 'pre', 'enter', 'alpha'],
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
  }
  const metadata =
    type === 'major'
      ? '\nBreaking: true\nBreaking-Approval: maintainer-reviewed\nMigration: docs/migrations.md#fixture'
      : '';
  await writeFile(
    path.join(directory, '.changeset', `${name}.md`),
    `---\n'@w0rldhacker/kasane': ${type}\n---\n\nChanged: Exercise ${type} release classification.${metadata}\n`,
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
    changelog.includes('### Changed'),
    `${name} changelog category is missing`,
  );
}

try {
  await fixture('patch', 'patch', '1.0.1');
  await fixture('minor', 'minor', '1.1.0');
  await fixture('major', 'major', '2.0.0');
  await fixture('prerelease', 'minor', '1.1.0-alpha.0', { prerelease: true });

  const missing = path.join(temporaryRoot, 'missing');
  await mkdir(path.join(missing, '.changeset'), { recursive: true });
  await writeFile(
    path.join(missing, 'package.json'),
    '{"name":"@w0rldhacker/kasane","version":"1.0.0"}\n',
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
  assert.equal(npmTagForVersion('1.1.0-alpha.0'), 'alpha');
  assert.equal(npmTagForVersion('1.1.0-beta.0'), 'beta');
  assert.equal(npmTagForVersion('1.1.0-rc.0'), 'rc');
  assert.throws(
    () => npmTagForVersion('1.1.0-canary.0'),
    /Unsupported prerelease channel/u,
    'Invalid publish channel must fail before npm publish',
  );
  assert.throws(
    () =>
      parseChangeset(
        "---\n'@w0rldhacker/kasane': minor\n---\n\nChanged: Break beta users.\nBreaking: true\n",
        'unapproved-beta.md',
      ),
    /Breaking-Approval/u,
    'A breaking prerelease change without explicit approval must fail',
  );

  const blockedPublishDirectory = path.join(temporaryRoot, 'blocked-publish');
  await mkdir(path.join(blockedPublishDirectory, '.changeset'), {
    recursive: true,
  });
  await writeFile(
    path.join(blockedPublishDirectory, 'package.json'),
    JSON.stringify({
      name: '@w0rldhacker/kasane',
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
    "---\n'@w0rldhacker/kasane': patch\n---\n\nFixed: Pending release.\n",
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
    'Release dry-run passed: patch, minor, major, prerelease, missing changeset, package publish rehearsal, and failed publish plan',
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
