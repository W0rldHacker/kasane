# Secrets and safe diagnostics

Kasane can keep annotated secrets out of its diagnostic surfaces. The guarantee
is structural and explicit: applications must identify which values are
sensitive and must treat the raw snapshot as sensitive.

## How do I mark a value as secret?

Choose the narrowest useful annotation:

```ts
import {
  kasane,
  secret,
  secretValue,
  value,
} from '@worldhacker/kasane';

const snapshot = await kasane({
  layers: [
    value('application', {
      database: {
        host: 'localhost',
        password: secretValue('TEST_DATABASE_PASSWORD_CANARY'),
      },
    }),
    secret('runtime-secrets', async () => ({
      apiToken: 'TEST_API_TOKEN_CANARY',
    })),
  ],
  secrets: ['integrations.*.token'],
});
```

- `secretValue(value)` marks that incoming subtree and is consumed before the
  value reaches the snapshot.
- `secret(name, valueOrLoader)` marks every descendant supplied by that layer.
- `secret: true` on a `value`, `file`, `env`, or custom `LayerDescriptor` marks
  the complete layer.
- `secrets` applies path policy after merge and validation. `*` matches exactly
  one segment; recursive `**` is unsupported.

A later public value clears a layer/value annotation for the current value,
unless path policy still matches it. Earlier secret entries in `full` history
remain protected. A later secret value makes the current value secret.

Never put production credentials in examples, source control, layer names,
paths, provider references, or error messages. Secret annotations protect
configuration values, not arbitrary strings embedded in metadata.

## Which surfaces are raw and which are safe?

| Surface | Contract |
| --- | --- |
| `snapshot.value` | Raw configuration, including marked secrets |
| `snapshot.get()` / `require()` | Raw value at the requested path |
| `snapshot.has()` / `origin()` | No configuration value returned |
| `snapshot.toJSON()` / `JSON.stringify(snapshot)` | Detached, structurally redacted tree |
| Node.js `util.inspect(snapshot)` | Same safe diagnostic representation |
| `snapshot.explain()` / `.format()` | Redacted and bounded values/history |
| `snapshot.diff()` | Redacted sides; secret fingerprints may be present |
| Kasane error JSON and inspection | Allowlisted details and sanitized causes |
| `onEvent` lifecycle callback | Frozen, value-free metrics and identities |

`snapshot.value`, `get()`, and `require()` exist to configure the application;
do not send their results to logs, telemetry, crash reports, HTTP responses, or
generic serializers. Destructuring a secret from `value` does not retain any
redaction metadata around the resulting JavaScript value.

Safe serialization only redacts values that Kasane knows are secret. There is
no heuristic detection, and a public string literally equal to `[REDACTED]`
stays public. There is deliberately no debug flag that reveals raw secrets.

## What is the guarantee boundary?

Kasane guarantees that correctly annotated values do not enter its own JSON,
inspection, explain, diff, validation-issue, error, or lifecycle-event output.
Diagnostic traversal is bounded; when a limit is reached, output is truncated
instead of falling back to a raw value.

Kasane does not:

- prevent application code from reading or leaking `snapshot.value`;
- detect an unannotated credential by its content;
- redact values already logged by a source, parser, validator, or provider SDK;
- encrypt memory, lock process pages, or erase JavaScript strings on demand;
- connect to, authenticate with, or replace a secret manager;
- sandbox trusted custom executable code.

Review the fuller [threat model](../threat-model.md) and report vulnerabilities
through the [security policy](../../SECURITY.md).

## Why do secret histories contain fingerprints?

In `full` provenance, a secret history entry stores a versioned SHA-256 digest
instead of plaintext. Current secret diff sides can also include the digest.
Provide `fingerprintKey` to use HMAC-SHA-256:

```ts
const fingerprintKey = process.env.KASANE_FINGERPRINT_KEY;
if (fingerprintKey === undefined) {
  throw new Error('KASANE_FINGERPRINT_KEY is required');
}

const snapshot = await kasane({
  fingerprintKey,
  layers,
  provenance: 'full',
});
```

The key is used while building the snapshot and is not copied into snapshot
metadata. A `FingerprintKey` may be a string or `Uint8Array`; a
`SecretFingerprint` is algorithm- and version-labelled.

Unkeyed fingerprints of low-entropy values are vulnerable to offline guessing.
They are comparison aids, not password hashes, encryption, or secret storage.
Applications that compare snapshots across processes must deliberately supply
the same protected HMAC key.

## Which resource limits apply?

The invocation accepts `limits` for normalization and the built-in file source:

```ts
import { kasane } from '@worldhacker/kasane';

const snapshot = await kasane({
  layers,
  limits: {
    maxDepth: 64,
    maxNodes: 100_000,
    maxSourceBytes: 10_000_000,
    maxStringLength: 1_000_000,
  },
});
```

These are the defaults exported as `DEFAULT_KASANE_LIMITS`;
`DEFAULT_MAX_SOURCE_BYTES` exposes the file default separately. Limits apply to
every source result and validator output. Built-in files enforce bytes before
calling their parser. Raising a limit raises worst-case CPU and memory use.

Paths, per-snapshot path caches, schema issues, and diagnostic formatting have
additional fixed budgets listed in the [threat model](../threat-model.md).

## Can observers see values?

No. `onEvent` receives synchronous source, merge, validation, and snapshot
lifecycle events containing layer identity, duration, node count, and success.
Events are frozen and contain no configuration values. Callback throws and
rejected promises are ignored so observability cannot change the result.
