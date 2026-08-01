# Kasane research RFCs

This directory contains non-normative proposals. An RFC does not change the
stable contract, authorize a core export, or promise that an experiment will
ship. Accepted architecture decisions still live in `docs/adr`.

## POST-004 evidence gate

| Evidence                         | What it confirms                                                                                   | What it does not confirm               |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Product-owner request `POST-004` | Demand for bounded research into typed paths, telemetry, polling, and explainable merge extensions | Adoption demand for any package or API |
| Alpha packed consumers           | Typed applications and CLI-like tooling use the stable API successfully                            | A request for typed paths or telemetry |
| Beta feedback tracker            | No critical/high product defect and no public beta feature report                                  | Demand for any POST-004 feature        |
| Existing watch companion         | Application-controlled reload lifecycle has an implemented use case                                | Demand for remote polling policy       |

Research demand is therefore confirmed, while external adoption demand is not.
Every RFC remains `Draft — hold for consumer evidence`. Promotion needs at least
two independent consumer records identifying the same problem, with one willing
to run the prototype. Repository issues or interview notes must record the
application shape, current workaround, frequency, scale, and why a stable
string-path/event/watch API is insufficient. Security reports never use public
issues.

The current evidence and reusable interview/issue record are in
[`evidence/user-demand.md`](./evidence/user-demand.md).

## Removal and compatibility rule

All executable work is in the private `@kasane/post-004-experiments` workspace
package. Nothing under `rfcs` or `experiments` is exported by core or a public
companion. The package may be deleted together with the `post-004:*` root
scripts and workspace glob without a release or deprecation. No Changeset is
required for experiment-only work.

## RFC register

| RFC                                                                         | Status                | Prototype decision                                        |
| --------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| [0001 Typed paths](./0001-typed-paths.md)                                   | Draft — evidence hold | Keep removable helper for compile measurements            |
| [0002 Telemetry adapters](./0002-telemetry-adapters.md)                     | Draft — evidence hold | Keep allowlisted OTel/channel mapping prototype           |
| [0003 Remote polling](./0003-remote-polling.md)                             | Draft — evidence hold | Keep cancellation/lifecycle prototype; no credentials     |
| [0004 Constrained merge operations](./0004-constrained-merge-operations.md) | Draft — evidence hold | Reject callbacks; measure serializable declaration parser |

Review command:

```bash
pnpm post-004:verify
pnpm post-004:bench
```
