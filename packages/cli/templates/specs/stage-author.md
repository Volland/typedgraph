## Traceability with tg

This project traces {{name}} requirements to code and records its intent as a typed graph with `tg` (see the `tg-trace`, `tg-docs` and `tg-graph` skills). While writing the spec:

- Run `tg ontology` first and use its type and edge names; never invent a synonym.
- Before writing, run `tg trace` and `tg search "<topic>"` for what is already specified, implemented and explained, and ask the graph what binds the area: `tg cypher "MATCH (x)-[r:constrains|motivated_by|contradicts]-(s) WHERE s.title CONTAINS '<topic>' RETURN type(r), x.title, s.title"`.
- Requirement ids become link targets that code and tests point at (`{{requirement}}`, `{{scenario}}`). Keep existing ids exactly: add new ones instead of renumbering or renaming.
- Give every requirement acceptance criteria a test can prove; each will get a `@tg: verifies::` line on its test.
- Record any architectural decision the spec implies as a `Decision` section in `lat.md/` (or an ADR) with `- motivated_by::` edges to its reasons.
