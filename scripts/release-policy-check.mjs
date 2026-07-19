import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');
const [
  config,
  changelog,
  versioning,
  migrations,
  releasePr,
  publish,
  publishScript,
  packageJson,
] = await Promise.all([
  read('.changeset/config.json'),
  read('CHANGELOG.md'),
  read('docs/versioning.md'),
  read('docs/migrations.md'),
  read('.github/workflows/release-pr.yml'),
  read('.github/workflows/release.yml'),
  read('scripts/release-publish.mjs'),
  read('package.json'),
]);

function includesAll(source, fragments, label) {
  for (const fragment of fragments) {
    assert(source.includes(fragment), `${label} must include: ${fragment}`);
  }
}

function pinned(source, label) {
  for (const match of source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gmu)) {
    assert(
      /^[^/@]+\/[^/@]+@[0-9a-f]{40}$/u.test(match[1]),
      `${label} action must be pinned to a commit SHA: ${match[1]}`,
    );
  }
}

assert.equal(
  JSON.parse(config).changelog,
  false,
  'Custom answer-first changelog must remain enabled',
);
includesAll(
  changelog,
  ['# Changelog', 'Added', 'Changed', 'Fixed', 'Security'],
  'CHANGELOG',
);
includesAll(
  versioning,
  [
    'Breaking-Approval:',
    'Breaking: true',
    'one minor release',
    '`next`',
    '`beta`',
    '`rc`',
    '`latest`',
    'protected `npm` environment',
    'trusted publisher',
  ],
  'Versioning policy',
);
includesAll(
  migrations,
  ['Migration:', 'security removal', 'diagnostic'],
  'Migration policy',
);

for (const [source, label] of [
  [releasePr, 'Release PR workflow'],
  [publish, 'Publish workflow'],
])
  pinned(source, label);

includesAll(
  releasePr,
  [
    'push:',
    'branches: [main]',
    'actions: write',
    'contents: write',
    'pull-requests: write',
    'branch: changeset-release/main',
    'pnpm release:version',
    'gh workflow run ci.yml --ref changeset-release/main',
  ],
  'Release PR workflow',
);
for (const forbidden of [
  'id-token: write',
  'npm publish',
  'NPM_TOKEN',
  'NODE_AUTH_TOKEN',
]) {
  assert(
    !releasePr.includes(forbidden),
    `Release PR workflow must not include ${forbidden}`,
  );
}

includesAll(
  publish,
  [
    'workflow_dispatch:',
    'environment: npm',
    'contents: read',
    'id-token: write',
    'node-version: 24.x',
    'package-manager-cache: false',
    'pnpm install --frozen-lockfile',
    'pnpm release:dry-run',
    'pnpm release:publish',
    'name: release-tarball-${{ github.run_id }}',
    'pnpm release:published-check',
    'Registry alpha smoke / Node.js ${{ matrix.node-version }}',
    'pnpm test:consumer:alpha',
  ],
  'Publish workflow',
);
assert(
  !/\b(?:NPM_TOKEN|NODE_AUTH_TOKEN)\b/u.test(publish),
  'Publish workflow must not use a long-lived npm token',
);
assert(
  !/\bsecrets\./u.test(publish),
  'Publish workflow must not read repository secrets',
);
includesAll(
  publishScript,
  [
    "packageJson.version === '0.0.0'",
    'Pending Changesets must be consumed',
    'CHANGELOG.md is missing',
    'GITHUB_REF_NAME',
    'ACTIONS_ID_TOKEN_REQUEST_URL',
    'Long-lived npm tokens are not accepted',
    '`kasane-${packageJson.version}.tgz`',
    'await auditTarball(tarball)',
    "'publish',\n  tarball,",
  ],
  'Publish script',
);

const manifest = JSON.parse(packageJson);
assert.equal(manifest.name, '@w0rldhacker/kasane');
assert.equal(manifest.publishConfig?.access, 'public');
assert.equal(manifest.publishConfig?.provenance, true);
console.log(
  'Release policy check passed: SemVer, changelog, migration, release PR, and OIDC publish controls',
);
