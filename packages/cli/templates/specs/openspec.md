### OpenSpec

`tg` reads `openspec/specs/<capability>/spec.md` and the spec deltas of open changes.

```
openspec:<capability>#<Requirement>
openspec:<capability>#<Requirement>#<Scenario>
```

- `<capability>` is the folder under `openspec/specs/`, `<Requirement>` the text after `### Requirement:`, `<Scenario>` the text after `#### Scenario:`.
- Requirements ADDED or MODIFIED in an open change resolve at once, shown as `pending in <change>`; REMOVED ones show `removed by <change>`. Archiving keeps the id.
- Docs name what they explain as `openspec: [auth, "billing#Refunds"]` in frontmatter.
