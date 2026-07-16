# ADR-0006: Redacted serialization and sanitized causes

- Status: Accepted
- Date: 2026-07-15
- Decision owners: `ARCH-002`
- Requirements: `REQ-SNAP-002`, `REQ-ERR-001`, `REQ-SEC-003`,
  `REQ-SEC-005`, `REQ-VAL-003`
- Resolves: `DEC-006`, `DEC-012`

## Context

Snapshots contain raw values so applications can use secrets, but JavaScript
implicitly invokes `toJSON()` and inspection in logs, assertions, REPLs, error
reporters, and observability tools. Returning raw `T` from `toJSON()` would make
`JSON.stringify(snapshot)` a direct secret-exfiltration path. Likewise, exposing
an arbitrary source/parser/validator `Error` through standard `cause` allows its
message, properties, getters, stack, or custom inspection hook to bypass
redaction.

This ADR fixes the safe public meaning of serialization and cause summaries. It
does not implement a formatter, redactor, error class, or TypeScript signature.

## Decision

Library-owned diagnostics are safe by default and use one central Redactor.
There is no option, replacer convention, debug flag, or alternate inspect path
in core `1.0` that returns raw secrets.

### Snapshot surfaces

| Surface | Contract |
| --- | --- |
| `snapshot.value` | The only intentionally raw public value surface; deeply readonly by type and frozen by default, but may contain plaintext secrets |
| `snapshot.toJSON()` | Returns a detached, centrally redacted value representation; never returns `snapshot.value` or another internal reference |
| `JSON.stringify(snapshot)` | Uses the same safe `toJSON()` contract |
| Custom inspect / REPL output | Uses the same Redactor and never reveals raw value, provenance plaintext, or hidden internals |
| `explain`, diff, history, validation/source errors, events | Structured diagnostic surfaces; all pass through the same redaction policy |

`toJSON()` represents the snapshot value only; it does not implicitly append
provenance, history, tombstones, internal registries, caches, or error objects.
A secret leaf becomes the standard redaction placeholder. Public siblings remain
visible. A fully secret scalar root may therefore serialize as a redaction
string rather than the raw scalar type.

The public return type of `toJSON()` MUST describe a redacted representation,
not promise raw `T`. Exact type naming is owned by `TYPE-001`; the type cannot
suggest that secret-bearing output is identical to `snapshot.value`.

Every returned representation is detached. Mutating it cannot mutate the
snapshot, provenance, history, caches, or later serialization output. Redaction
is structural before stringification; regex replacement over a completed JSON
string is forbidden.

### Redaction semantics

The central Redactor receives a value plus resolved sensitivity/provenance
policy and produces a bounded diagnostic tree:

- secret leaves are replaced before formatting;
- mixed containers redact only secret descendants;
- secret history and tombstones contain no plaintext;
- fingerprints may appear only on diagnostic contracts that explicitly define
  them, never as a replacement raw value in `toJSON()`;
- formatting is deterministic and bounded;
- defensive traversal handles unexpected cycles without invoking user
  `toString`, getters, or custom inspection hooks;
- truncation markers are safe metadata and cannot expose omitted content.

`snapshot.value` is outside this diagnostic guarantee once application code
reads it. Kasane cannot prevent the application from logging a raw value.

### Public error contract

A public `KasaneError` may expose only library-generated safe fields:

- stable error class and `code`;
- a safe Kasane message;
- immutable structured details containing allowlisted items such as canonical
  path, layer name/kind, operation, safe reference, or limit name;
- an optional sanitized cause summary.

The arbitrary original cause object MUST NOT be assigned to a public `cause`
property, details, JSON, inspect output, stack adjunct, or explanation. It is
not traversed by generic serialization. The original cause may be used only
within the immediate trusted error boundary and is then discarded or retained
in inaccessible implementation-private state that no public surface inspects.

### Sanitized cause summary

A cause summary is a new detached immutable record, never the original object.
It may contain:

