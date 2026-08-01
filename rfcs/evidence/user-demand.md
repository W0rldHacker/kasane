# POST-004 user-evidence record

## R-001: Sponsored research request

- Date: 2026-08-01
- Source: product-owner task `POST-004`
- Evidence level: confirmed demand for research
- Requested problems: assess typed-path ergonomics, lifecycle telemetry, remote
  polling lifecycle, and explainable constrained merge extensions before
  creating compatibility obligations
- Current workaround: stable string paths, direct typed `snapshot.value`, one
  invocation-local lifecycle callback, provider notifications through the watch
  companion, and pre-merge custom sources
- Decision: authorize removable RFC prototypes and benchmarks only
- Does not authorize: a public package, stable export, global registry,
  arbitrary merge callback, provider SDK, or remote execution

## External adoption evidence

No qualifying independent consumer record exists. Alpha and beta trackers
contain no public request for these features. This is a blocking promotion
condition, not missing documentation.

Use this record shape for interviews or issues:

| Field           | Required evidence                                                |
| --------------- | ---------------------------------------------------------------- |
| Consumer        | Independent application/team and contact or issue link           |
| Problem         | Concrete task that the stable API cannot adequately solve        |
| Frequency/scale | Paths/events/providers/config size and how often it occurs       |
| Workaround      | Current implementation and measured cost/risk                    |
| Prototype fit   | Which exact RFC contract was tried and what failed/succeeded     |
| Security        | Data classification, credential owner, telemetry/export boundary |
| Performance     | Compiler/runtime/environment observation                         |
| Commitment      | Willingness to test a revised removable prototype                |

Two independent records identifying the same problem are required before an RFC
may request acceptance. Security-sensitive material must use the private
reporting channel rather than this public record.
