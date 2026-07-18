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
'@w0rldhacker/kasane': major
---

Changed: Remove the deprecated option and use the replacement by default.
Breaking: true
Breaking-Approval: approved in PR #123
Migration: docs/migrations.md#replace-the-deprecated-option
```

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
| `-alpha.N`     | `alpha`  | early development and API discovery  |
| `-beta.N`      | `beta`   | beta compatibility and integration   |
| `-rc.N`        | `rc`     | release-candidate verification       |
| no prerelease  | `latest` | stable release after explicit review |

Other prerelease channel names fail before `npm publish`. Prerelease packages
never use `latest`.

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

npm provenance is requested through `publishConfig` and the OIDC publish. npm
can issue provenance only for a public package built from a public repository.
The repository satisfies the public-source prerequisite; publication remains
blocked until the maintainer confirms `@w0rldhacker` organization access and
configures the npm trusted publisher for the newly selected scoped package.
This repository never stores a long-lived npm automation token.

Repository administrators complete and periodically rehearse this checklist:

- create the `npm` environment, restrict deployment to protected `main`, and
  configure an available required reviewer (a solo maintainer may use the
  environment approval allowed by the repository plan, but must not weaken the
  branch and CI gates);
- confirm that the maintainer controls the `@w0rldhacker` npm organization and
  register the trusted publisher for `@w0rldhacker/kasane` with the exact
  repository, workflow filename, and environment above before any release;
- keep Actions pinned to reviewed commit SHAs and default workflow permissions
  read-only;
- verify `pnpm changeset status`, `pnpm release:dry-run`, the packed contents,
  registry tag, package digest, and provenance before approving publication;
- correct a failed publication with a new version rather than routine
  `npm unpublish`.
