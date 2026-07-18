import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const ciPath = path.join(root, '.github', 'workflows', 'ci.yml');
const nightlyPath = path.join(root, '.github', 'workflows', 'nightly.yml');
const dependabotPath = path.join(root, '.github', 'dependabot.yml');
const checklistPath = path.join(
  root,
  'docs',
  'ci',
  'branch-protection-checklist.md',
);

const [ci, nightly, dependabot, checklist] = await Promise.all([
  readFile(ciPath, 'utf8'),
  readFile(nightlyPath, 'utf8'),
  readFile(dependabotPath, 'utf8'),
  readFile(checklistPath, 'utf8'),
]);

function requireAll(text, fragments, label) {
  const normalized = text.replace(/\s+/gu, ' ').toLowerCase();
  for (const fragment of fragments) {
    assert(
      normalized.includes(fragment.replace(/\s+/gu, ' ').toLowerCase()),
      `${label} must include: ${fragment}`,
    );
  }
}

function jobs(workflow) {
  const jobsStart = workflow.indexOf('\njobs:\n');
  assert(jobsStart >= 0, 'Workflow is missing jobs');
  const source = workflow.slice(jobsStart + '\njobs:\n'.length);
  const headings = [...source.matchAll(/^ {2}([a-z0-9-]+):\r?$/gmu)];
  const result = new Map();
  for (const [index, heading] of headings.entries()) {
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? source.length;
    result.set(heading[1], source.slice(start, end));
  }
  return result;
}

