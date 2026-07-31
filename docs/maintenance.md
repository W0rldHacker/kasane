# Stable maintenance policy

This policy describes how Kasane maintains the current stable major without
promising indefinite LTS or a response-time SLA. The machine-readable source for
the support dates, Node lines, owner, quarterly schedule, and repository labels
is [the maintenance policy](../.github/maintenance-policy.json).

## Which releases are supported?

<!-- maintenance-support:start -->

| Release line                    | Status           | Fix policy                                                        | Runtime window                                                                                                      |
| ------------------------------- | ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `1.x` latest minor and patch    | Supported        | Compatible production and security fixes                          | Node.js 22 and 24; commitment ends no later than 2027-04-30 unless an explicit funded extension replaces this table |
| Earlier `1.x` minors or patches | Upgrade required | Security backport only when an advisory explicitly names the line | No independent runtime window                                                                                       |
| `0.x` prereleases               | Unsupported      | No fixes or backports                                             | None                                                                                                                |
| `main`                          | Development only | Fixes are prepared here; it is not a release                      | Required CI matrix                                                                                                  |

<!-- maintenance-support:end -->

Only the latest published patch of the latest `1.x` minor receives ordinary
bug fixes. Older `1.x` releases normally receive an upgrade path. A security
advisory may name an older minor for a narrow backport when upgrading first is
unsafe or impractical.

The current commitment began with `1.0.0` on 2026-07-19. It ends no later than
the first required upstream runtime EOL, Node.js 22 on 2027-04-30, unless a new
policy explicitly records people, funding, CI, and patch-delivery capacity for
an extension. A new major gets its own reviewed support window. Silence never
extends support.

## Who owns triage and releases?

Kasane currently has one maintainer, `W0rldHacker`. The same person is the
triage owner, patch release owner, Node support owner, and private security
coordinator. Every accepted report is assigned to that owner or is explicitly
marked blocked; an unassigned accepted report cannot leave triage.

There is no backup maintainer. If the owner is unavailable, public triage,
security coordination, and releases pause rather than bypassing review,
protected environments, or required CI. This ownership model offers no fixed
acknowledgement, remediation, or release SLA.

