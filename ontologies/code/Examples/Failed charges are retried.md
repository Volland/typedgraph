---
type: Requirement
status: stable
priority: must
risk: high
owner: Alice Moreau
---
A charge that fails with a transient error SHALL be retried at most three times before checkout is told it failed.

## Links

introduced_by:: [[Add charge retries]]
-contradicts:: [[Cache provider tokens for ten minutes]] {reason: "a cached token can expire mid-retry", ticket: "PAY-88", until: "2026-Q2"}
