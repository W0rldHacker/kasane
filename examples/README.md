# Executable examples

Every example imports only the public `@w0rldhacker/kasane` package entry and
prints one deterministic JSON line. The committed expected-output file beside
each script is its smoke-test contract.

| Directory                                    | Demonstrates                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| [`basic`](./basic/quick-start.mjs)           | README quick start: defaults, JSON file, environment mapping, and provenance |
| [`basic` extended](./basic/index.mjs)        | Optional file and CLI-like precedence through a final value layer            |
| [`backend`](./backend/index.mjs)             | Standard Schema validation, coercion, and a handled validation failure       |
| [`custom-source`](./custom-source/index.mjs) | An asynchronous provider-neutral custom source                               |
| [`custom-parser`](./custom-parser/index.mjs) | A trusted custom parser for the built-in file source                         |
| [`secrets`](./secrets/index.mjs)             | Async test secrets, redacted explanation/history, and safe JSON              |
| [`diff`](./diff/index.mjs)                   | A source-only change between equal values                                    |

From a repository checkout, build once and run any example through the public
workspace export:

```bash
pnpm build
node examples/basic/index.mjs
node examples/basic/quick-start.mjs
node examples/backend/index.mjs
```

Run every example as a clean packed-package consumer and verify its exact
output:

```bash
pnpm examples:test
```

The runner creates six temporary directories, installs the generated npm tarball
independently into each one, rejects deep imports, checks exact stdout, checks
that stderr is empty, and rejects any printed test secret canary. Temporary
installs are removed after the run.

Custom sources, parsers, and validators are trusted application code. The
fixtures use only local deterministic data and obvious test canaries—never
production credentials or network providers. If an example adopts an external
schema implementation later, it belongs in that example's development
dependencies, not Kasane's runtime dependencies.
