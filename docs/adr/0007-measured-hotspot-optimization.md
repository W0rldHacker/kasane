# ADR-0007: Measured hotspot optimization

- Status: Accepted
- Date: 2026-07-18
- Decision owners: `PERF-002`
- Requirements: `REQ-QUAL-003`, `REQ-SEC-004`, `REQ-SEC-005`,
  `REQ-SNAP-001`, `REQ-PROV-002`

## Context

PERF-001 established deterministic load, provenance, path, explain, diff,
fingerprint, freeze, and large-array scenarios with retained-heap measurement.
Before changing structure, PERF-002 ran the complete suite and a V8 CPU profile
on the baseline environment recorded by `benchmarks/baseline.json`.

The profile found three measured costs in ordinary loads:

1. empty secret annotation sets repeatedly walked every parent path, and an
   empty secret policy rebuilt the whole provenance tree;
2. lifecycle node counts traversed normalized and merged trees even when no
   `onEvent` callback existed;
3. every provenance leaf allocated a separate immutable origin record even
   when layer, operation, scope, reference, and secret state were identical.

Snapshot cloning and history/children defensive copies were smaller but visible
allocation sites. Canonical fingerprint encoding and the bounded snapshot path
cache were not dominant after the primary fixes.

## Decision

The implementation uses the following targeted fast paths:

- empty annotation sets return before parent-path traversal; an empty compiled
  secret matcher reports size zero, so the final policy pass reuses the already
  immutable provenance tree;
- node counts are computed only when a lifecycle callback can observe them;
- the pipeline transfers its internally owned canonical value to a freeze-on
  snapshot, which freezes it in place; public snapshot construction and every
  freeze-off snapshot still clone inputs;
- each merge-layer traversal has a fixed-cardinality pool for immutable origin
  records without an input reference. Referenced paths are never pooled, and
  the pool contains no configuration value, secret, or path;
- an already-owned immutable child-map wrapper is reused rather than copied
  again; externally supplied maps remain defensively copied.

No cache is global. The origin pool lives for one layer merge and can contain
only the finite operation/scope/secret combinations. The per-snapshot path LRU
remains capped at 256.

## Before/after evidence

The following medians come from clean full-suite runs on the same Windows x64,
Node 24.4.1 host. One warmup and three measured samples were used. Negative
percentages are improvements. These figures are regression evidence for this
host, not universal throughput claims.

| Scenario | Before | After | Duration | Retained heap |
| --- | ---: | ---: | ---: | ---: |
| `load/l10/n10000/d20/none/freeze-on` | 997.08 ms | 348.98 ms | -65.0% | +0.1% |
| `load/l10/n10000/d20/origin-only/freeze-on` | 990.00 ms | 314.62 ms | -68.2% | -31.2% |
| `load/l10/n10000/d20/full/freeze-on` | 1061.28 ms | 390.70 ms | -63.2% | -48.4% |
| `freeze/off/l10/n10000/d5/origin-only` | 533.52 ms | 286.81 ms | -46.2% | -31.4% |
| `large-array/n50000/replace/freeze-on` | 274.59 ms | 171.09 ms | -37.7% | -34.0% |
| `diff/secret-fingerprint/n1000/d5` | 11.17 ms | 9.35 ms | -16.3% | +0.4% |
| `path-cache/n1000/d20/lookups1024` | 5.42 ms | 4.81 ms | -11.2% | unchanged |

Across all 36 load scenarios, the duration geometric mean changed by -47.0%.
Individual short or GC-heavy samples varied; the comparison command therefore
reports the configured absolute noise floor and the existing budget check keeps
the approved two-times regression threshold.

The baseline correctness run passed `pnpm verify` with 542 tests. The optimized
result passed the same command with 545 tests, plus the explicit property and
security commands. These cover freeze on/off, full history, and large mixed
trees.

## Alternatives left unchanged

- Changing the 256-entry LRU or caching paths globally was rejected: the cache
  scenario gained no material evidence for extra complexity, and global paths
  violate the security boundary.
- Replacing the clear canonical generator with a low-level encoder was rejected:
  it was not a leading post-fix stack and its scenario did not miss a budget.
- A new provenance children data structure was rejected. Reusing only the
  existing internally owned immutable wrapper captures a defensive-copy saving
  without changing lookup semantics.
- Lazy or linked public history was rejected because it would complicate
  snapshot immutability, ordered explanations, and immediate secret cleanup.
  A tested weak ownership marker for frozen history arrays was also removed
  because it regressed the measured `full` scenario despite saving a transient
  defensive copy.

## Consequences

Public values, explanations, histories, fingerprints, events, and errors retain
their previous shapes and ordering. Event node counts are unchanged whenever an
observer exists. Secret policies still traverse and redact when at least one
rule exists. The implementation adds small ownership and pooling concepts, but
each is local, bounded, and covered by the existing correctness and security
suites.

## Verification

Run:

```bash
pnpm verify
pnpm bench:compare
```

For an already captured pair:

```bash
KASANE_BENCH_BEFORE=benchmarks/results/perf-002-before.json \
KASANE_BENCH_AFTER=benchmarks/results/perf-002-after.json \
node scripts/compare-benchmarks.mjs
```

## Related documents

- [Benchmark methodology](../../benchmarks/README.md)
- [Performance baseline](../../benchmarks/baseline.json)
- [Threat model](../threat-model.md)
- [Traceability matrix](../traceability.md)
