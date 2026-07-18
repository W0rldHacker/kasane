# Migration policy and guide

This guide is the durable index for incompatible changes. There are no released
migrations yet. A release that changes a public contract adds a section here
before its release PR can be approved.

## What must a migration entry contain?

Each entry identifies the first affected version, old and new behavior, who is
affected, replacement code, diagnostic or type changes, and a rollback or
containment path. The related Changeset includes a stable `Migration:` link to
that entry. If the change is security-sensitive, the entry avoids exploit
details until the coordinated advisory is public.

Public contract includes runtime values, TypeScript declarations, exports,
defaults, merge and provenance semantics, accepted input, error codes, and any
documented diagnostic format. A Changeset declaration alone does not prove that
these surfaces are compatible.

## How are deprecations migrated?

The release that introduces a deprecation provides a replacement and a
before/after example. The deprecated surface remains functional for at least
one minor release. After `1.0`, removal is a major release. The only accelerated
path is a security removal that cannot be safely retained; its changelog entry,
migration, and security advisory explain the impact and the safest replacement.

## Migration template

```markdown
## Replace `<old API>`

- First affected version: `x.y.z`
- Last version with old behavior: `x.y.z`
- Affected users: ...
- Why it changed: ...

### Before

...

### After

...

### Diagnostics and types

...

### Rollback or containment

...
```
