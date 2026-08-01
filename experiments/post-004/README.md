# POST-004 experiments

This private workspace package contains removable research prototypes for the
POST-004 RFCs. It is not published, has no stable export map, and is not a
compatibility contract.

The prototypes consume only public Kasane and watch-companion APIs:

- depth-limited typed path wrapper;
- allowlisted OpenTelemetry-shaped and `diagnostics_channel` event adapters;
- value-free, cancellable remote polling watch adapter;
- parser for closed serializable merge-operation declarations.

Run:

```bash
pnpm post-004:verify
pnpm post-004:bench
```

Promotion and evidence rules are in [`rfcs/README.md`](../../rfcs/README.md).
Deleting this directory, its workspace glob, and the `post-004:*` scripts is a
non-breaking repository cleanup.