```text
name: normalized safe category
code: optional allowlisted primitive identifier
message: optional sanitized summary
```

Rules:

1. Sanitization does not invoke arbitrary getters, `toString`,
   `Symbol.toPrimitive`, `toJSON`, or custom inspect hooks.
2. Object-valued, symbol, accessor, cyclic, or unsupported fields are omitted.
3. Arbitrary third-party messages are unsafe by default. They are replaced by a
   generic reason unless an adapter produces a library-controlled safe summary.
4. In a secret context, the cause message is omitted or generic even when it
   would otherwise be allowed.
5. Length and character budgets apply before the summary becomes public.
6. The raw cause stack is never appended. The public stack belongs only to the
   safe Kasane error and therefore begins with its safe message.

Validation issue reasons follow the same rule. A third-party validator message
that may embed a received value cannot be copied verbatim merely because it is
a string.

### JSON and inspect shapes

Error JSON/inspect output is derived only from the safe error contract. It may
include `name`, `code`, safe `message`, safe details, and sanitized cause summary
according to the eventual public error schema. Non-enumerability or default
`Error` behavior is not a security boundary; explicit safe serialization is.

Inspecting with depth, colors, getters, or hidden options must not expose raw
snapshot private fields or the arbitrary cause. Formatters do not use ANSI by
default and never call raw `String(value)` for a secret.

### Relationship to validation and tombstones

- A schema-coerced secret retains sensitivity under ADR-0005 and serializes as
  redacted.
- A schema-added path is redacted when the reapplied secret policy marks it.
- A tombstone is provenance-only and never appears in snapshot value JSON.
- `explain(removedPath)` may serialize a safe removal record, with prior values
  redacted or fingerprinted according to the explicit explanation contract.

## Consequences

### Positive

- Common JSON/log/inspect operations are safe by default.
- One policy covers current values, history, diff, errors, and validation.
- An untrusted error object cannot inject custom serialization or secret text.
- Public types no longer imply that `toJSON()` is a raw escape hatch.

### Costs

- `JSON.stringify(snapshot)` is not a substitute for exporting raw config.
- Secret roots and leaves can change apparent JSON value types to the redaction
  placeholder.
- Arbitrary third-party cause messages are less detailed unless an adapter can
  produce a safe library-controlled reason.
- Every diagnostic serializer needs provenance/policy context and output bounds.

## Rejected alternatives

- Raw `toJSON(): T`: makes accidental logging a supported secret leak.
- An `includeSecrets` or debug option: unsafe flags propagate into CLI/logging
  and contradict safe defaults.
- Regex masking after JSON/string formatting: misses escaping, transformed
  values, and non-string surfaces.
- Standard raw `Error.cause`: public inspect/JSON tools can traverse it outside
  Kasane's redaction boundary.
- Trusting third-party message strings: validators and parsers often include the
  rejected input value.

## Verification

Future `TS-SNAPSHOT`, `TS-REDACTION`, `TS-ERRORS`, `TS-VALIDATION`, and
`TS-ARCH` fixtures must prove:

1. direct `toJSON()`, `JSON.stringify`, and inspect contain no secret canary;
2. `toJSON()` returns a detached tree and never a raw/internal reference;
3. public siblings remain visible while secret leaves and roots are redacted;
4. tombstones and provenance internals do not appear in snapshot JSON;
5. a schema-coerced secret stays redacted;
6. circular/accessor/custom-inspect/toJSON causes execute no user hook and leak
   no value;
7. cause JSON, inspect, and stack adjunct contain only the sanitized summary;
8. third-party validation messages containing a canary become generic/safe;
9. architecture checks find no ad-hoc masking or raw-cause serialization outside
   the central modules.

## Related documents

- [ADR-0001: Core pipeline](./0001-core-pipeline.md)
- [ADR-0004: Paths](./0004-paths.md)
- [ADR-0005: Validation provenance](./0005-validation-provenance.md)
- [Architecture](../architecture.md)
- [Decision register](../assumptions.md)
