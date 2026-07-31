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
  companionPublish,
  companionBootstrap,
  companionPublishScript,
  companionPublishUtils,
  packageJson,
] = await Promise.all([
  read('.changeset/config.json'),
  read('CHANGELOG.md'),
  read('docs/versioning.md'),
  read('docs/migrations.md'),
  read('.github/workflows/release-pr.yml'),
  read('.github/workflows/release.yml'),
  read('scripts/release-publish.mjs'),
  read('.github/workflows/companion-release.yml'),
  read('.github/workflows/companion-bootstrap.yml'),
  read('scripts/companion-release.mjs'),
  read('scripts/companion-release-utils.mjs'),
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
    'protected `npm-companions` environment',
    '`@worldhacker/kasane-source-testkit`',
    '`@worldhacker/kasane-watch`',
    '`companion-bootstrap.yml`',
    '`NPM_BOOTSTRAP_TOKEN`',
    'npm can attach a trusted publisher only after a package already exists',
    'trusted publisher',
    'never attempts to dry-run an immutable version',
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
  [companionPublish, 'Companion publish workflow'],
  [companionBootstrap, 'Companion bootstrap workflow'],
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
    'branch: main',
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
    'pnpm release:rehearse',
    'pnpm release:publish',
    'name: release-tarball-${{ github.run_id }}',
    'pnpm release:published-check',
    'Registry release smoke / Node.js ${{ matrix.node-version }}',
    'pnpm test:consumer:registry',
    'pnpm test:consumer:upgrade:registry',
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
includesAll(
  companionPublish,
  [
    'workflow_dispatch:',
    'type: choice',
    '- source-testkit',
    '- watch',
    'environment: npm-companions',
    'contents: read',
    'id-token: write',
    'node-version: 24.x',
    'package-manager-cache: false',
    'pnpm install --frozen-lockfile',
    'pnpm verify',
    'pnpm companion:release:pack',
    'pnpm companion:release:rehearse',
    'needs: prepare',
    'actions/download-artifact@',
    'name: companion-${{ inputs.package }}-${{ github.run_id }}',
    'path: artifacts/companions/*.tgz',
    'pnpm companion:release:publish',
    'pnpm companion:release:published-check',
    'Companion registry smoke / Node.js ${{ matrix.node-version }}',
    '- 22.x',
    '- 24.x',
    'pnpm companion:release:registry-smoke',
  ],
  'Companion publish workflow',
);
assert(
  !/\b(?:NPM_TOKEN|NODE_AUTH_TOKEN)\b/u.test(companionPublish),
  'Companion publish workflow must not use a long-lived npm token',
);
assert(
  !/\bsecrets\./u.test(companionPublish),
  'Companion publish workflow must not read repository secrets',
);
includesAll(
  companionBootstrap,
  [
    'workflow_dispatch:',
    'type: choice',
    '- source-testkit',
    '- watch',
    'Type bootstrap to confirm one-time token use',
    'test "$BOOTSTRAP_CONFIRMATION" = bootstrap',
    'environment: npm-companions',
    'contents: read',
    'id-token: write',
    'package-manager-cache: false',
    'pnpm verify',
    'pnpm companion:release:pack',
    'pnpm companion:release:rehearse',
    'needs: prepare',
    'actions/download-artifact@',
    'pnpm companion:release:bootstrap-publish',
    'NODE_AUTH_TOKEN: ${{ secrets.NPM_BOOTSTRAP_TOKEN }}',
    'Revoke the npm bootstrap token',
    'Bootstrap registry smoke / Node.js ${{ matrix.node-version }}',
    '- 22.x',
    '- 24.x',
  ],
  'Companion bootstrap workflow',
);
const bootstrapSecrets = [
  ...companionBootstrap.matchAll(/\bsecrets\.([A-Z0-9_]+)/gu),
].map((match) => match[1]);
assert.deepEqual(
  bootstrapSecrets,
  ['NPM_BOOTSTRAP_TOKEN'],
  'Bootstrap workflow may read only the one-time npm bootstrap token',
);
includesAll(
  companionPublishScript,
  [
    'Long-lived npm tokens are not accepted',
    'Pending Changeset',
    'GITHUB_REF_NAME',
    'ACTIONS_ID_TOKEN_REQUEST_URL',
    'GITHUB_SHA',
    "['status', '--porcelain']",
    'Expected exactly one audited companion tarball',
    'npmTagForVersion(manifest.version)',
    'differs from the audited artifact',
    "'--provenance'",
    "'npm-cache'",
    'allowBootstrapToken',
    'registryPackageExists()',
    'already exists; bootstrap credentials must never publish updates',
  ],
  'Companion publish script',
);
includesAll(
  companionPublishUtils,
  [
    "'source-testkit'",
    "'@worldhacker/kasane-source-testkit'",
    "'@worldhacker/kasane-watch'",
    'Unexpected companion package file',
    'Packed output contains',
    "'>=1.0.0 <2'",
  ],
  'Companion publish utilities',
);

const manifest = JSON.parse(packageJson);
assert.equal(manifest.name, '@worldhacker/kasane');
assert.equal(manifest.publishConfig?.access, 'public');
assert.equal(manifest.publishConfig?.provenance, true);
assert.equal(
  manifest.scripts?.['release:rehearse'],
  'node scripts/release-rehearse.mjs',
);
assert.equal(
  manifest.scripts?.['companion:release:publish'],
  'node scripts/companion-release.mjs publish',
);
assert.equal(
  manifest.scripts?.['companion:release:bootstrap-publish'],
  'node scripts/companion-release.mjs bootstrap-publish',
);
assert.equal(
  manifest.scripts?.['companion:release:published-check'],
  'node scripts/companion-release.mjs published-check',
);
assert(
  manifest.scripts?.verify.includes('pnpm release:dry-run'),
  'Ordinary verification must exercise synthetic publish plans',
);
console.log(
  'Release policy check passed: SemVer, changelog, migration, release PR, and core/companion OIDC publish controls',
);
