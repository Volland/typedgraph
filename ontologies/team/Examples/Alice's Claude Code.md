---
type: TeamAgent
---
Claude Code, working for Alice; drafts payment changes and decision records for her review.

## Links

acts_for:: [[Alice Moreau]] {scope: "payments code and decisions", autonomy: ask-first}
knows_about:: [[Retry a failed charge three times]] {depth: working}
hands_off_to:: [[Review bot]] {via: "the pull request description", when: "a change touches payments"}
