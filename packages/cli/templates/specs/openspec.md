### OpenSpec

`tg` reads `openspec/specs/<capability>/spec.md` and the spec deltas of open changes.

```
openspec:<capability>#<Requirement>
openspec:<capability>#<Requirement>#<Scenario>
openspec:<capability>#^<id>        an element with that id anywhere in the capability's spec
```

- `<capability>` is the folder under `openspec/specs/`, `<Requirement>` the text after `### Requirement:`, `<Scenario>` the text after `#### Scenario:`.
- Requirements ADDED or MODIFIED in an open change resolve at once, shown as `pending in <change>`; REMOVED ones show `removed by <change>`. Archiving keeps the id.
- Inside a requirement, mark a rule that code or a test must point at as `<rule id="lockout" strength="must">` ... `</rule>` (blank lines inside). It becomes a node the requirement `contains`; use scenarios for behaviour a test proves end to end.
- Docs name what they explain as `openspec: [auth, "billing#Refunds"]` in frontmatter.
