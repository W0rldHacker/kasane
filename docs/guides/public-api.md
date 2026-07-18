# Public API map

This page is an orientation map for the stable `1.0` surface, not generated API
reference. The supported import paths are only `@w0rldhacker/kasane` and
`@w0rldhacker/kasane/standard-schema`; signatures in the installed declarations remain the
source of truth.

## Which functions and values are runtime exports?

| Export | Purpose |
| --- | --- |
| `kasane(options)` | Load, normalize, merge, validate, and return a snapshot |
| `value(name, data, options?)` | Declare an in-memory layer |
| `file(name, path, options?)` | Declare a bounded UTF-8 file layer; JSON by default |
| `env(name, options?)` | Declare an environment-variable layer |
| `secret(name, input, options?)` | Declare an all-secret value or loader layer |
| `secretValue(value)` | Mark one incoming subtree as secret |
| `remove` | Unique marker that removes a root or object path |
| `ConfigSnapshot` | Public snapshot constructor and `instanceof` value |
| `DEFAULT_KASANE_LIMITS` | Frozen resolved default limits |
| `DEFAULT_MAX_SOURCE_BYTES` | Default built-in file byte limit |
| `KasaneError` | Base class for controlled public failures |
| `KasaneLayerError` | Invalid descriptor or layer declaration |
| `KasaneSourceError` | Source read, parse, or mapping failure |
| `KasaneMergeError` | Normalization or merge failure |
| `KasaneValidationError` | Function or Standard Schema validation failure |
| `KasanePathError` | Malformed or required-missing path |
| `KasaneSecurityError` | Security policy or resource-limit failure |

Applications normally obtain snapshots from `kasane()`. The exported
`ConfigSnapshot` constructor creates a detached value-only snapshot and carries
no layer provenance; use it only when that is the intended contract.

All error classes have a stable category `code`, allowlisted `details`, safe
`toJSON()`, and sanitized cause summary. The associated public shapes are
`KasaneCauseSummary`, `KasaneErrorDetails`, `KasaneErrorDetailsInput`,
`KasaneErrorJson`, and `KasaneErrorOptions`.

## What options does `kasane()` accept?

`KasaneOptions` contains:

| Option | Meaning |
| --- | --- |
| `layers` | Required ordered `LayerDescriptor` array |
| `cwd` | Base directory for relative-path sources |
| `fingerprintKey` | String or `Uint8Array` HMAC key for secret fingerprints |
| `freeze` | Runtime deep-freeze; defaults to `true` |
| `limits` | `KasaneLimits` resource overrides |
| `merge` | Exact-path `MergeRuleDeclarations` |
| `onEvent` | Invocation-local `KasaneEventCallback` |
| `provenance` | `none`, `origin-only`, or `full` |
| `secrets` | Exact or single-segment-wildcard secret paths |
| `signal` | Abort signal for the complete pipeline |
| `validate` | Function or Standard Schema validation adapter |

`DeepReadonly`, `RedactedConfigNode`, `ResolvedKasaneLimits`, `MergeStrategy`,
`ProvenanceMode`, `FingerprintKey`, and `SecretFingerprint` describe the
corresponding inputs and outputs.

## Which layer and source types are public?

The built-in helper declarations use these types:

- `LayerDescriptor`, `ValueLayerOptions`;
- `FileLayerOptions`, `FileParser`;
- `EnvLayerOptions`, `EnvMap`, `EnvMapEntry`, `EnvParser`, `EnvSource`;
- `SecretLayerOptions`, `SecretLoader`, `SecretValue`.

Custom providers use `LayerSource`, `SourceContext`, and `SourceLimits`.
`LoadedLayer`, `SourceMetadata`, and `SourcePathReference` describe normalized
load results and safe provider references. Their intended use is covered in
[Getting started](./getting-started.md#how-do-i-add-a-custom-source).

## What can I do with a snapshot?

The `ConfigSnapshot<T>` interface exposes:

| Member | Result |
| --- | --- |
| `value` | Raw, detached `DeepReadonly<T>` configuration |
| `get(path)` | Raw value as `unknown`, or `undefined` |
| `has(path)` | Whether the runtime path exists |
| `require(path)` | Raw value as `unknown`, or `KasanePathError` |
| `origin(path)` | Current `Origin`, when recorded |
| `explain(path)` | Safe discriminated `Explanation` |
| `diff(other)` | Safe `ConfigDiff` |
| `toJSON()` | Detached `RedactedConfigNode` |

Provenance output is represented by `Origin`, `OriginLayer`, `Explanation`,
`ExplanationData`, `ExplanationMethods`, `FoundExplanationData`, and
`MissingExplanationData`. Full history uses `ExplanationHistoryEntry`,
`ExplanationValueHistoryEntry`, `ExplanationRedactedHistoryEntry`, and
`ExplanationOperationHistoryEntry`.

## Which validation types are public?

`ValidationAdapter`, `FunctionValidator`, and `InferValidationOutput` describe
accepted validators and inferred output. Failures can expose `ConfigIssue` and
`ConfigIssuePrevious` records.

The `@w0rldhacker/kasane/standard-schema` subpath exports runtime
`isStandardSchemaV1(value)` and the `StandardSchemaV1` interface plus namespace
types. Schema libraries remain consumer dependencies.

## Which diff types are public?

`ConfigDiff` contains a readonly array of the `ConfigChange` union. Its members
are `AddedConfigChange`, `RemovedConfigChange`, `ValueChangedConfigChange`,
`SourceChangedConfigChange`, and `ValueAndSourceChangedConfigChange`;
`ConfigChangeType` is their string discriminator.

`ConfigDiffSide` contains a safe value, optional fingerprint, and `DiffSource`.
The source union is represented by `AvailableDiffSource` and
`UnavailableDiffSource`. See [Diff and reloads](./diff-and-reloads.md).

## Which lifecycle event types are public?

`onEvent` receives the `KasaneEvent` union. `KasaneEventType` contains
`source:start`, `source:end`, `merge:start`, `merge:end`, `validation:start`,
`validation:end`, and `snapshot:created`.

The specific records are `SourceStartEvent`, `SourceEndEvent`,
`MergeStartEvent`, `MergeEndEvent`, `ValidationStartEvent`,
`ValidationEndEvent`, and `SnapshotCreatedEvent`. Shared shapes are
`LayerEventIdentity` and `CompletedEventMetrics`; callbacks use
`KasaneEventCallback`. Events contain no configuration values.

## How should I import types?

Use ESM public exports and TypeScript's type-only syntax:

```ts
import { env, kasane } from '@w0rldhacker/kasane';
import type {
  ConfigSnapshot,
  EnvLayerOptions,
  KasaneOptions,
  LayerSource,
} from '@w0rldhacker/kasane';
import type { StandardSchemaV1 } from '@w0rldhacker/kasane/standard-schema';
```

Do not import `@w0rldhacker/kasane/dist/*`,
`@w0rldhacker/kasane/internal/*`, or source-tree paths. Those
are implementation details and are not present in the stable export map.
