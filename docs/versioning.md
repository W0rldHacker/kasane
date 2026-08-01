# Versioning and releases

Kasane uses SemVer and Changesets. Every user-visible pull request declares its
release impact; merging to `main` prepares a release PR, but never publishes a
package. Publication is a separate, manually dispatched, protected operation.

## Which release classification should I choose?

- `patch`: a compatible bug fix, security fix, documentation correction, or
  diagnostic clarification;
- `minor`: a compatible feature, new public API, or deprecation;
- `major`: removal or incompatible change to runtime behavior, public types,
  exports, defaults, accepted inputs, or documented diagnostic formats.

During the initial alpha line, an incompatible change may use `minor` while the
public contract is still being formed. From the first beta onward, every
breaking change needs explicit maintainer approval recorded in its Changeset.
After `1.0.0`, every breaking change is `major`. A Changeset is evidence for
review, not a substitute for reviewing the actual compatibility impact.

Major Changesets must include both fields after the answer-first summary:

```markdown
---
'@worldhacker/kasane': major
---

Changed: Remove the deprecated option and use the replacement by default.
Breaking: true
Breaking-Approval: approved in PR #123
Migration: docs/migrations.md#replace-the-deprecated-option
```

The first non-breaking promotion from a frozen `0.x` prerelease API to `1.0`
also uses a major Changeset because it crosses the SemVer major boundary. It
declares `Promotion: 1.0`, `Promotion-Approval:`, and `Migration:` instead of
claiming a breaking API change. This exception applies only while the current
major version is zero and the target is `1.0.0-rc.N`.

Every incompatible Changeset sets `Breaking: true`; the automated check rejects
it without `Breaking-Approval:` and `Migration:`. It applies the same rule to
every major Changeset. Direct edits to the package version are not accepted.

## How long does a deprecation last?

A public API is deprecated in a minor release and remains available for at
least one minor release before removal. After `1.0`, removal also waits for a
major release. The deprecation note names the replacement and links to a
migration. An actively exploitable vulnerability may require an earlier
security removal; that exception is recorded under `Security`, linked to the
advisory, and accompanied by the safest available migration.

No long-term support window is promised by this policy. Supported release lines
and security reporting are defined in [the security policy](../SECURITY.md).
Triage severity, patch/minor cadence, regression requirements, backports, and
Node EOL migration are defined in the
[stable maintenance policy](./maintenance.md).

## How is the changelog produced?

Each Changeset summary starts with exactly one outcome category:

- `Added:` for a new compatible capability;
- `Changed:` for behavior, performance, documentation, or deprecation changes;
- `Fixed:` for compatible corrections;
- `Security:` for vulnerability fixes or defensive changes users must notice.

`pnpm release:version` consumes pending Changesets, advances the version, and
prepends a dated entry to [the changelog](../CHANGELOG.md) in the fixed order
Added, Changed, Fixed, Security. Empty categories are omitted from a release.
The generated release PR is reviewed and passes the same required CI gates as
any other pull request.

## Which prerelease and npm tags are allowed?

Changesets prerelease mode is entered explicitly, for example:

```bash
pnpm changeset pre enter alpha
pnpm changeset pre exit
```

The version determines the npm distribution tag; callers cannot select an
arbitrary tag:

| SemVer channel | npm tag  | Intended audience                    |
| -------------- | -------- | ------------------------------------ |
| `-alpha.N`     | `next`   | early development and API discovery  |
| `-beta.N`      | `beta`   | beta compatibility and integration   |
| `-rc.N`        | `rc`     | release-candidate verification       |
| no prerelease  | `latest` | stable release after explicit review |

Other prerelease channel names fail before `npm publish`. Prerelease packages
never use `latest`. The shared `next` tag deliberately identifies the current
alpha evaluation build; beta and RC keep their channel-specific tags.

## What does release automation trust?

[`release-pr.yml`](../.github/workflows/release-pr.yml) runs after changes land
on `main`. It may write repository contents, pull requests, and CI dispatches.
It has no
OIDC permission, npm credential, or publish command. Because GitHub suppresses
recursive workflow events from its built-in token, its narrowly scoped
`actions: write` permission dispatches the ordinary CI workflow explicitly on
the generated `changeset-release/main` commit. Required gates therefore protect
the release PR too.

[`release.yml`](../.github/workflows/release.yml) is manual and targets the
protected `npm` environment. It installs the frozen lockfile, runs all gates and
the release dry-run, then uses npm trusted publishing with GitHub OIDC. The job
has `contents: read` and `id-token: write`; it does not read `NPM_TOKEN`,
`NODE_AUTH_TOKEN`, or repository secrets. The configured trusted publisher must
match repository `W0rldHacker/kasane`, workflow `release.yml`, and environment
`npm`. The environment permits only the protected `main` branch and requires
maintainer approval before deployment.

The publish command also rejects the placeholder version, pending Changesets, a
missing current-version changelog entry, long-lived npm token variables, a
non-`main` ref, or a job without GitHub's OIDC request context.

