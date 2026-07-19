# Beta feedback tracker

This tracker owns feedback for the current `beta` prerelease. Public reports use
the repository's **Beta feedback** issue form. Security reports use the private
channel in [SECURITY.md](../../SECURITY.md).

## Triage policy

Every accepted item receives an owner, severity, disposition, and target before
it leaves triage.

| Severity | Meaning | Required beta outcome |
| --- | --- | --- |
| Critical | Secret exposure, package takeover/resolution failure, data corruption, or unusable documented API | Block promotion; assign immediately and publish a corrected beta |
| High | Major compatibility/API/security/performance problem without a safe workaround | Resolve before RC or explicitly reject beta production evaluation |
| Medium | Localized problem with a safe workaround or an operational resilience gap | Own and target before RC or stable |
| Low | Documentation or ergonomic refinement | Own and schedule without expanding frozen scope |

Open Critical: **0**. Open High: **0**.

## Queue

| Finding | Area | Severity | Owner | Target | Disposition | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Solo-maintainer advisory/release continuity | Security operations | Medium | `W0rldHacker` | RC review | Accept availability risk; never bypass protected disclosure or release gates | Risk accepted |
| No public beta reports yet | — | — | `W0rldHacker` | Continuous through RC | Triage new issue-form submissions | Monitoring |

## Alpha disposition

No P0/P1 product defect was reported during the alpha evaluation. Backend and
test-infrastructure compatibility projects passed the published
`0.1.0-alpha.0` to `0.1.0-beta.1` upgrade on Node.js 22.23.1 and 24.18.0 in the
protected registry workflow. No migration note was required because the frozen
public API and option names did not change.
