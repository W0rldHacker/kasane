# Companion sources and formats

Kasane companions add parsers and provider access without expanding the core
package's dependency or security surface. They are ordinary packages built
only on the public core contract.

## Contract boundary

A format package supplies a public `FileParser`. A provider package supplies a
public `LayerSource` or a factory returning a `LayerDescriptor`. In both cases:

- the companion returns plain configuration data;
- core owns normalization, merge, provenance, validation, redaction, snapshot,
  and diff behavior;
- a source receives only `cwd`, limits, and an optional abort signal;
- a source never receives previous configuration and never merges data;
- provider failures must be safe to wrap in `KasaneSourceError`;
- dangerous keys remain subject to core normalization;
- provider SDKs stay in the companion package and never become core
  dependencies.

The current `LayerSource.load()` result is configuration data, not a metadata
envelope. A companion that needs a safe provider reference returns it beside
the `LayerDescriptor`. That reference may identify a provider, resource, and
field names, but must not contain secret values, credentials, raw SDK objects,
or provider error text.

## Reusable conformance tests

`packages/source-testkit` exposes `runSourceConformance()`,
`runParserConformance()`, and `assertSafeProviderReference()`. The provider
suite covers normal data and core-owned merge, provider failure, abort, secret
annotation, dangerous keys, safe references, and absence of merge state in the
source context. The parser suite covers synchronous/asynchronous parsing,
sanitized failure, dangerous output, and secret-layer redaction.

```bash
pnpm --filter @worldhacker/kasane-source-testkit test
pnpm --filter kasane-companion-template test
pnpm -r pack:check
```

`packages/companion-template` is a copyable provider example. Its runtime code
imports only public `@worldhacker/kasane` types and has no runtime dependency on
the testkit.

## Package selection and naming

New companions are demand-driven. Candidate packages are `@kasane/yaml`,
`@kasane/toml`, and provider packages for Vault, AWS, GCP, Azure, and
Kubernetes. Those names describe the product split; they are not a claim of npm
scope ownership. Until scope ownership is confirmed, packages in this
repository use the existing `@worldhacker/*` publishing scope.

The watch companion follows the same publisher-prefixed convention as
`@worldhacker/kasane-watch`.

The post-`1.0` diagnostics binary is the independently versioned
[`@worldhacker/kasane-cli` companion](./cli.md). Unlike source companions, it accepts only
a bounded declarative JSON contract and never executes application code.

A proposed companion must identify real consumers, its provider SDK and
transitive dependency cost, credential model, abort behavior, secret
annotation strategy, and maintenance owner before implementation begins.

## Version compatibility

| Package line | Core peer range | Node support | Status |
| --- | --- | --- | --- |
| Source testkit `0.x` | `>=1.0.0 <2` | `>=22` | Initial public contract |
| Companion `0.x` | `>=1.0.0 <2` | `>=22` | Package-specific preview |
| Companion `1.x` | Declared by package | Same as or narrower than core | Stable package contract |

Companions use independent SemVer. A core minor may add optional capabilities,
but a companion must continue to declare the oldest tested compatible core
version. A new core major is incompatible until that companion passes the
matching testkit and widens its peer range. Companion changes never alter the
core API or merge semantics.

Changesets are independent: `.changeset/config.json` has empty `fixed` and
`linked` groups. Releasing one companion therefore does not require a core or
unrelated companion release. Each Changeset classifies exactly one releasable
package, and `pnpm release:version` writes that package's own changelog. Core
patches and minors that remain inside a declared companion peer range do not
narrow that range or advance the companion version; the release dry-run
rehearses this invariant with the actual Changesets CLI.

## Publish checklist

Before a companion package is made public:

1. Run its conformance suite on every supported Node line.
2. Run recursive `pack:check` and inspect the package allowlist and digest.
3. Verify there are no deep core imports or runtime testkit dependencies.
4. Install the tarball with the oldest and newest supported core versions.
5. Publish through a protected workflow with npm provenance, then verify the
   registry artifact. Correct a failed publication with a new version rather
   than routine `npm unpublish`.

Publication is a manual dispatch of `companion-release.yml` from the audited
`main` commit. Select `cli` for `@worldhacker/kasane-cli`, `source-testkit` for
`@worldhacker/kasane-source-testkit` or `watch` for
`@worldhacker/kasane-watch`; those are the public package selectors. The
workflow uses the protected `npm-companions` environment and package-specific
npm trusted-publisher registrations. It accepts no long-lived npm token.

Before approving the environment deployment, review the uploaded
`companion-<selector>-<run-id>` artifact and dry-run output. After publication,
the workflow requires the registry tarball to match that artifact byte for
byte, validates the derived dist-tag and npm integrity, and runs clean-cache
consumer smoke tests on Node 22 and 24. Run the source-testkit release before a
dependent companion release. See [Versioning and releases](./versioning.md) for
the environment and trusted-publisher configuration.

There is one bootstrap exception: npm requires a package to exist before a
trusted publisher can be configured. For the first `0.1.0` publication only,
use `companion-bootstrap.yml` with explicit `bootstrap` confirmation and the
short-lived `NPM_BOOTSTRAP_TOKEN` environment secret. Its guarded publish
command fails if the package already exists. After bootstrapping the package
names, revoke the token, remove the secret, configure their trusted publishers,
and use only the OIDC workflow for subsequent versions.

The architectural rationale is recorded in
[ADR-0003: Extension boundary](./adr/0003-extension-boundary.md).
