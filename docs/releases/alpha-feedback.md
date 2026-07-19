# Alpha feedback tracker

This tracker records evaluation evidence for the current `next` prerelease.
Public feedback may use the repository's **Alpha feedback** issue form. Security
reports belong in the private channel documented by [SECURITY.md](../../SECURITY.md).

## Triage policy

| Severity | Meaning | Required outcome |
| --- | --- | --- |
| Critical | Secret exposure, package takeover/resolution failure, data corruption, or unusable documented quick start | Block the next alpha; assign an owner and release target immediately |
| High | Major API, env, explain, or type friction without a safe documented workaround | Resolve or explicitly migrate before beta |
| Medium | Localized friction with a safe workaround | Document and prioritize before feature freeze |
| Low | Ergonomics or documentation refinement | Track without blocking alpha |

Critical open findings: **0**. This count includes the initial packed and
registry consumer evaluation and must be updated when public reports arrive.

## Pre-publish sample evaluation

| Area | Evidence | Observation | Severity | Status |
| --- | --- | --- | --- | --- |
| API friction | JavaScript ESM and TypeScript NodeNext packed consumers | Root helpers and Standard Schema subpath resolve; inferred and asserted output types compile | None | Verified against audited tarball |
| Env semantics | Integration and documentation suites | Values remain strings by default, keys lower-case by default, collisions fail, explicit maps are recommended | None | Documented; request alpha feedback |
| Explain output | Both packed consumers | Marked secret explains as `[REDACTED]` without the canary | None | Verified against audited tarball |
| Package resolution | publint, attw, main/subpath dynamic imports, forbidden deep imports | Two ESM exports resolve; CommonJS is intentionally unsupported | None | Verified against audited tarball |

## Registry evidence

| Version | Commit | Required CI | Workflow SHA-256 | Registry SHA-256 | Node 22 | Node 24 | Critical findings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `0.1.0-alpha.0` | `f5bf1f4d` | CI `29682525315` | `174a8de2960a…` | `174a8de2960a…` | 22.23.1 passed | 24.18.0 passed | 0 |

## Feedback queue

| Issue | Area | Severity | Decision | Owner | Target |
| --- | --- | --- | --- | --- | --- |
| No alpha product defect reported | All | None | Promote the reviewed API baseline to beta freeze | `W0rldHacker` | Closed at beta gate |
