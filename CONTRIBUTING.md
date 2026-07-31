# Contributing to Kasane

Thank you for improving Kasane. Changes are reviewed against three promises:
deterministic semantics, safe diagnostics, and a narrow public package surface.
Read the [Code of Conduct](./CODE_OF_CONDUCT.md) before participating.

## How do I set up a clean checkout?

Prerequisites:

- Git;
- Node.js 22 or 24;
- Corepack;
- no global Kasane build tools.

The repository pins pnpm through `packageManager`. From a new checkout:

```bash
git clone https://github.com/W0rldHacker/kasane.git
cd kasane
corepack enable
pnpm install --frozen-lockfile
pnpm verify
```

Do not use npm or Yarn to install workspace dependencies and do not regenerate
`pnpm-lock.yaml` unless dependency changes are intentional. `pnpm verify` builds
from source, exercises packed consumers and examples in temporary clean
installs, and runs the complete correctness/type surface.

## Which command should I run?

| Goal                              | Command                                                |
| --------------------------------- | ------------------------------------------------------ |
| Ordinary full gate                | `pnpm verify`                                          |
| Code and Markdown lint            | `pnpm lint`                                            |
| Formatting check / repair         | `pnpm format:check` / `pnpm format`                    |
| TypeScript compile check          | `pnpm typecheck`                                       |
| All Vitest projects               | `pnpm test`                                            |
| Unit or integration project       | `pnpm test:unit` / `pnpm test:integration`             |
| Architecture boundaries           | `pnpm architecture:check` and `pnpm test:architecture` |
| Public API and declarations       | `pnpm api:check` and `pnpm test:types`                 |
| Package and clean consumers       | `pnpm test:package`                                    |
| Executable documentation          | `pnpm examples:test` and `pnpm docs:check`             |
| Fast property/security suites     | `pnpm test:property` and `pnpm test:security`          |
| Performance budgets               | `pnpm bench:check`                                     |
| Before/after performance evidence | `pnpm bench:compare`                                   |
| Create release classification     | `pnpm changeset`                                       |
| Validate release policy           | `pnpm release:policy-check`                            |
| Rehearse release scenarios        | `pnpm release:dry-run`                                 |
| Validate stable maintenance       | `pnpm maintenance:check`                               |
| Rehearse patch/security decisions | `pnpm maintenance:tabletop`                            |
| Verify companion contracts        | `pnpm companion:verify`                                |
| Check every workspace tarball     | `pnpm -r pack:check`                                   |
| Pack a selected companion         | `pnpm companion:release:pack --package=watch`          |
| Rehearse a companion publish      | `pnpm companion:release:rehearse --package=watch`      |
| Test snapshot watch lifecycle     | `pnpm --filter @worldhacker/kasane-watch test`         |

Focused commands speed up iteration, but every pull request must end with
`pnpm verify`. Performance, security, property, and nightly fuzz commands are
additional evidence where relevant; they do not replace the ordinary gate.

## What tests must accompany a change?

Every behavior change and production bug fix includes a deterministic regression
test that fails without the change. Assert the public contract or an explicit
internal invariant, not incidental object identity, timing, stack text,
allocation address, or implementation order.

Choose the narrowest primary suite, then cover cross-boundary effects:

- merge changes update the exhaustive matrix/property expectations and verify
  provenance in all applicable modes;
- provenance changes verify `none`, `origin-only`, `full`, freeze on/off, and
  secret history cleanup;
- source changes verify sequential scheduling, disabled/optional behavior,
  abort, normalization, and sanitized failure;
- validation changes verify function and Standard Schema paths, output
  renormalization, provenance reconciliation, and inferred types;
- snapshot/diff changes verify detached output, deterministic order, missing
  provenance, arrays, and secret-safe surfaces;
- package/API changes update type, declaration, packed-consumer, and absence
  checks;
- performance changes include before/after benchmark evidence and the complete
  correctness/security suite.

Use minimal synthetic fixtures. A failing property/fuzz case should be reduced
to a stable regression fixture with its seed or canonical input preserved.

## What makes a pull request security-sensitive?

A change is security-sensitive when it touches normalization, paths, limits,
files or environment mapping, secrets, provenance history, fingerprints,
redaction, diagnostics, validation issues, errors/causes, custom executable
boundaries, archives, dependencies, or publish permissions.

For such a pull request:

1. State the trust boundary and abuse case in the description.
2. Use obvious test canaries only; never copy production credentials, `.env`
   files, tokens, customer paths, or raw incident output.
3. Prove the canary is absent from JSON, inspection, explanation, diff, errors,
   events, stdout, stderr, and generated artifacts as applicable.
