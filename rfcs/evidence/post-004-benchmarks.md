# POST-004 prototype benchmark snapshot

- Date: 2026-08-01
- Status: local research evidence; not a public performance claim
- Operating system: Windows
- Node.js: 24.4.1
- TypeScript: 6.0.3
- Command: `pnpm post-004:bench`

## Results

| Prototype                             | Workload                                     |                                                            Result |                                 Rejection budget | Outcome  |
| ------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------: | -----------------------------------------------: | -------- |
| Plain stable type fixture             | Existing 100-section-like stable API fixture |                            22,682 instantiations; 1,835.7 ms wall |                                   Reference only | Recorded |
| Depth-6 typed paths                   | 100 sections, nested objects and arrays      | 29,222 instantiations; 1,664.6 ms wall; 1.29× instantiation ratio |  ≤250,000; ≤8× plus 25,000 allowance; <20,000 ms | Pass     |
| Telemetry mapper                      | 100,000 snapshot lifecycle events            |                                                          30.55 ms | <1,000 ms; ≤50× no-op with 10 ms noise allowance | Pass     |
| Serializable merge declaration parser | 100,000 exact declarations                   |                                                         177.56 ms |                                        <1,000 ms | Pass     |

Wall-clock results vary with process startup, caching, hardware, and concurrent
load. The type decision is driven primarily by compiler instantiations; a future
publication decision still requires tsserver/editor measurements in real
consumer projects. Hosted reference budgets must be approved before any result
becomes a maintained performance contract.

## Missing evidence

No independent consumer interview or public feature issue currently requests
these APIs. The successful benchmarks establish technical feasibility only; they
do not satisfy the adoption gate in the RFC index.
