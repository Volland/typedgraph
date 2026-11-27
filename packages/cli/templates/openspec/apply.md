## Traceability with tg

This project traces OpenSpec requirements to code and records its intent as a typed graph with `tg` (see the `tg-trace`, `tg-impact` and `tg-docs` skills). While implementing each task:

- Run `tg ontology` once: use its edge names and the properties each edge takes; never invent a synonym.
- Before editing existing code, check what it already promises and what binds it: `tg cypher --code annotated "MATCH (c:CodeSymbol {path: '<file>'})-[r]-(x) RETURN c.symbol, type(r), x.title, r"`.
- Requirements of this change resolve at once as pending: put `// @tg: implements:: [[openspec:<capability>#<Requirement>]]` directly above each function or class you write that realizes a requirement (entry points only, 1 to 3 per requirement). Add what you know as properties: `{confidence: partial}` when it covers part of the requirement, `{since: "<version>"}`.
- Put `// @tg: verifies:: [[openspec:<capability>#<Requirement>#<Scenario>]]` directly above the `it(...)` or `test(...)` that proves each scenario, with `{level: unit}` or `integration` when it helps.
- Code that knowingly departs from a decision or requirement gets `// @tg: -contradicts:: [[...]] {ticket: "...", until: "..."}`.
- Record the change's decisions and constraints in `lat.md/`: a `Decision` section per design decision with `- motivated_by::` edges to its reasons and `- supersedes::` to what it replaces, a `Constraint` section per external rule with `- constrains::` edges to what it binds. Type the file with `type:` frontmatter.
- If a new capability is explained in lat.md, add it to that file's `openspec:` frontmatter.
- After each task: `tg check`{{if:lat-integration}}, `lat check`{{end}} and `tg ontology check` must pass. When all tasks are done, `tg trace <capabilities> --gaps` should list nothing this change was meant to cover; report anything left, do not hide it.