4. Test hostile objects, accessors, Proxies, cycles, limits, and abort at the
   affected boundary.
5. Run `pnpm test:security`, the focused suite, and `pnpm verify`.
6. Request review from a maintainer familiar with the threat model.

Do not open a public issue or pull request for an undisclosed vulnerability. Use
[private vulnerability reporting](./SECURITY.md#reporting-a-vulnerability) and
coordinate test cases, fixes, and release timing privately.

`snapshot.value`, `get()`, and `require()` are deliberately raw; safe behavior
elsewhere is not permission to log them. Custom sources, parsers, validators,
and Proxy traps are trusted executable code and are not sandboxed.

## When do architecture and documentation change?

Start with [Core architecture](./docs/architecture.md) and the
[ADR index](./docs/adr/README.md). A change to public semantics, defaults,
extensions, module direction, state ownership, security boundaries, package
surface, or justified complexity requires an ADR or an explicit explanation of
why an existing accepted ADR already covers it.

Accepted ADRs are historical records. Do not rewrite a decision to make new code
appear compliant; create a replacement ADR and supersede the old one.

User-visible behavior updates the relevant guide and
[API reference](./docs/api.md). `pnpm docs:check` verifies links, documented
exports, defaults, ADR status, imports, doctests, and generated merge tables.
Never document a deep import or post-`1.0` capability as core.

Companion packages follow the independent boundary in
[Companion sources and formats](./docs/companions.md). Runtime code may import
only the public core package, must leave merge semantics in core, and must run
the reusable source/parser conformance suite. Provider SDK dependencies belong
only to the companion that uses them.

## Does my change need a Changeset?

Run `pnpm changeset` for a user-visible fix, feature, deprecation, behavior
change, public type change, or documentation correction that affects the
published package contract. Select:

- patch for compatible fixes and clarifications;
- minor for compatible new capability or deprecation;
- major for a breaking stable change after `1.0`.

Start the summary with `Added:`, `Changed:`, `Fixed:`, or `Security:`. A major
classification also records `Breaking: true`, `Breaking-Approval:`, and a
`Migration:` link. A pre-`1.0` breaking minor uses the same metadata. See
[Versioning and releases](./docs/versioning.md) for beta approval, deprecation,
prerelease, and npm tag rules. Stable regressions, backports, Node EOL, and
support windows follow the [maintenance policy](./docs/maintenance.md).

Internal tests/refactoring with no published effect normally need no Changeset.
Explain the omission in the pull request when it is not obvious. Do not edit the
package version directly.

## How are releases prepared?

Contributors prepare release evidence; they do not publish from local machines.
The release owner uses the exact reviewed commit and:

1. Confirms every user-visible change has a Changeset and answer-first release
   note.
2. Runs `pnpm verify`, required security gates, and applicable
   `pnpm bench:compare` evidence.
3. Runs the required Node.js 22/24 platform matrix on the exact commit.
4. Audits `pnpm test:package`, the tarball allowlist, public API report, clean
   ESM/TypeScript consumers, and executable examples.
5. For an RC or stable release, confirms migration/changelog, soak, rollback,
   package digest, and post-install smoke-test evidence.
6. Publishes only through the protected trusted-publishing workflow, then
   verifies the registry artifact and provenance.

Current pull-request workflows are read-only and have no publish credentials.
The release PR workflow cannot publish. The manual publish workflow has no
long-lived npm token and remains blocked until its protected environment and npm
trusted publisher are configured. An ad-hoc `npm publish` is not an approved
release path. A failed publication is corrected with a new version; routine
rollback does not use `npm unpublish`.

Public companions use the separate protected `npm-companions` workflow with an
allowlisted `source-testkit` or `watch` selector. The private template is never
published. Each public companion needs its own npm trusted-publisher entry, and
the source testkit is published before companions that depend on a newly
released conformance contract.

Because npm cannot configure trusted publishing before a package exists, only
the first publication may use `companion-bootstrap.yml` and the protected
one-day `NPM_BOOTSTRAP_TOKEN`. The bootstrap command rejects an existing package
name. Revoke that token and delete the environment secret immediately after the
two package names exist; all updates use the token-free OIDC workflow.

## Pull request checklist

- [ ] The change has one clear scope and preserves unrelated work.
- [ ] Regression tests fail without the change and pass with it.
- [ ] Public output and security boundaries are intentionally unchanged or
      documented.
- [ ] API/docs/ADR and Changeset updates are included when required.
- [ ] No secret, credential, private path, or raw hostile error entered fixtures
      or output.
- [ ] `pnpm verify` passes on the final commit.
- [ ] Additional security/property/performance/package evidence is attached
      where relevant.
