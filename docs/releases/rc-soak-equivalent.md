# RC soak-equivalent test record

Status: planned equivalent-volume evaluation; final release-manager acceptance
is pending the exact RC runs.

REL-005 permits either seven elapsed days or a documented equivalent amount of
real testing. This RC uses the equivalent-volume path. Acceptance requires all
of the following on the immutable candidate:

- full `pnpm verify` on all six OS/runtime combinations formed by Ubuntu,
  macOS, and Windows with Node.js 22 and 24;
- ordinary required CI, including coverage, security/property, package,
  public API/type, and hosted performance budgets;
- extended nightly property and fuzz workloads plus the nightly performance
  budget;
- five fresh-install consumer profiles on both supported Node lines with dev
  dependencies omitted;
- backend and test-infrastructure beta-to-RC upgrade and RC-to-beta rollback on
  both supported Node lines;
- repeated local/workflow/registry packing with byte identity and a stable
  projection that differs only by version metadata.

This produces independent executions across three operating systems, two Node
major lines, packed and registry installation modes, hostile randomized input,
and three application roles. Any failure invalidates the equivalent and any
code change requires a new RC and a complete rerun. The final record adds run
URLs, exact runtime patches, seeds/workload counts, digest, and the protected
environment approval that constitutes release-manager acceptance.
