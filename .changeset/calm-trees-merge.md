---
'@w0rldhacker/kasane': patch
---

Fixed: Reject revoked or otherwise uninspectable proxy containers with a
sanitized normalization error instead of leaking a native exception.
