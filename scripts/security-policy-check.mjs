import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const policyPath = path.join(root, 'SECURITY.md');
const checklistPath = path.join(
  root,
  'docs',
  'security',
  'repository-settings-checklist.md',
);
const incidentPath = path.join(
  root,
  'docs',
  'security',
  'incident-template.md',
);

const [policy, checklist, incident, manifestText] = await Promise.all([
  readFile(policyPath, 'utf8'),
  readFile(checklistPath, 'utf8'),
  readFile(incidentPath, 'utf8'),
  readFile(path.join(root, 'package.json'), 'utf8'),
]);
const manifest = JSON.parse(manifestText);
const repositoryUrl = manifest.repository?.url;
assert.equal(
  typeof repositoryUrl,
  'string',
  'package.json needs repository.url',
);
const repositoryMatch = repositoryUrl.match(
  /github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/u,
);
assert(repositoryMatch, 'repository.url must identify a GitHub repository');
const repository = repositoryMatch[1];
const privateReportUrl = `https://github.com/${repository}/security/advisories/new`;

function section(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = markdown.match(
    new RegExp(`^## ${escaped}\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'mu'),
  );
  assert(match, `SECURITY.md is missing section: ${heading}`);
  return match[1];
}

function requireAll(text, fragments, label) {
  const normalizedText = text.replace(/\s+/gu, ' ').toLowerCase();
  for (const fragment of fragments) {
    assert(
      normalizedText.includes(fragment.replace(/\s+/gu, ' ').toLowerCase()),
      `${label} must include: ${fragment}`,
    );
  }
}

function markdownLinks(markdown) {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)].map(
    (match) => match[1],
  );
}

const supported = section(policy, 'Supported versions');
requireAll(
  supported,
  [
    '`1.x` latest minor and patch',
    'Earlier `1.x` minors or patches',
    '`0.x` prereleases',
    '`main`',
    'Security backport',
    '2027-04-30',
  ],
  'Supported versions table',
);
assert(
  /^\|\s*Release line\s*\|\s*Status\s*\|\s*Fix policy\s*\|\s*Runtime window\s*\|$/mu.test(
    supported,
  ),
  'Supported versions table needs release, status, fixes, and runtime columns',
);

const reporting = section(policy, 'Reporting a vulnerability');
requireAll(
  reporting,
  [
    'GitHub private vulnerability reporting',
    'Do not open a public issue',
    'affected Kasane version or commit',
    'minimal reproduction',
    'impact',
    'attack preconditions',
    'public disclosure',
    'suggested mitigations',
    'credit',
  ],
  'Private reporting instructions',
);
assert(
  policy.includes(`[private-report]: ${privateReportUrl}`),
  `Private report link must target ${privateReportUrl}`,
);
assert(
  !/github\.com\/[^\s)]+\/issues\/(?:new|\d+)/u.test(reporting),
  'The vulnerability reporting section must not route reports to issues',
);

const disclosure = section(policy, 'Coordinated disclosure and embargo');
requireAll(
  disclosure,
  [
    'private GitHub Security Advisory',
    'embargo plan',
    'private workspace',
    'regression test',
    'patch release and advisory are published together',
    'no guaranteed acknowledgement, remediation, or publication SLA',
  ],
  'Disclosure workflow',
);

const advisory = section(policy, 'Advisory and CVE criteria');
requireAll(
  advisory,
  [
    'supported published Kasane release',
    'confidentiality, integrity, availability',
    'affected versions',
    'patched versions',
    'request a CVE through GitHub',
    'documentation-only corrections',
    'outside the threat model',
  ],
  'Advisory criteria',
);

const boundary = section(policy, 'Security guarantee boundary');
requireAll(
  boundary,
  [
    'snapshot.value',
    'can expose a secret',
    'Custom sources, parsers, validators, and Proxy traps',
    'trusted executable code',
    'does not sandbox',
    'not a password hash',
    'Unkeyed fingerprints of low-entropy values can be guessed offline',
  ],
  'Security boundary',
);
assert(
  !/Kasane (?:provides|creates|uses|runs)[^.\n]{0,50}(?:secure )?sandbox/iu.test(
    policy,
  ),
  'SECURITY.md must not promise a custom-code sandbox',
);

requireAll(
  checklist,
  [
    'Private Vulnerability Reporting',
    'Report a vulnerability',
    'account without repository access',
    'No public issue form or pull request template asks',
    'temporary private fork',
    'publish a patch and the GitHub Security Advisory',
    'least-privilege',
    'no fixed SLA',
  ],
  'Repository settings checklist',
);
assert(
  checklist.includes(privateReportUrl),
  'Repository checklist must verify the canonical private report URL',
);

requireAll(
  incident,
  [
    'Never create it as a public issue or pull request',
    'synthetic canaries',
    'Incident owner and backup',
    'Affected version or commit',
    'active exploitation',
    'trusted custom source/parser/validator/Proxy code',
    'revoke or rotate',
    'pnpm test:security',
    'pnpm security:policy-check',
    'GitHub Security Advisory and request a CVE',
    'Scenario addendum: prototype pollution disclosure',
    'Scenario addendum: secret leak incident',
  ],
  'Incident template',
);
requireAll(
  incident,
  [
    '`__proto__`, `prototype`, and `constructor`',
    'no partial snapshot is returned',
    'advisory candidate',
  ],
  'Prototype pollution tabletop',
);
requireAll(
  incident,
  [
    'Revoke or rotate every exposed credential',
    'stdout, stderr, JSON, inspection, explain, diff, errors, events',
    '`snapshot.value`, `get()`, or `require()`',
  ],
  'Secret leak incident drill',
);

for (const link of markdownLinks(policy)) {
  if (/^(?:https?:|mailto:|#)/u.test(link)) continue;
  const target = link.split('#', 1)[0];
  if (!target) continue;
  await stat(
    path.resolve(path.dirname(policyPath), decodeURIComponent(target)),
  );
}

const issueTemplateDirectory = path.join(root, '.github', 'ISSUE_TEMPLATE');
try {
  for (const entry of await readdir(issueTemplateDirectory, {
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const template = await readFile(
      path.join(issueTemplateDirectory, entry.name),
      'utf8',
    );
    assert(
      !/(?:vulnerabilit|security).{0,80}(?:exploit|reproduction|proof.of.concept|credential)/isu.test(
        template,
      ),
      `Public issue template ${entry.name} appears to request exploit details`,
    );
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const scenarios = [
  {
    name: 'prototype pollution disclosure',
    report: {
      supportedRelease: true,
      crossedDocumentedBoundary: true,
      secretExposure: false,
    },
    expected: {
      channel: 'private-advisory',
      advisoryCandidate: true,
      incidentAddendum: 'prototype-pollution',
    },
  },
  {
    name: 'secret leak incident drill',
    report: {
      supportedRelease: true,
      crossedDocumentedBoundary: true,
      secretExposure: true,
    },
    expected: {
      channel: 'private-advisory',
      advisoryCandidate: true,
      incidentAddendum: 'secret-leak-and-rotation',
    },
  },
];

function routeScenario(scenario) {
  return {
    channel: 'private-advisory',
    advisoryCandidate:
      scenario.supportedRelease && scenario.crossedDocumentedBoundary,
    incidentAddendum: scenario.secretExposure
      ? 'secret-leak-and-rotation'
      : 'prototype-pollution',
  };
}

for (const scenario of scenarios) {
  assert.deepEqual(
    routeScenario(scenario.report),
    scenario.expected,
    `${scenario.name} did not follow the documented private workflow`,
  );
}

console.log(
  `Security policy check passed: supported versions, private disclosure, ` +
    `boundaries, and ${String(scenarios.length)} incident scenarios`,
);
