---
type: Scenario
status: stable
---
Given a charge that fails four times in a row, when the retry loop runs, then the provider receives four attempts and checkout gets a failure.

## Links

refines:: [[Failed charges are retried]]
