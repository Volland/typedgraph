### Kiro specs (Kiro, cc-sdd, spec-workflow-mcp)

`tg` reads `.kiro/specs/<feature>/requirements.md` and `.spec-workflow/specs/<feature>/requirements.md`.

```
kiro:<feature>#Requirement 1          a numbered requirement (also #1 or its title)
kiro:<feature>#Requirement 1#1.2      its second acceptance criterion (also #2)
```

- Criterion ids are the `N.M` numbers Kiro's `tasks.md` cites as `_Requirements: 1.1, 1.2_`; annotate the test that proves `1.2` with `verifies:: [[kiro:<feature>#Requirement 1#1.2]]`.
- Each criterion node carries its EARS pattern (`ears: event-driven`, `state-driven`, `unwanted`, `optional`, `ubiquitous`), so `MATCH (c:AcceptanceCriterion {ears: "unwanted"})` lists the error paths to test.
- Docs name what they explain as `specs: ["kiro:<feature>"]` in frontmatter.
