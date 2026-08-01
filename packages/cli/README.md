# @worldhacker/kasane-cli

`@worldhacker/kasane-cli` provides secret-safe operational diagnostics for
Kasane without adding a parser or executable-config loader to core.

```bash
pnpm exec kasane explain server.port
pnpm exec kasane sources
pnpm exec kasane diff kasane.production.json
pnpm exec kasane print
```

The binary reads `kasane.config.json` from the current directory by default. Use
`--config <file>` to select another file and `--json` for machine output.

## Declarative config contract

Only JSON contract version `1` is accepted. JavaScript and TypeScript config
files are never imported or executed. The loader always enables full provenance
and supports public core `value`, JSON `file`, and `env` sources.

```json
{
  "version": 1,
  "layers": [
    {
      "type": "file",
      "name": "defaults",
      "path": "config/defaults.json"
    },
    {
      "type": "env",
      "name": "runtime",
      "prefix": "APP__",
      "coerce": "json",
      "secret": true
    }
  ],
  "secrets": ["database.password"]
}
```

Top-level fields are `version`, `cwd`, `layers`, `limits`, `merge`, and
`secrets`. Relative `cwd` is resolved from the config file; file-layer paths are
then resolved from that directory. The config document is bounded to 1,000,000
bytes by default. Custom parsers, validators, functions, remote providers,
credentials, fingerprint keys, and arbitrary source code are not part of this
contract.

`value` layers use `data`. `file` layers use `path` and may use `optional`.
`env` layers support `prefix`, `separator`, `case`, `coerce`, and declarative
`map` entries. Every layer may use `enabled` and `secret`.

The package exports `parseCliConfig()` and `loadCliConfig()` for consumers that
need the same loader contract. Its runtime code imports core only through the
public `@worldhacker/kasane` entry point.

## Output safety

`print` always calls the public `snapshot.toJSON()` redacted serializer.
`explain`, `sources`, and `diff` use only public diagnostic APIs. There is no
`--show-secrets`, debug override, or equivalent reveal option. Correct secret
annotation is still required; unannotated values cannot be detected by content.

Machine output has the stable envelope:

```json
{
  "schema": "@worldhacker/kasane-cli-output",
  "schemaVersion": 1,
  "ok": true,
  "command": "print",
  "data": {}
}
```

Failures use the same `schema` and `schemaVersion`, set `ok` to `false`, and
contain an error with a stable `KASANE_CLI_*` code. Machine errors are written
to stdout so one stream contains exactly one JSON document.

## Exit codes

| Exit | Meaning                                | Stable error codes                                                                   |
| ---: | -------------------------------------- | ------------------------------------------------------------------------------------ |
|  `0` | Success                                | —                                                                                    |
|  `1` | Unexpected internal failure            | `KASANE_CLI_INTERNAL`                                                                |
|  `2` | Invalid command or option              | `KASANE_CLI_USAGE`                                                                   |
|  `3` | Missing, invalid, or unloadable config | `KASANE_CLI_CONFIG_NOT_FOUND`, `KASANE_CLI_CONFIG_INVALID`, `KASANE_CLI_LOAD_FAILED` |
|  `4` | Requested path is missing              | `KASANE_CLI_PATH_MISSING`                                                            |

## Compatibility

Version `0.x` requires `@worldhacker/kasane >=1.0.0 <2` and Node.js 22 or newer.
It is independently versioned and adds no core export or dependency.
