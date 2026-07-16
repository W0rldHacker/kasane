# Kasane

Kasane is an explainable layered-configuration library for Node.js and
TypeScript. Runtime implementation has not started; the current repository
contains the accepted product/architecture baseline and a reproducible strict
toolchain.

## Development

Prerequisites:

- Node.js 22 or 24;
- Corepack;
- pnpm 11 as pinned by `packageManager`.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
```

The package is ESM-only and is built with `tsc` without bundling.
