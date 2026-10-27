### Spec Kit

`tg` reads `specs/<feature>/spec.md` of every feature folder (`001-user-auth`, or a timestamped one).

```
speckit:<feature>#FR-001            functional requirement (also SC-001, NFR-001, any **XX-NNN** item)
speckit:<feature>#US1               user story 1 ("User Story 1" and its title also resolve)
speckit:<feature>#US1#Scenario 1    its first numbered acceptance scenario (also #1)
```

- `<feature>` is the folder name; the part after the number also resolves (`speckit:user-auth#FR-001`).
- Annotate code with the `FR-` it realizes and tests with the acceptance scenario they prove; `tasks.md` lines such as `T012 [US1]` tell you which story a task serves.
- `[NEEDS CLARIFICATION]` requirements carry `clarification: "needed"`: ask before implementing them.
- Docs name what they explain as `specs: ["speckit:001-user-auth"]` in frontmatter.