Public reports start with `status:needs-triage`. The maintainer confirms the
affected supported version, reproduces with synthetic data, assigns exactly one
severity label, records a disposition and target, and removes the triage label.
Undisclosed vulnerabilities never enter a public issue; they use
[private vulnerability reporting](../SECURITY.md#reporting-a-vulnerability).

Use `type:regression` when a supported earlier version worked,
`type:deprecation` for a public migration, `area:node-support` for runtime/EOL
work, and `release:blocker` only when the targeted release cannot safely ship.
The `maintenance` label owns the quarterly review record.

## How is severity assigned?

| Label | Meaning | Release consequence |
| --- | --- | --- |
| `severity:critical` | Widespread loss of a documented guarantee, package/publish compromise, data exposure, or an unusable supported release | Stop unrelated release work; prepare the smallest safe release as soon as its regression and protected gates pass |
| `severity:high` | Production-blocking guarantee failure with no safe workaround | Target the next patch; it is a blocker for an overlapping minor |
| `severity:medium` | Localized production defect with a documented safe workaround | Queue for the next appropriate patch and review it at the quarterly checkpoint |
| `severity:low` | Low-impact correctness, documentation, diagnostics, or ergonomics issue | Backlog or batch with a related patch/minor; no promised date |

Severity describes impact, not reporter priority or implementation size. A
security report is scored privately and receives a public label only after
coordinated disclosure makes that safe.

## What is the patch and minor cadence?

Patch releases are demand-driven. Critical fixes are not held for a calendar;
other compatible fixes may be batched when this does not increase user risk.
Every patch is prepared by a reviewed Changeset, the release PR, required CI,
the protected npm workflow, provenance, and post-publish consumers.

Minor releases contain compatible capabilities or deprecations and ship only
when their documentation, migration notes, regression coverage, and supported
Node matrix are ready. There is no fixed minor cadence. A minor must not absorb
an unresolved critical/high defect affecting the same contract.

Every production defect gets a deterministic regression test that fails without
the fix. If a defect cannot be reproduced, the issue records the missing
evidence and remains in triage; it is not closed as fixed. A minimized
property/fuzz failure keeps its seed or canonical fixture. Package defects also
add a packed or registry consumer when that is the boundary that failed.

## How do deprecations work?

A public deprecation is introduced in a minor release. Its Changeset and docs
name the deprecated surface, supported replacement, migration link, first
deprecated version, and earliest eligible removal. The old surface remains
available for at least one complete minor release and removal waits for a major
release.

An urgent security fix may shorten that waiting window only when a private
advisory records the threat, affected versions, explicit maintainer approval,
why a compatible mitigation is insufficient, and the safest migration. The
release remains SemVer-correct: use a compatible security patch when possible;
an unavoidable breaking removal is expedited as a major release. The advisory
and release notes call out the shortened window.

## How are security fixes and backports handled?

1. Receive and triage the report in a private GitHub Security Advisory. Name the
   security owner, affected supported releases, severity, embargo, and whether
   active exploitation is known.
2. Add a synthetic regression that fails on every affected line. Never copy
   reporter secrets or exploit material into the public repository.
3. Fix `main` in the advisory's private workspace and run the focused security,
   package, type, and complete verification gates.
4. Prefer an upgrade to the latest `1.x` minor. Backport only the minimal fix and
   regression to an older `1.x` minor when the advisory explains why upgrading
   first is unsafe or impractical. Do not backport features or refactors.
5. Rehearse each target from its release tag, compare its tarball, and publish
   each immutable patch through the protected npm environment. Never reuse a
   version or use routine `npm unpublish` as rollback.
6. Publish the patch, advisory, affected/patched ranges, mitigation, migration,
   provenance, and any CVE together. Retain a sanitized regression after the
   embargo ends.

If the newest stable line needs a breaking security change, ship a compatible
containment patch first when one exists, then expedite the major migration. If
no compatible containment exists, the advisory documents the breaking major
and any operational mitigation before coordinated disclosure.

## How is Node.js EOL handled?

The required lines are Node.js 22 and 24; Node.js 26 is advisory. Dates are
mirrored from the official
[Node.js release schedule](https://github.com/nodejs/Release#release-schedule)
and checked by the quarterly workflow.

| Node line | Kasane status | Upstream EOL | Maintenance action |
| --- | --- | --- | --- |
| 22 | Required | 2027-04-30 | Open migration review by 2026-10-31; announce the support decision by 2027-01-30 |
| 24 | Required | 2028-04-30 | Keep in required CI and review quarterly |
| 26 | Advisory | 2029-04-30 | Failures do not block until an explicit support-policy change |

Dropping a supported Node line raises the runtime floor and therefore requires
a major release. At least 180 days before the earliest required-line EOL, the
owner opens an `area:node-support` migration issue covering ecosystem readiness,
CI, docs, engines, consumers, and rollback. At least 90 days before EOL, the
owner announces one of two explicit outcomes:

- release a new major that drops the EOL line before the upstream date; or
- publish a separately resourced extension policy with an end date, CI matrix,
  security intake, and patch owner.

Without one of those outcomes, support for the affected Kasane major ends at
the upstream EOL date. Kasane never silently promises support for an upstream
EOL runtime.

## What happens in the quarterly review?

On January 1, April 1, July 1, and October 1, the scheduled maintenance workflow
checks the generated support table and official Node EOL dates, then opens one
idempotent `maintenance` issue for the quarter. The owner reviews:

- direct and transitive dependency advisories, licenses, provenance, and stale
  packages;
- pinned GitHub Actions, pnpm, npm trusted publishing, TypeScript, test runners,
  linters, package auditors, and lockfile reproducibility;
- required/advisory Node lines, upstream EOL dates, operating systems, and clean
  packed/registry consumers;
- open regressions, deprecations, security backport obligations, failed
  publishes, and upcoming patch/minor candidates;
- whether this support table, labels, issue forms, threat model, migrations, and
  release documentation still describe reality.

Dependency updates never auto-merge. The review issue records evidence,
accepted risk, owners, and target releases before it closes.

Run `pnpm maintenance:table -- --write` after an approved policy-data change;
CI uses `pnpm maintenance:table -- --check` and rejects hand-edited table drift.
`pnpm maintenance:check -- --check-upstream` additionally compares checked-in
Node EOL dates with the official schedule.

## How are failed patch publishes handled?

First determine whether npm accepted the version. If the version is absent, fix
the pre-publish cause and retry the exact audited commit through the protected
workflow. If npm already contains the version, do not run publish again: compare
the registry tarball digest and provenance with the audited artifact and resume
only verification/announcement steps.

If the accepted artifact is incorrect, compromised, or fails consumers, keep
the immutable version as evidence, document the limitation, and prepare the
next patch version with a regression. Do not overwrite the version and do not
use routine `npm unpublish` as rollback. Dist-tags may move only to a verified
corrective version.

## Which tabletop outcomes are required?

The maintenance dry-run workflow exercises these decisions without publishing:

| Scenario | Expected decision |
| --- | --- |
| Regression issue | Assign owner and severity, reproduce on a supported version, add a failing regression, and target a compatible patch |
| Node EOL | Open the migration review at T-180; dropping the line requires a major or an explicitly resourced extension |
| Breaking security fix | Keep details private, prefer a containment patch, and expedite a major with advisory-backed shortened deprecation when unavoidable |
| Deprecated option | Introduce in a minor with replacement/migration; retain for one complete minor and remove only in a major |
| Failed patch publish | Query npm first; never reuse/overwrite/unpublish an accepted version, verify it or prepare the next patch |

The `patch-release` dry-run also proves an ordinary regression Changeset becomes
`1.0.1`; `security-patch-release` proves a compatible `Security:` Changeset does
the same while retaining private-advisory and regression requirements.
