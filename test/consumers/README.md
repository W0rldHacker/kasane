# Packed consumer fixtures

These projects are copied outside the workspace and install only the generated
Kasane `.tgz`. Three feature-complete beta profiles exercise a backend service,
a tool/CLI-like configuration flow, and test infrastructure. The general
JavaScript fixture verifies ESM runtime resolution, dynamic imports, the public
subpath, forbidden deep imports, and rejection of CommonJS `require`. Every
runtime profile includes a secret canary. The TypeScript fixture is compiled and
executed in NodeNext mode; it checks Standard Schema inference, explicit
generics, deep readonly types, and export boundaries.

The backend and test-infrastructure profiles are also installed first with the
published `0.1.0-alpha.0` and then upgraded to the packed or registry beta. This
keeps the beta compatibility claim tied to independent clean consumer projects
rather than workspace imports.

The project currently defines no minimum supported TypeScript version. The
consumer therefore uses the repository's pinned current compiler. Node 22/24 and
operating-system coverage belongs to `QA-006`.

ATTW uses its `node16` profile because Kasane requires Node 22 and has an
`exports` map. The expected `cjs-resolves-to-esm` diagnostic is ignored because
Kasane is intentionally ESM-only; the JavaScript fixture separately proves that
`require('@worldhacker/kasane')` is rejected rather than promised.
