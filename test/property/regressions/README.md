# Property regression fixtures

On failure, the property runner writes the minimized counterexample to
`last-failure.json` and reports its `seed` and shrink `path`. Reproduce it with:

```bash
pnpm test:property -- --seed=<seed>
```

After fixing the defect, promote the minimized counterexample to a named,
committed fixture or explicit regression test before removing the generated
file.
