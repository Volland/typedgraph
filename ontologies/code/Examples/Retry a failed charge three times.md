---
type: Decision
status: accepted
date: 2026-02-10
owner: Alice Moreau
---
A charge that fails with a network or 5xx error is retried three times with backoff, then reported to checkout as failed. Rejected: five retries, because the fifth attempt trips the provider's rate limit.

## Links

motivated_by:: [[Provider rate limit]] {weight: primary}
motivated_by:: [[Idempotency key]] {weight: secondary}
