# Kasane source testkit

`@worldhacker/kasane-source-testkit` is the reusable conformance suite for
Kasane companion parsers and provider sources. It tests the public `1.x`
extension contract; it does not import or expose core internals.

## Provider source

```ts
import { runSourceConformance } from '@worldhacker/kasane-source-testkit';

await runSourceConformance({
  name: 'my-provider',
  async create(fixture) {
    return createFixtureProvider(fixture);
  },
});
```

The adapter supplies fixtures for ordinary data, provider failure, abort, secret
annotation, and dangerous keys. The suite also verifies that the source cannot
observe previous configuration or perform Kasane's merge, and that any provider
reference is plain, bounded, and secret-free.

## Text parser

```ts
import { runParserConformance } from '@worldhacker/kasane-source-testkit';

await runParserConformance({
  name: 'my-format',
  parse,
  validSource: 'port = 3000',
  validValue: { port: 3000 },
  invalidSource: 'invalid',
  failureCanary: 'PARSER_FAILURE_CANARY',
  dangerousSource: 'dangerous',
  secretSource: 'token = "PARSER_SECRET_CANARY"',
  secretCanary: 'PARSER_SECRET_CANARY',
});
```

Parsers may be synchronous or asynchronous. Their result is untrusted plain
data; core remains responsible for normalization, dangerous-key rejection,
merge, provenance, and redaction.

## Compatibility

The package has a peer dependency on `@worldhacker/kasane >=1.0.0 <2` and
supports Node.js 22 and newer. A new core major requires a new compatible
testkit line; companion packages declare both ranges explicitly.
