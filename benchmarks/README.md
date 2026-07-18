# Kasane benchmark suite

The suite measures Kasane against deterministic synthetic configuration data. It
covers the supported provenance modes, 1/10 layers, 100/1,000/10,000 leaves,
depth 5/20, explain, public and secret-fingerprint diff, path-cache churn, large
arrays, and freeze on/off. One warmup precedes three measured samples; reported
time and retained heap deltas are medians.

Run `pnpm bench` to write `benchmarks/results/latest.json` with runtime, CPU,
operating-system, runner, and methodology metadata. Run `pnpm bench:check` to
compare it with `baseline.json` and the hosted Ubuntu Node 24 hard budgets.

The committed baseline is a regression-control artifact, not a universal
performance claim. Results vary with hardware, operating system, Node/V8,
virtualization, thermal state, and concurrent workload. Update it only after a
reviewed reference run and never use production data or secrets as fixtures.
