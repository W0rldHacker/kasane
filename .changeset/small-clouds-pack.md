---
'@w0rldhacker/kasane': patch
---

Changed: Audit the exact reproducible npm tarball, enforce its file and size
allowlist, scan it for secrets and install scripts, and run packed consumers
against the retained artifact before release.
