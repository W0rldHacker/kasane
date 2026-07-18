# Private security incident template

Create this record inside the private GitHub Security Advisory or another
access-controlled maintainer workspace. Never create it as a public issue or
pull request. Use synthetic canaries in reproductions. Do not paste secret
plaintext, production configuration, access tokens, raw dumps, or unnecessary
personal data into this record.

## Intake

| Field | Value |
| --- | --- |
| Private advisory URL | |
| Incident owner and backup | |
| Reporter contact and credit preference | |
| Date reported | |
| Affected version or commit | |
| Node.js and platform | |
| Short safe summary | |
| Public disclosure or active exploitation known? | Unknown / No / Yes |
| Embargo participants | |
| Next private update | Best-effort date, not an SLA |

Store the reporter's original evidence only in the private advisory. Replace
real-looking values with named canaries in the working reproduction.

## Triage and scope

- [ ] Reproduce with a minimal synthetic fixture.
- [ ] Classify the crossed boundary: confidentiality, integrity, availability,
  normalization, prototype safety, resource limit, secret diagnostic, package,
  or supply chain.
- [ ] Confirm whether the behavior is in Kasane's data plane or in trusted
  custom source/parser/validator/Proxy code.
- [ ] Identify every affected supported version and the first patched version.
- [ ] Check all equivalent surfaces and entry points, not only the reported
  reproduction.
- [ ] Assign a provisional severity and CWE with explicit preconditions.
- [ ] Decide whether immediate user mitigation is safe and testable.

## Containment and evidence

- [ ] Limit incident access to the reporter and required responders.
- [ ] Preserve only the minimum sanitized evidence needed for investigation.
- [ ] If a secret may have escaped, identify the owner through metadata without
  copying the value; revoke or rotate it at its authoritative provider.
- [ ] Remove exposed secrets from logs, artifacts, caches, and test output where
  deletion is supported; do not treat deletion as a substitute for rotation.
- [ ] Record exposure window, affected consumers, and notification decisions in
  the restricted record.
- [ ] Use obvious canaries to verify that stdout, stderr, JSON, inspection,
  explain, diff, errors, events, coverage, and packaged artifacts are clean.

## Fix, advisory, and release

- [ ] Agree on an embargo target and conditions for shortening it; record
  reporter feedback without promising an SLA.
- [ ] Prepare the fix in the advisory's private workspace and add a minimized
  regression test that contains no real incident data.
- [ ] Run the focused suite, `pnpm test:security`, `pnpm docs:check`,
  `pnpm security:policy-check`, package checks, and the applicable release gate.
- [ ] Review adjacent bypasses, supported release lines, compatibility impact,
  and whether a backport or safe upgrade path is required.
- [ ] Draft affected/patched ranges, severity, CWE, impact, mitigations, credits,
  and release notes.
- [ ] Decide and record whether to publish a GitHub Security Advisory and request
  a CVE using the criteria in `SECURITY.md`.
- [ ] Publish the tested patch and advisory in the coordinated window, then
  notify the reporter and known affected parties privately or publicly as
  appropriate.

## Scenario addendum: prototype pollution disclosure

Use this addendum for a report that bypasses dangerous-key rejection or changes
an object prototype.

- [ ] Keep the reproduction and exploit details in the private advisory.
- [ ] Test `__proto__`, `prototype`, and `constructor` at the root and nested in
  objects and arrays, including source and validator output paths.
- [ ] Check the prototype before and after rejection and confirm that no partial
  snapshot is returned.
- [ ] Treat a reproducible bypass in a supported release as an advisory
  candidate and maintain the embargo through patch preparation.

## Scenario addendum: secret leak incident

Use this addendum when a correctly annotated secret appears in a Kasane-owned
diagnostic surface.

- [ ] Determine whether plaintext reached JSON, inspection, explain, diff,
  validation issues, errors, lifecycle events, stdout, stderr, or an artifact.
- [ ] Revoke or rotate every exposed credential at its authoritative provider;
  a fingerprint change or log deletion is not remediation.
- [ ] Test the central redactor and every equivalent diagnostic surface with a
  synthetic canary.
- [ ] Distinguish a library-owned diagnostic leak from deliberate raw access to
  `snapshot.value`, `get()`, or `require()` and from trusted custom code. Record
  the boundary decision even when the report is out of scope.
- [ ] Preserve a sanitized regression and complete downstream notification and
  post-incident actions before closing the private record.

## Closure and follow-up

| Field | Value |
| --- | --- |
| Patched version and release URL | |
| Advisory and CVE decision | |
| Publication date | |
| Reporter notified and credited | |
| Rotation/revocation completed | Not applicable / Evidence reference |
| Regression test | |
| Root cause and missed control | |
| Documentation or threat-model changes | |
| Follow-up owner and target | |
