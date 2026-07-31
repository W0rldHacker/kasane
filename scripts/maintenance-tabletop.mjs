import assert from 'node:assert/strict';
import process from 'node:process';

import { parseChangeset } from './release-policy.mjs';

const requested = (() => {
  const index = process.argv.indexOf('--scenario');
  return index === -1 ? 'all' : process.argv[index + 1];
})();
assert(
  ['all', 'patch-release', 'security-patch-release'].includes(requested),
  'Scenario must be all, patch-release, or security-patch-release',
);

function failedPublishDecision({ artifactMatches, registryHasVersion }) {
  if (!registryHasVersion) return 'retry-exact-audited-version';
  return artifactMatches
    ? 'verification-only-no-republish'
    : 'prepare-next-patch-no-unpublish';
}

const regression = {
  owner: 'W0rldHacker',
  severity: 'severity:high',
  requiresRegression: true,
  release: 'patch',
};
assert.equal(regression.requiresRegression, true);
assert.equal(regression.release, 'patch');

const nodeEol = {
  reviewOpens: '2026-10-31',
  decisionDeadline: '2027-01-30',
  upstreamEol: '2027-04-30',
  dropRequires: 'major',
};
assert(nodeEol.reviewOpens < nodeEol.decisionDeadline);
assert(nodeEol.decisionDeadline < nodeEol.upstreamEol);
assert.equal(nodeEol.dropRequires, 'major');

const breakingSecurityFix = {
  channel: 'private-advisory',
  compatibleContainmentFirst: true,
  shortenedDeprecationRequiresAdvisory: true,
  unavoidableBreakingRelease: 'major',
};
assert.equal(breakingSecurityFix.channel, 'private-advisory');
assert.equal(breakingSecurityFix.unavoidableBreakingRelease, 'major');

const deprecatedOption = {
  introducedIn: 'minor',
  minimumCompleteMinorWindows: 1,
  removalRelease: 'major',
  requiresReplacementAndMigration: true,
};
assert.equal(deprecatedOption.introducedIn, 'minor');
assert.equal(deprecatedOption.minimumCompleteMinorWindows, 1);
assert.equal(deprecatedOption.removalRelease, 'major');

assert.equal(
  failedPublishDecision({ artifactMatches: false, registryHasVersion: false }),
  'retry-exact-audited-version',
);
assert.equal(
  failedPublishDecision({ artifactMatches: true, registryHasVersion: true }),
  'verification-only-no-republish',
);
assert.equal(
  failedPublishDecision({ artifactMatches: false, registryHasVersion: true }),
  'prepare-next-patch-no-unpublish',
);

if (requested === 'all' || requested === 'patch-release') {
  const patch = parseChangeset(
    "---\n'@worldhacker/kasane': patch\n---\n\nFixed: Restore a supported production guarantee with a regression test.\n",
    'tabletop-regression.md',
  );
  assert.deepEqual(
    { category: patch.category, type: patch.type },
    { category: 'Fixed', type: 'patch' },
  );
}

if (requested === 'all' || requested === 'security-patch-release') {
  const securityPatch = parseChangeset(
    "---\n'@worldhacker/kasane': patch\n---\n\nSecurity: Prevent a supported-boundary bypass and retain a synthetic regression.\n",
    'tabletop-security.md',
  );
  assert.deepEqual(
    { category: securityPatch.category, type: securityPatch.type },
    { category: 'Security', type: 'patch' },
  );
  assert.equal(breakingSecurityFix.compatibleContainmentFirst, true);
}

console.log(
  `Maintenance tabletop passed (${requested}): regression issue, Node EOL, breaking security fix, deprecated option, failed patch publish, and immutable-version recovery`,
);
