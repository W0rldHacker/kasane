# Security fuzz corpus

`curated.json` contains stable regressions for dangerous-key decoding, invalid
UTF-16, controls, resource limits, paths, and environment collisions. Every fuzz
failure is shrunk by fast-check and written to `generated/last-failure.json`
with its seed and replay path. Review that file, reduce any security-sensitive
payload if needed, and promote the regression to `curated.json` before merging
the fix.

Generated failures are CI artifacts and are intentionally not committed.
