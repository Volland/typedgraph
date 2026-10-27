---
description: Keep lat.md/ in sync with the code as a typed graph using the tg CLI
alwaysApply: true
---

- Before starting work, run `tg search` with a query describing the task and read relevant sections with `tg section`.
- Run `tg ontology` once per session: it lists this project's types (Decision, Requirement, Constraint, ...) and edge types (`motivated_by`, `constrains`, `implements`, ...) with the properties each edge takes. Use those names; never invent synonyms.
- Run `tg expand` on prompts containing `[[refs]]`.
- Write intent as a typed graph: give each `lat.md/` file a `type:` in its frontmatter, and after a section's leading paragraph write each relation as a typed edge line, e.g. `- motivated_by:: [[constraints#Session limit]] {since: "2.3"}`. A leading `-` on the type (`-contradicts::`) means a known conflict.
- Link code to docs and specs with typed edges: `// @tg: implements::` above the declaration, `// @tg: verifies::` above the test. Spec ids by framework:
{{spec-bullets}}
- A relation the ontology lacks is a schema change: add it to `Types/` instead of a one-off name.
- After every task, update `lat.md/` for any changed behavior or decision, then run `tg check` and `tg ontology check` until both pass.
- Every `lat.md/` section needs a leading paragraph of at most 250 characters, before any edge list.