function assertPinnedActions(workflow, name) {
  const uses = [...workflow.matchAll(/^\s*-?\s*uses:\s*([^\s#]+).*$/gmu)];
  assert(uses.length > 0, `${name} must use pinned actions`);
  for (const use of uses) {
    const reference = use[1] ?? '';
    assert(
      /^[^/@]+\/[^/@]+@[0-9a-f]{40}$/u.test(reference),
      `${name} action is not pinned to a commit SHA: ${reference}`,
    );
  }
}

function assertReadOnly(workflow, name) {
  requireAll(
    workflow,
    ['permissions:', 'contents: read'],
    `${name} permissions`,
  );
  for (const forbidden of [
    /pull_request_target:/u,
    /packages:\s*write/iu,
    /id-token:\s*write/iu,
    /deployments:\s*write/iu,
    /security-events:\s*write/iu,
    /NPM_TOKEN/iu,
    /NODE_AUTH_TOKEN/iu,
    /secrets\./iu,
    /toJSON\(secrets\)/iu,
    /(?:^|\s)(?:printenv|Get-ChildItem\s+Env:)(?:\s|$)/imu,
  ]) {
    assert(!forbidden.test(workflow), `${name} violates least permissions`);
  }
}

function assertInstallAndCache(workflow, name) {
  for (const [jobName, job] of jobs(workflow)) {
    if (!job.includes('pnpm/action-setup@')) continue;
    requireAll(
      job,
      [
        'cache: pnpm',
        'cache-dependency-path: pnpm-lock.yaml',
        'pnpm install --frozen-lockfile',
      ],
      `${name} job ${jobName}`,
    );
    assert(
      !/(?:actions\/cache@|path:\s*(?:dist|coverage|artifacts)\/)/iu.test(
        job.slice(0, job.indexOf('pnpm install --frozen-lockfile')),
      ),
      `${name} job ${jobName} must not restore build output before install`,
    );
  }
}

for (const [name, workflow] of [
  ['CI', ci],
  ['Nightly', nightly],
]) {
  assertPinnedActions(workflow, name);
  assertReadOnly(workflow, name);
  assertInstallAndCache(workflow, name);
}

requireAll(
  ci,
  [
    'pull_request:',
    'cancel-in-progress: true',
    'name: Fast / static, docs, architecture',
    'pnpm docs:check',
    'pnpm security:policy-check',
    'pnpm changeset:check',
    'pnpm release:policy-check',
    'pnpm test:unit',
    'pnpm test:integration',
    'pnpm test:types',
    'pnpm test:security',
    'pnpm test:property',
    'pnpm test:coverage',
    'pnpm test:package',
    'pnpm bench:ci',
    'name: Required gates',
    "job.result !== 'success'",
  ],
  'CI workflow',
);
assert(!/fail-fast:\s*true/iu.test(ci), 'Required matrices must not fail fast');
assert(
  /node-version:\s*\r?\n\s*- 22\.x\r?\n\s*- 24\.x/mu.test(ci),
  'Supported Ubuntu matrix must contain Node.js 22 and 24',
);
assert(
  /os:\s*\r?\n\s*- macos-latest\r?\n\s*- windows-latest/mu.test(ci),
  'Required platform matrix must contain macOS and Windows',
);
requireAll(
  jobs(ci).get('required') ?? '',
  [
    '- fast',
    '- unit-integration',
    '- type-api',
    '- security-property',
    '- coverage',
    '- package',
    '- supported-node',
    '- platform',
    '- performance',
  ],
  'Required gate dependencies',
);
assert(
  !(jobs(ci).get('required') ?? '').includes('node-26-advisory'),
  'Node.js 26 must remain advisory',
);

requireAll(
  ci,
  [
    'name: coverage-${{ github.run_id }}',
    'path: coverage/',
    'name: packed-tarball-${{ github.run_id }}',
    'path: artifacts/*.tgz',
  ],
  'Required CI artifacts',
);

requireAll(
  nightly,
  [
    'schedule:',
    'workflow_dispatch:',
    'cancel-in-progress: false',
    'pnpm test:property:nightly',
    'pnpm test:fuzz:nightly',
    'pnpm bench:ci',
    'path: test/property/regressions/last-failure.json',
    'path: test/fuzz-corpus/generated/last-failure.json',
    'name: Nightly summary',
    "job.result !== 'success'",
  ],
  'Nightly workflow',
);

for (const workflow of [ci, nightly]) {
  for (const match of workflow.matchAll(/^\s+path:\s*(.+)$/gmu)) {
    const artifactPath = (match[1] ?? '').trim();
    assert(
      !/(?:^|[/\\])\.env(?:\.|$)|\$GITHUB_WORKSPACE|^\.\/?$|\*\*/iu.test(
        artifactPath,
      ),
      `Unsafe artifact path: ${artifactPath}`,
    );
  }
}

requireAll(
  dependabot,
  [
    'version: 2',
    'package-ecosystem: npm',
    'package-ecosystem: github-actions',
    'interval: weekly',
    'open-pull-requests-limit:',
  ],
  'Dependabot policy',
);
assert(
  !/(?:auto-merge|automerge)/iu.test(dependabot),
  'Dependency updates must not enable automatic merge',
);

requireAll(
  checklist,
  [
    'Required gates',
    'strict up-to-date branches',
    'at least one approving review',
    'block force pushes and deletion',
    'Fork pull request permissions',
    'Cancelled run',
    'Cache miss',
    'Windows failure',
    'Fuzz artifact',
    'Documentation drift',
    'contains a synthetic minimized fixture',
    'no environment dump or raw secret',
  ],
  'Branch protection checklist',
);

const scenarios = [
  ['fork PR permissions', /pull_request:/u, /contents:\s*read/iu],
  [
    'cancelled run',
    /cancel-in-progress:\s*true/iu,
    /if:\s*\$\{\{ always\(\) \}\}/u,
  ],
  ['cache miss', /cache:\s*pnpm/iu, /pnpm install --frozen-lockfile/u],
  ['Windows failure', /windows-latest/u, /- platform/u],
  ['fuzz artifact', /if:\s*\$\{\{ failure\(\) \}\}/u, /minimized-fuzz-corpus/u],
  ['docs drift', /pnpm docs:check/u, /- fast/u],
];

for (const [name, control, propagation] of scenarios) {
  const source = name === 'fuzz artifact' ? nightly : ci;
  assert(control.test(source), `${name} is missing its primary control`);
  assert(
    propagation.test(source),
    `${name} is not propagated to visible failure`,
  );
}

console.log(
  `CI policy check passed: pinned actions, read-only PR permissions, ` +
    `supported matrix, artifacts, and ${String(scenarios.length)} scenarios`,
);
