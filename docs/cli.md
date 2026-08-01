# Safe diagnostics CLI

`@worldhacker/kasane-cli` is the post-`1.0` companion for operational `explain`,
`sources`, `diff`, and `print` commands. It consumes only public
`@worldhacker/kasane` exports and adds no parser dependency or executable
entry point to core.

The CLI accepts a bounded, declarative `kasane.config.json` version `1`.
It never imports JavaScript or TypeScript configuration, loads remote
providers, or accepts provider credentials. Its public config contract and
examples are documented in the [package README](../packages/cli/README.md).

All diagnostics preserve the core redaction contract. `print` is always the
result of `snapshot.toJSON()`, and there is no secret reveal flag. JSON output
uses the versioned `@worldhacker/kasane-cli-output` envelope with `schemaVersion: 1`.
Stable exit codes and `KASANE_CLI_*` errors are listed in the package README.

Focused verification:

```bash
pnpm --filter @worldhacker/kasane-cli test
pnpm --filter @worldhacker/kasane-cli exec kasane explain server.port
```

The second command expects a version-1 `kasane.config.json` in the current
directory (or an explicit `--config` path).
