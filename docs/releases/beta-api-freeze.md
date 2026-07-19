# Beta API freeze checklist

Status: approved as the intended `1.0` public baseline for the first beta.

The freeze covers public exports, export paths, option names, defaults, accepted
inputs, result types, error codes, and documented diagnostic shapes. A severe
security, correctness, or installability defect may justify a change; ordinary
feature requests do not.

## Export paths

- [x] `@worldhacker/kasane` is the only root entry point.
- [x] `@worldhacker/kasane/standard-schema` is the only public subpath.
- [x] Deep, source, internal, watch, and CommonJS paths remain unavailable.
- [x] The package has zero runtime dependencies and no provider/schema coupling.

## Runtime exports

The frozen root runtime names are `kasane`, `value`, `file`, `env`, `secret`,
`remove`, `secretValue`, `ConfigSnapshot`, `DEFAULT_KASANE_LIMITS`,
`DEFAULT_MAX_SOURCE_BYTES`, `KasaneError`, `KasaneLayerError`,
`KasaneMergeError`, `KasanePathError`, `KasaneSecurityError`,
`KasaneSourceError`, `KasaneValidationError`, and `isStandardSchemaV1`.

The `standard-schema` subpath exports only `isStandardSchemaV1` at runtime. All
public type names and declarations are frozen by the checked-in API report.

## Option names

- [x] `kasane`: `layers`, `cwd`, `fingerprintKey`, `freeze`, `limits`, `merge`,
  `onEvent`, `provenance`, `secrets`, `signal`, `validate`.
- [x] Every layer: `enabled`; value/file/env also expose `secret`.
- [x] `file`: `optional`, `parse`.
- [x] `env`: `case`, `coerce`, `map`, `prefix`, `separator`, `source`.
- [x] Public limits: `maxDepth`, `maxNodes`, `maxSourceBytes`,
  `maxStringLength`.
- [x] Error construction: `details`, `cause`, `secret`.

Defaults are normative in [the public API guide](../guides/public-api.md) and
are checked by `pnpm docs:check`. Adding or renaming an option after beta is an
API change, even when TypeScript marks it optional.

## Review evidence

- [x] `etc/kasane.api.md` contains the reviewed declaration snapshot; SHA-256
  `7addedb52d62727674607e889d749374e7d7f5c89a831544a88ec0d7b63890a5`.
- [x] `pnpm api:check` rejects declaration/report drift and external type leaks.
- [x] `pnpm test:types` covers inference, readonly values, absence of `any`, and
  the type-performance budget.
- [x] publint, attw, dynamic imports, and forbidden deep imports run against the
  packed artifact.
- [x] Backend, tooling, test-infrastructure, JavaScript ESM, and TypeScript
  NodeNext consumers use package imports only.
- [x] README, API reference, guides, examples, ADR index, and known limitations
  were reviewed against the same surface.

## Change policy after beta

An incompatible change must identify the serious defect, record
`Breaking: true`, `Breaking-Approval:`, and `Migration:` in its Changeset, update
the API report and this checklist, and publish a new beta. New P2 features and
major experiments remain deferred until after `1.0`.
