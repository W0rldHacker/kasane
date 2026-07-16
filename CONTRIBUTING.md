# Contributing

The contributor workflow is intentionally minimal while runtime modules are
being implemented.

1. Use Node.js 22 or 24 and the pnpm version pinned in `package.json`.
2. Install with `pnpm install --frozen-lockfile`.
3. Run `pnpm verify` before submitting a change.
4. Add or update tests for every behavioral change.
5. Add a changeset for user-visible changes with `pnpm changeset`.

Architecture-sensitive changes must update the relevant accepted ADR and must
not weaken the dependency, secret-redaction, or scope boundaries. Security
issues must not include real credentials in fixtures, logs, or examples.
