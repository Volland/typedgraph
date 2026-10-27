### BMAD Method

`tg` reads the PRD (`_bmad-output/planning-artifacts/prd.md`, or `docs/prd.md` and sharded `docs/prd/*.md`) and story files (`_bmad-output/implementation-artifacts/1-2-<slug>.md`, `docs/stories/1.2.<slug>.md`).

```
bmad:prd#FR-1                  functional requirement from the PRD (also NFR-1, FR1)
bmad:epic-1#Story 1.2          a story (also #1.2 or its title)
bmad:epic-1#Story 1.2#AC1      its first acceptance criterion (also #1)
```

- The dev agent annotates the code of each story task with the story or FR it implements and each test with the acceptance criterion it proves.
- Stories in `draft` or `backlog` status are pending.
- Docs name what they explain as `specs: ["bmad:prd", "bmad:epic-1"]` in frontmatter.
