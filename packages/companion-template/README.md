# Kasane companion package template

Copy this private workspace package when starting a format or provider
companion. Rename the package, replace the example client, and keep the public
contract deliberately small.

The template demonstrates these boundaries:

- import only public types from `@worldhacker/kasane`;
- return provider data from `LayerSource.load()` without merging it;
- forward abort through `SourceContext.signal`;
- mark a complete secret layer with `LayerDescriptor.secret`;
- return a non-secret provider reference beside the layer, because core does not
  accept custom metadata from `load()`;
- keep provider SDK dependencies in the companion package;
- run `@worldhacker/kasane-source-testkit` against every implementation.

```ts
const { layer, reference } = companionProvider('production-secrets', {
  client,
  resource: 'team/service/production',
  secret: true,
});

const snapshot = await kasane({ layers: [layer] });
```

`reference` is safe application metadata. It must contain identifiers only,
never fetched values, credentials, tokens, provider error text, or SDK objects.

Run `pnpm --filter kasane-companion-template test` and
`pnpm --filter kasane-companion-template pack:check` after adapting the
template.
