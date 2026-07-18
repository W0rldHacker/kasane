# Repository security settings checklist

This checklist is the maintainer-side counterpart to the public
[security policy](../../SECURITY.md). Complete and re-verify it before a public
beta and after ownership, hosting, or release-workflow changes.

## Private reporting

- [ ] The repository is public before beta. GitHub Private Vulnerability
  Reporting is available to external researchers only for public repositories.
- [ ] In **Settings → Code security → Private vulnerability reporting**, the
  setting is enabled.
- [ ] From an account without repository access, **Security → Advisories** shows
  **Report a vulnerability** and opens the private advisory form.
- [ ] `SECURITY.md` is detected by GitHub and its report link opens
  `https://github.com/W0rldHacker/kasane/security/advisories/new`.
- [ ] Maintainers who own security triage receive new-advisory notifications,
  and at least two maintainers can access the private advisory workspace.
- [ ] No public issue form or pull request template asks for a reproduction,
  exploit details, credentials, or other vulnerability evidence. Public
  templates direct security reports to the private advisory form only.

Current verification note: the repository was private when this checklist was
added, so GitHub Private Vulnerability Reporting could not yet be enabled or
externally exercised. Do not mark the first four items complete until the
pre-beta visibility change and the external-account test have both succeeded.

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
| Date and verifier | |
| Repository visibility | |
| Private reporting enabled | |
| External-account report-form check | |
| Notification recipients checked | |
| Backup incident owner checked | |
| Branch/release protection evidence | Link to restricted maintainer record |
| Follow-up actions and owners | |
