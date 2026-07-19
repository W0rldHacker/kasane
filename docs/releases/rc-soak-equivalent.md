# RC soak-equivalent test record

Status: equivalent-volume evaluation accepted by the release manager.

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

## Exact candidate evidence

- Immutable commit: `7357246220e7c4b582b54d0d2a79aa4fa43aa2a8`.
- Full matrix run:
  [`29685981147`](https://github.com/W0rldHacker/kasane/actions/runs/29685981147),
  all six Ubuntu/macOS/Windows and Node.js 22/24 combinations passed.
- Extended run:
  [`29685982092`](https://github.com/W0rldHacker/kasane/actions/runs/29685982092),
  nightly property profile, 100,000-run fuzz profile, and hosted performance
  budget passed.
- Registry run:
  [`29692739675`](https://github.com/W0rldHacker/kasane/actions/runs/29692739675),
  all five clean consumer profiles passed without dev dependencies on Node.js
  22.23.1 and 24.18.0.
- Backend and test-infrastructure projects passed
  `0.1.0-beta.1 → 1.0.0-rc.1 → 0.1.0-beta.1` on both Node lines.
- Canonical workflow/registry SHA-256:
  `9097a10e7d321ccec837bb015d75293e04a48a97fc3da40240d6d4746513c067`.

Release manager `W0rldHacker` accepted this evidence as the documented
seven-day-soak equivalent through protected-environment approval on 2026-07-19.
No code change is permitted without producing a new RC and repeating the
record.