Companion packages use the separate manual
[`companion-release.yml`](../.github/workflows/companion-release.yml) workflow
and protected `npm-companions` environment. Its input is an allowlisted package
selector: `cli` publishes `@worldhacker/kasane-cli`, `source-testkit` publishes
`@worldhacker/kasane-source-testkit`, and `watch` publishes
`@worldhacker/kasane-watch`. The private companion template cannot be selected.
Each package is released independently; publish the source testkit first when a
watch or provider release depends on its new conformance contract.

The companion job runs the full repository gate, creates and audits exactly one
tarball, performs a provenance-enabled npm dry-run, uploads that audited
artifact, and publishes that same file through OIDC. It then downloads the
registry tarball and requires an exact SHA-256 match, checks the version-derived
dist-tag and integrity, and installs from a fresh npm cache on Node 22 and 24.
The registry smoke covers the CLI or source-testkit root export, or the watch
root, `/file`, and `/provider` exports. A failed companion release is corrected with
a new patch version; the workflow never treats `npm unpublish` as routine
rollback.

npm can attach a trusted publisher only after a package already exists. The
first publication of each new companion therefore uses the separate manual
[`companion-bootstrap.yml`](../.github/workflows/companion-bootstrap.yml)
workflow. It has the same prepare/audit, protected environment, provenance,
registry digest, and Node 22/24 consumer checks, but its publish step alone
receives `NODE_AUTH_TOKEN` from the environment secret
`NPM_BOOTSTRAP_TOKEN`. The command first proves that the package name does not
exist and permanently refuses bootstrap credentials for an existing package.

The bootstrap credential is a one-day granular npm token with read/write access
limited to the `@worldhacker` scope and bypass-2FA enabled because npm requires
2FA or such a token for non-interactive package creation. After the first
publications, revoke the token and delete the GitHub environment secret before
configuring the package-specific trusted publishers. Every later release uses
`companion-release.yml`; the bootstrap workflow cannot update any package.

npm provenance is requested through `publishConfig` and the OIDC publish. npm
can issue provenance only for a public package built from a public repository.
The repository satisfies the public-source prerequisite; publication remains
blocked until the maintainer confirms control of the `worldhacker` npm user
scope and configures the trusted publisher for the newly selected package.
This repository never stores a long-lived npm automation token.

## How is the release tarball audited?

`pnpm pack:check` builds with `pnpm pack`, retains the audited
`kasane-<version>.tgz`, and rejects any file outside the checked-in allowlist.
The exact archive is scanned for credential patterns, install lifecycle scripts,
runtime dependencies, broken export targets, and an unpacked size at or above
500 KiB. Source maps are intentionally excluded from the release artifact; a
different size or source-map policy requires an ADR.

The same archive must pass publint, attw, and a byte-for-byte repeated-pack
check. `pnpm test:consumer:packed` installs that archive with dev dependencies
omitted and exercises the JavaScript ESM and TypeScript NodeNext consumers.
`pnpm release:dry-run` exercises synthetic patch/security versioning and publish
plans on ordinary pull requests. On a version commit, `pnpm release:rehearse`
runs the provenance-enabled npm publish dry-run against the exact, not-yet-
published version; it never attempts to dry-run an immutable version already in
the registry. Required CI repeats the consumer gate on the latest Node 22 and 24
patches and uploads the already-audited archive rather than packing a second
artifact.

`pnpm release:rehearse` projects an RC archive to the stable version, repacks
it, reruns the tarball audit and npm publish dry-run with `latest`, and rejects
any file or package metadata difference except `package.json` version. On the
stable commit the same command downloads the audited `rc` package and performs
the inverse comparison. The stable workflow therefore cannot silently accept
source, build dependency, export, or generated-output drift after the RC.

Repository administrators complete and periodically rehearse this checklist:

- create the `npm` environment, restrict deployment to protected `main`, and
  configure an available required reviewer (a solo maintainer may use the
  environment approval allowed by the repository plan, but must not weaken the
  branch and CI gates);
- confirm that the maintainer controls the `worldhacker` npm user scope and
  register the trusted publisher for `@worldhacker/kasane` with the exact
  repository, workflow filename, and environment above before any release;
- create the protected `npm-companions` environment with the same branch and
  reviewer restrictions, then register separate npm trusted-publisher entries
  for `@worldhacker/kasane-source-testkit` and
  `@worldhacker/kasane-watch`, plus one for `@worldhacker/kasane-cli`; each entry must name repository
  `W0rldHacker/kasane`, workflow `companion-release.yml`, and environment
  `npm-companions`;
- for initial package creation only, store the one-day scoped token as the
  `npm-companions` environment secret `NPM_BOOTSTRAP_TOKEN`, dispatch
  `companion-bootstrap.yml` once for each absent package, then revoke the token
  and delete the secret before registering trusted publishing;
- keep Actions pinned to reviewed commit SHAs and default workflow permissions
  read-only;
- verify `pnpm changeset status`, `pnpm release:dry-run`, the packed contents,
  registry tag, package digest, and provenance before approving publication;
- correct a failed publication with a new version rather than routine
  `npm unpublish`.
