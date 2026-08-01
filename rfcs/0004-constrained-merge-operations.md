# RFC-0004: Serializable constrained merge operations

- Status: Draft — hold for external consumer evidence
- Owner: `POST-004`
- Stable API impact: none

## User evidence and hypothesis

No prerelease consumer requested custom merge. Existing documentation instead
identifies arbitrary callbacks as a threat to determinism and provenance.
POST-004 asks whether any narrower operation language is viable.

Hypothesis: if consumers need reusable merge declarations, a closed,
serializable operation union may cover the use case without executable code.
Promotion requires two concrete configurations that cannot use the four stable
strategies or a pre-merge custom source.

## Prototype contract

The parser accepts only three exact JSON shapes:

```json
{ "kind": "replace" }
{ "kind": "object-merge" }
{ "kind": "array-concat", "direction": "append", "maxItems": 1000 }
```

`direction` is `append` or `prepend`; `maxItems` is a safe integer from 0
through 100,000. These declarations currently map to existing stable strategies
and deliberately prove validation/removal properties rather than adding
behavior. Accessors, symbols, prototypes, extra fields, functions, and callback
properties are rejected without invocation.

Any future new operation MUST define deterministic input/output tables,
normalization limits, per-output provenance, tombstone behavior, secret
propagation, diff semantics, and a serializable version discriminator before
execution is prototyped.

## Performance and security budgets

- 100,000 declaration parses SHOULD complete within 1 second locally;
- parsing is O(number of fixed fields), allocates no unbounded cache, and
  invokes no user property hooks;
- callbacks, clocks, randomness, I/O, environment access, global registry,
  wildcard dispatch, and recursive operation composition are forbidden;
- nondeterministic callback fixtures MUST fail before merge.

## Review decision

Reject unlimited custom merge callbacks. Retain only the declaration parser as
evidence for a possible future closed operation contract.
