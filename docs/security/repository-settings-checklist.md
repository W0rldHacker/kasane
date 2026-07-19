# Repository security settings checklist

This checklist is the maintainer-side counterpart to the public
[security policy](../../SECURITY.md). Complete and re-verify it before a public
beta and after ownership, hosting, or release-workflow changes.

## Private reporting

- [x] The repository is public before beta. GitHub Private Vulnerability
  Reporting is available to external researchers only for public repositories.
- [x] In **Settings → Code security → Private vulnerability reporting**, the
  setting is enabled.
- [x] A **Report a vulnerability** request from an account without repository
  access starts at the private advisory URL. The anonymous route redirects to
  GitHub authentication with that URL preserved as `return_to`; the repository
  API independently confirms that private reporting is enabled.
- [x] `SECURITY.md` is detected by GitHub and its report link opens
  `https://github.com/W0rldHacker/kasane/security/advisories/new`.
- [x] Security triage is owned by the sole maintainer, `W0rldHacker`. No backup
  maintainer exists or is planned; the release manager explicitly accepts this
  availability risk for the solo project.
- [x] No public issue form or pull request template asks for a reproduction,
  exploit details, credentials, or other vulnerability evidence. Public
  templates direct security reports to the private advisory form only.

Current verification note: repository visibility, private reporting, anonymous
authentication routing, branch protection, protected-environment approval, and
OIDC publication were verified on 2026-07-19. Solo-maintainer continuity is a
documented accepted risk, not an unowned follow-up.

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
- [x] If the sole maintainer is unavailable, disclosure and publishing pause;
  protected controls are not bypassed and the policy promises no fixed SLA.

## Verification record

Record evidence without copying vulnerability details or secrets:

| Field | Value |
| --- | --- |
| Date and verifier | 2026-07-19, `W0rldHacker` release review |
| Repository visibility | Public; GitHub API verified |
| Private reporting enabled | Yes; GitHub API returned `enabled: true` |
| External-account report-form check | Anonymous route preserves the private advisory destination through GitHub authentication |
| Notification recipients checked | Sole owner: `W0rldHacker` |
| Backup incident owner checked | Not applicable; solo-maintainer availability risk accepted |
| Branch/release protection evidence | Exact RC full matrix and protected OIDC publication run `29692739675` |
| Follow-up actions and owners | None; reconsider redundancy if project governance changes |
