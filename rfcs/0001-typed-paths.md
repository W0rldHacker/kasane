# RFC-0001: Opt-in depth-limited typed paths

- Status: Draft — hold for external consumer evidence
- Owner: `POST-004`
- Stable API impact: none

## User evidence and hypothesis

The POST-004 sponsor requested research. The TypeScript packed consumer proves
that typed applications use Kasane, but neither alpha nor beta feedback asks for
inferred path return types. Direct `snapshot.value` access and runtime
`get(string): unknown` are documented workarounds.

Hypothesis: users with dynamic operational lookups may value checked string
paths enough to opt into extra compiler work. Promotion requires two independent
consumers with a concrete unsafe/refactor-prone path use case.

## Prototype contract

`typedPaths(snapshot, { depth })` lives only in the private experiment package.
Depth is an explicit integer from 1 through 6 and defaults to 4. The helper
delegates at runtime to public `snapshot.get` and `snapshot.require`; it does
not modify `ConfigSnapshot` or core declarations. Prototype keys containing `.`
or `\` are excluded because correct compile-time escaping needs separate
evidence and cost measurement. Arrays use numeric path segments.

## Performance budget

The large fixture contains 100 sections and six nested path segments. On the
pinned TypeScript version:

- total instantiations MUST stay at or below 250,000;
- typed-helper instantiations MUST be no more than 8 times the plain core
  fixture, with a 25,000-instantiation noise allowance;
- wall time MUST stay below 20 seconds on the ordinary gate;
- a future public package needs editor/tsserver measurements on two real
  consumer projects, not only `tsc`.

Run `pnpm post-004:bench`. These are experiment rejection budgets, not public
performance promises.

## Security and compatibility

Types do not validate runtime data. `get` still returns `undefined` when an
asserted generic disagrees with the value, and `require` retains core errors.
The wrapper never reads raw values except through the caller-requested public
lookup. Recursive type depth is bounded and cannot be configured beyond 6.

No core export changes before an accepted RFC and package naming review. The
prototype can be deleted without a release.

## Review decision

Keep as a measurement vehicle. Do not publish until demand and language-server
evidence exist.
