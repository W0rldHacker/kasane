# Branch protection and CI drill checklist

This checklist configures the repository-side enforcement for the workflows in
`.github/workflows`. It does not authorize publishing and must not add npm,
deployment, or OIDC credentials to pull-request workflows.

## Main branch protection

- [x] Push the CI workflow to the repository and let `CI / Required gates`
  complete once so GitHub registers the check context.
- [x] Protect `main` and require the exact status check `Required gates` with
  strict up-to-date branches.
- [x] Require a pull request with at least one approving review and dismiss
  stale approvals when new commits are pushed.
- [x] Enforce the rule for administrators, block force pushes and deletion, and
  require conversation resolution.
- [x] Do not permit bypass actors. Emergency changes use the normal pull request
  and required checks; publishing approval is handled by a later release task.
- [ ] Subscribe at least two maintainers to Actions notifications and verify
  that a failed scheduled `Nightly quality` run is visible in the Actions UI and
  notification path.

The stable required context is the aggregator job rather than matrix-generated
job names. It fails if any required job fails, is cancelled, or is skipped. Node
26 advisory and manually dispatched pre-RC jobs are deliberately outside this
merge check.

## Intentional failing pull request drill

Run this drill in a temporary branch without real credentials or vulnerability
details. Revert each mutation before the next case so the failure owner is
unambiguous.

| Case | Safe mutation | Expected blocking job |
| --- | --- | --- |
| Unit | Change a synthetic assertion in `test/unit` | `Fast / unit and integration` |
| Type | Add an intentional error to a type fixture | `Types and public API` |
| Security | Change a synthetic redaction canary expectation | `Security and property` |
| Package | Add an unexpected file to the package allowlist fixture | `Package and packed artifact` |

For every case:

- [x] Open or update the test pull request and record its URL in the restricted
  maintainer release evidence.
- [x] Confirm the named job fails and the protected required context cannot pass.
- [x] Confirm GitHub reports `main` as blocked from merge for the current head.
- [x] Revert the mutation, push again, and confirm the same check context passes
  before closing the drill pull request without merging it.

## Mandatory operational scenarios

### Fork pull request permissions

- [ ] Open a documentation-only pull request from a fork.
- [ ] Confirm the run has only `contents: read`, receives no repository secrets,
  cannot write packages or deployments, and never executes a publish command.

### Cancelled run

- [x] Push twice to the same pull request while the first run is active.
- [x] Confirm concurrency cancels the superseded run and only the newest commit
  can satisfy branch protection. A cancelled required job must never produce a
  passing `Required gates` result.

### Cache miss

- [x] Run once with an empty GitHub Actions cache.
- [x] Confirm pnpm installs successfully with `--frozen-lockfile`.
- [x] Confirm a later cache hit restores only the pnpm store; installation still
  runs and no `dist`, coverage, tarball, or test output is restored as build
  input.

### Windows failure

- [ ] Introduce a temporary Windows-only synthetic fixture failure.
- [ ] Confirm `Platform / windows-latest / Node.js 24` and `Required gates` fail
  while branch protection blocks merge.

### Fuzz artifact

- [ ] Dispatch `Nightly quality` with a safe deterministic failing seed in a
  temporary test branch or fork of the workflow.
- [ ] Confirm only `test/fuzz-corpus/generated/last-failure.json` is uploaded,
  it contains a synthetic minimized fixture and replay data, and no environment
  dump or raw secret is present.

### Documentation drift

- [ ] Change a generated API default or doctest block without its source.
- [ ] Confirm `pnpm docs:check`, `Fast / static, docs, architecture`, and
  `Required gates` fail and block merge.

## Evidence record

| Field | Value |
| --- | --- |
| Date and verifier | 2026-07-18, repository administrator via GitHub REST API |
| Branch rule or ruleset URL | `https://api.github.com/repos/W0rldHacker/kasane/branches/main/protection` |
| Required context | `Required gates` |
| Failing pull request URL | `https://github.com/W0rldHacker/kasane/pull/4` |
| Fork permission run | |
| Cancelled/newest run pair | Runs `29652396509` and `29652410628` cancelled after newer pushes |
| Cache miss/hit runs | Miss `29652305396`; hit `29652591479`; frozen install ran in both |
| Windows failure run | |
| Fuzz artifact run and sanitized review | |
| Documentation drift run | |
| Nightly notification recipients checked | |
| Coverage and tarball artifacts | Run `29652591479`, artifacts `coverage-29652591479` and `packed-tarball-29652591479` |
