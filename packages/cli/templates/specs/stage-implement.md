## Traceability with tg

This project traces {{name}} requirements to code with `tg` (see the `tg-trace`, `tg-impact` and `tg-docs` skills). While implementing each task:

- Run `tg ontology` once: use its edge names and the properties each edge takes.
- Before editing existing code, check what it already promises: `tg cypher --code annotated "MATCH (c:CodeSymbol {path: '<file>'})-[r]-(x) RETURN c.symbol, type(r), x.title, r"`.
- Put `// @tg: implements:: [[{{requirement}}]]` directly above each function or class you write that realizes a requirement (entry points only, 1 to 3 per requirement), with `{confidence: partial}` or `{since: "<version>"}` when they apply.
- Put `// @tg: verifies:: [[{{scenario}}]]` directly above the test that proves each acceptance scenario or criterion, with `{level: unit}` or `integration`.
- Code that knowingly departs from a requirement or decision gets `// @tg: -contradicts:: [[...]] {ticket: "...", until: "..."}`.
- After each task: `tg check` and `tg ontology check` must pass. When all tasks are done, `tg trace --gaps` should list nothing this work was meant to cover; report anything left.
