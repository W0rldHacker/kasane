# Release candidate final audit

Status: accepted and signed for `1.0.0-rc.1`.

## Defect and change audit

- Open GitHub P0 product defects: **0**.
- Open GitHub P1 product defects: **0**.
- Post-beta public API or option changes: **0**.
- Open automated dependency PRs are excluded from RC and do not alter the
  frozen lockfile or build inputs.

## Security boundary review

| Boundary | Required evidence | Preparation result |
| --- | --- | --- |
| Secret leakage | redaction suites, canaries, tarball secret scan, safe diagnostics | Accepted; no known defect |
| Prototype pollution | dangerous-key normalization, merge, property and fuzz suites | Accepted; no known defect |
| Resource exhaustion | file/node/depth/string/path/cache/diagnostic budgets and performance gates | Accepted; no known defect |
| Packaging and supply chain | zero runtime dependencies, allowlist, lifecycle rejection, pinned Actions, OIDC provenance | Accepted; no known defect |

The accepted threat boundaries remain those in
[the threat model](../threat-model.md). Custom executable code is trusted and is
not sandboxed; direct raw snapshot access can expose intentionally loaded
secrets.

## Operational security follow-up

Private vulnerability reporting is enabled and `SECURITY.md` points to the
private advisory form. Repository API evidence shows one direct admin
maintainer. The release manager confirmed that this is intentionally a solo
project and no backup maintainer is planned. The resulting availability and
account-recovery exposure is accepted as a Medium operational risk: if the
maintainer is unavailable, security triage and releases pause rather than
bypassing protected CI, OIDC, or disclosure controls. This is not a hidden
P0/P1 product defect and makes no response-time promise.

## Final signature

Signed by release manager `W0rldHacker` through the protected-environment
approval for commit `7357246220e7c4b582b54d0d2a79aa4fa43aa2a8` and release run
[`29692739675`](https://github.com/W0rldHacker/kasane/actions/runs/29692739675)
on 2026-07-19. The workflow artifact and npm tarball are identical at SHA-256
`9097a10e7d321ccec837bb015d75293e04a48a97fc3da40240d6d4746513c067`;
npm published SLSA provenance through trusted OIDC publishing.
