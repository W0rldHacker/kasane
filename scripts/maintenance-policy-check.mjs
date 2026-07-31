import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  replaceSupportTable,
  supportTable,
  validateMaintenancePolicy,
} from './maintenance-policy.mjs';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');
const policy = JSON.parse(await read('.github/maintenance-policy.json'));
validateMaintenancePolicy(policy);

const [
  maintenance,
  security,
  platform,
  versioning,
  workflow,
  regression,
  deprecation,
  config,
  manifestText,
] = await Promise.all([
  read('docs/maintenance.md'),
  read('SECURITY.md'),
  read('docs/platform-support.md'),
  read('docs/versioning.md'),
  read('.github/workflows/maintenance.yml'),
  read('.github/ISSUE_TEMPLATE/regression.yml'),
  read('.github/ISSUE_TEMPLATE/deprecation.yml'),
  read('.github/ISSUE_TEMPLATE/config.yml'),
  read('package.json'),
]);

function requireAll(source, fragments, label) {
  const normalized = source.replace(/\s+/gu, ' ').toLowerCase();
  for (const fragment of fragments) {
    assert(
      normalized.includes(fragment.replace(/\s+/gu, ' ').toLowerCase()),
      `${label} must include: ${fragment}`,
    );
  }
}

const table = supportTable(policy);
for (const [name, document] of [
  ['docs/maintenance.md', maintenance],
  ['SECURITY.md', security],
]) {
  assert.equal(
    replaceSupportTable(document, table),
    document,
    `${name} support table is stale`,
  );
}

const manifest = JSON.parse(manifestText);
assert.equal(
  Number(manifest.version.split('.')[0]),
  policy.stableMajor,
  'Package and maintenance stable major differ',
);
assert.equal(manifest.engines?.node, '>=22', 'Node runtime floor drifted');

requireAll(
  maintenance,
  [
    policy.owner,
    'There is no backup maintainer',
    'no fixed acknowledgement, remediation, or release SLA',
    'severity:critical',
    'severity:high',
    'severity:medium',
    'severity:low',
    'Every production defect gets a deterministic regression test',
    'at least one complete minor release',
    'removal waits for a major release',
    'private GitHub Security Advisory',
    'Backport only the minimal fix and regression',
    'January 1, April 1, July 1, and October 1',
    'never silently promises support for an upstream EOL runtime',
    'do not use routine `npm unpublish`',
    'Regression issue',
    'Node EOL',
    'Breaking security fix',
    'Deprecated option',
    'Failed patch publish',
  ],
  'Maintenance policy',
);
requireAll(
  security,
  ['`1.x` latest minor and patch', 'Security backport', '2027-04-30'],
  'Security support policy',
);
requireAll(
  platform,
  ['Node.js 22 and 24', 'Node.js 26 is advisory'],
  'Platform support',
);
requireAll(
  versioning,
  ['at least one minor release', 'actively exploitable vulnerability'],
  'Deprecation policy',
);

for (const label of policy.labels) {
  assert(
    maintenance.includes(`\`${label.name}\``) ||
      ['status:needs-triage', 'maintenance'].includes(label.name),
    `${label.name} is not explained by the maintenance policy`,
  );
}

requireAll(
  regression,
  [
    'status:needs-triage',
    'type:regression',
    'Installed Kasane version',
    'Last known working version',
    'Node.js version',
    'Production impact',
    'Safe reproduction',
    'SECURITY.md',
  ],
  'Regression issue form',
);
requireAll(
  deprecation,
  [
    'status:needs-triage',
    'type:deprecation',
    'Public surface',
    'Replacement and migration',
    'Compatibility impact',
  ],
  'Deprecation issue form',
);
requireAll(
  config,
  ['blank_issues_enabled: false', 'Private vulnerability report'],
  'Issue template config',
);

requireAll(
  workflow,
  [
    'schedule:',
    "cron: '17 8 1 1,4,7,10 *'",
    'workflow_dispatch:',
    'patch-release',
    'security-patch-release',
    'pnpm maintenance:check',
    'pnpm release:dry-run',
    'pnpm maintenance:tabletop',
    '--check-upstream',
    'issues: write',
    'gh issue create',
  ],
  'Maintenance workflow',
);
for (const match of workflow.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gmu)) {
  assert(
    /^[^/@]+\/[^/@]+@[0-9a-f]{40}$/u.test(match[1]),
    `Maintenance action must be pinned: ${match[1]}`,
  );
}
assert(
  !/id-token:\s*write/iu.test(workflow),
  'Dry-run workflow cannot use OIDC',
);
assert(
  !/packages:\s*write/iu.test(workflow),
  'Dry-run workflow cannot publish',
);
assert(
  !/npm publish(?!\s+--dry-run)/iu.test(workflow),
  'Dry-run workflow cannot publish',
);

if (process.argv.includes('--check-upstream')) {
  const response = await fetch(
    'https://raw.githubusercontent.com/nodejs/Release/main/schedule.json',
  );
  assert(response.ok, `Could not read Node schedule: HTTP ${response.status}`);
  const upstream = await response.json();
  for (const line of policy.nodeLines) {
    assert.equal(
      upstream[`v${line.major}`]?.end,
      line.upstreamEol,
      `Node ${line.major} upstream EOL changed; review the support policy`,
    );
  }
}

console.log(
  `Maintenance policy check passed: owner, support table, Node EOL, labels, forms, workflow, and ${process.argv.includes('--check-upstream') ? 'upstream schedule' : 'offline schedule'}`,
);
