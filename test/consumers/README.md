# Packed consumer fixtures

These projects are copied outside the workspace and install only the generated
Kasane `.tgz`. The JavaScript fixture verifies ESM runtime resolution, dynamic
imports, the public subpath, forbidden deep imports, and rejection of CommonJS
`require`. Both fixtures exercise a basic configuration and prove that a secret
explanation is redacted. The TypeScript fixture is compiled and executed in
NodeNext mode; it checks Standard Schema inference, explicit generics, deep
readonly types, and export boundaries.

The project currently defines no minimum supported TypeScript version. The
consumer therefore uses the repository's pinned current compiler. Node 22/24 and
operating-system coverage belongs to `QA-006`.

ATTW uses its `node16` profile because Kasane requires Node 22 and has an
`exports` map. The expected `cjs-resolves-to-esm` diagnostic is ignored because
Kasane is intentionally ESM-only; the JavaScript fixture separately proves that
`require('@w0rldhacker/kasane')` is rejected rather than promised.
