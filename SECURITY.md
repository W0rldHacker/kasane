# Security Policy

## Supported versions

Kasane supports the current stable major under the bounded window and ownership
rules in the [stable maintenance policy](./docs/maintenance.md). There is no
indefinite LTS or response-time SLA. Ordinary fixes target the latest patch of
the latest `1.x` minor; a security backport to an older minor occurs only when
an advisory explicitly names that line.

<!-- maintenance-support:start -->

| Release line                    | Status           | Fix policy                                                        | Runtime window                                                                                                      |
| ------------------------------- | ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `1.x` latest minor and patch    | Supported        | Compatible production and security fixes                          | Node.js 22 and 24; commitment ends no later than 2027-04-30 unless an explicit funded extension replaces this table |
| Earlier `1.x` minors or patches | Upgrade required | Security backport only when an advisory explicitly names the line | No independent runtime window                                                                                       |
| `0.x` prereleases               | Unsupported      | No fixes or backports                                             | None                                                                                                                |
| `main`                          | Development only | Fixes are prepared here; it is not a release                      | Required CI matrix                                                                                                  |

<!-- maintenance-support:end -->

The table is generated from `.github/maintenance-policy.json` and checked in CI.
Node.js runtime support and upstream EOL migration are documented in the
[platform support policy](./docs/platform-support.md) and
[maintenance policy](./docs/maintenance.md#how-is-nodejs-eol-handled).

## Reporting a vulnerability

Use [GitHub private vulnerability reporting][private-report] to submit a report.
Do not open a public issue, discussion, or pull request, and do not put exploit
details in a public channel. If the private-report link is unavailable, do not
disclose the details publicly; return after the repository has enabled the
hosting platform's private reporting channel.

One private report should include, where known:

- the affected Kasane version or commit and the Node.js version;
- the affected API, source type, and configuration options;
- a minimal reproduction using synthetic values, never production secrets;
- the expected and observed behavior, impact, and likely attack preconditions;
- whether exploitation or public disclosure is already known;
- suggested mitigations or a proposed patch, if available;
- a safe way to credit and contact the reporter.

Maintainers may ask for an encrypted or reduced artifact. Do not attach real
credentials, customer configuration, raw crash dumps, or unrelated personal data
to the report.

## Coordinated disclosure and embargo

The report remains in the private GitHub Security Advisory while maintainers and
the reporter coordinate. The workflow is:

1. A maintainer privately acknowledges and owns triage without promising a fixed
   response time.
2. Maintainers reproduce the issue, identify affected supported releases, assess
   severity and scope, and agree with the reporter on an embargo plan.
3. A fix and regression test are prepared in the advisory's private workspace.
   Only people needed for validation, release, and affected-party coordination
   are added.
4. Maintainers prepare release notes, safe mitigations, affected and patched
   version ranges, credits, and the advisory. A supported affected line gets a
   patch or a documented safe upgrade path before disclosure when practicable.
5. The patch release and advisory are published together. If active exploitation
   or unavoidable prior disclosure changes the risk, maintainers may shorten the
   embargo and will record why in the private incident record.
6. After publication, maintainers notify the reporter, review downstream impact,
   and retain a sanitized regression test and post-incident actions.

There is no bug bounty and no guaranteed acknowledgement, remediation, or
publication SLA. Maintainers will communicate progress and coordinate a
reasonable publication date based on impact and release safety.

## Advisory and CVE criteria

A GitHub Security Advisory is normally published when a confirmed weakness in a
supported published Kasane release can violate confidentiality, integrity,
availability, or a documented security boundary. The advisory records affected
versions, patched versions or mitigations, severity, relevant CWE information,
and reporter credit when requested.

Maintainers normally request a CVE through GitHub when the advisory describes a
published, user-impacting vulnerability for which a stable ecosystem identifier
helps users and scanners identify affected versions. A CVE is normally not
requested for documentation-only corrections, unsupported releases with no
supported shared code, hypothetical weaknesses without security impact, or
behavior explicitly outside the threat model. Those reports may still produce
documentation, hardening, or tests. The final decision is recorded in the
private advisory before publication.

## Security guarantee boundary

Kasane protects its data plane: untrusted configuration values, source results,
validator output, and diagnostic input cross normalization and resource-limit
boundaries. Correctly annotated secrets are structurally redacted from
library-owned JSON, inspection, explanation, diff, error, validation-issue, and
lifecycle-event diagnostics.

The following boundaries are deliberate:

- Direct access to `snapshot.value`, `snapshot.get()`, or `snapshot.require()`
  returns raw configuration and can expose a secret. Application code must not
  log, serialize, return, or attach those values to telemetry or incident
  records.
- Custom sources, parsers, validators, and Proxy traps are trusted executable
  code running in the application process with the application's authority.
  Kasane checks returned data but does not sandbox, preempt, or undo custom
  code.
- A secret fingerprint is a versioned SHA-256 or HMAC-SHA-256 comparison aid. It
  is not a password hash, encryption, authentication proof, or secret storage.
  Unkeyed fingerprints of low-entropy values can be guessed offline.
- Secret annotation reduces accidental disclosure from Kasane-owned diagnostics.
  It does not detect unannotated credentials, replace a secret manager, encrypt
  process memory, or prevent trusted application code from leaking a value.
- Raising resource limits increases the application's worst-case CPU and memory
  exposure. File selection and filesystem containment remain application
  responsibilities.

See the detailed [threat model](./docs/threat-model.md), the user-facing
[secrets guide](./docs/guides/security-and-secrets.md), the maintainer
[repository settings checklist](./docs/security/repository-settings-checklist.md),
and the [incident template](./docs/security/incident-template.md).

[private-report]: https://github.com/W0rldHacker/kasane/security/advisories/new
