# Repository security settings checklist

This checklist is the maintainer-side counterpart to the public
[security policy](../../SECURITY.md). Complete and re-verify it before a public
beta and after ownership, hosting, or release-workflow changes.

## Private reporting

- [x] The repository is public before beta. GitHub Private Vulnerability
  Reporting is available to external researchers only for public repositories.
- [x] In **Settings → Code security → Private vulnerability reporting**, the
  setting is enabled.
- [ ] From an account without repository access, **Security → Advisories** shows
  **Report a vulnerability** and opens the private advisory form.
- [x] `SECURITY.md` is detected by GitHub and its report link opens
  `https://github.com/W0rldHacker/kasane/security/advisories/new`.
- [ ] Maintainers who own security triage receive new-advisory notifications,
  and at least two maintainers can access the private advisory workspace.
- [x] No public issue form or pull request template asks for a reproduction,
  exploit details, credentials, or other vulnerability evidence. Public
  templates direct security reports to the private advisory form only.

Current verification note: repository visibility and private reporting were
verified through the GitHub repository API on 2026-07-19. The second-account
form exercise and backup-maintainer access remain explicit pre-RC follow-ups.

## Advisory and patch controls

- [ ] Security advisories can create a temporary private fork, and access is
  limited to the reporter and people needed to triage, fix, review, and release.
- [ ] The release owner can publish a patch and the GitHub Security Advisory in
  one coordinated window.
- [ ] Required branch protection remains in force; a private fix receives the
  normal focused regression, security, package, and release checks before it is
  merged or published.
- [ ] Advisory text records affected and patched version ranges, severity,
  mitigations, CWE, credit preference, embargo decision, and the CVE decision.
- [ ] Repository permissions are least-privilege, Actions default to read-only,
  and publish credentials or OIDC environments are unavailable to untrusted
  pull requests.
- [ ] A backup maintainer can complete disclosure if the initial incident owner
  becomes unavailable; the policy promises communication but no fixed SLA.

## Verification record

Record evidence without copying vulnerability details or secrets:

| Field | Value |
| --- | --- |
| Date and verifier | 2026-07-19, `W0rldHacker` release review |
| Repository visibility | Public; GitHub API verified |
| Private reporting enabled | Yes; GitHub API returned `enabled: true` |
| External-account report-form check | Pending a second account before RC |
| Notification recipients checked | Primary maintainer only; backup pending |
| Backup incident owner checked | Pending before RC |
| Branch/release protection evidence | Required CI and protected `npm` environment exercised by alpha release |
| Follow-up actions and owners | `W0rldHacker`: add and rehearse a backup advisory/release maintainer before RC |
