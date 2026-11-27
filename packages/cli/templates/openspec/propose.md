## Traceability with tg

This project traces OpenSpec requirements to code and records its intent as a typed graph with `tg` (see the `tg-trace`, `tg-docs` and `tg-graph` skills). While writing the change:

- Run `tg ontology` first: it lists the types (Decision, Requirement, Constraint, Concept, ... and any the project added) and the edge names with their properties. Use those names everywhere in the change.
- Before proposing, run `tg trace <capability>` for each capability you touch and `tg search "<topic>"` for the lat.md sections that explain it. Ask the graph what binds the area: `tg cypher "MATCH (x)-[r:constrains|motivated_by|contradicts]-(s) WHERE s.title CONTAINS '<topic>' RETURN type(r), x.title, s.title"`. Build on what is implemented; mention gaps and constraints you find.
- Requirement and scenario names become ids that code points at (`openspec:<capability>#<Requirement>#<Scenario>`). Choose short, stable, specific names. In MODIFIED deltas **keep every existing requirement and scenario name exactly**, and add scenarios instead of renaming them.
- Give every requirement at least one scenario a test can prove; each scenario will get a `@tg: verifies::` line on its test.
- In `design.md`, write each decision so it can become a `Decision` section: the choice, the alternatives rejected, and its reasons as named relations (motivated by which constraint or concept, superseding which earlier decision).
- In `tasks.md`, add tasks to record the change's decisions and constraints in `lat.md/` as typed sections with typed edges, to annotate code with `@tg: implements::` and tests with `@tg: verifies::`, and a final task: "`tg check`, {{if:lat-integration}}`lat check`, {{end}}`tg ontology check` and `tg trace <capabilities> --gaps` show no new gaps."
- If the change adds a capability, plan which lat.md file will name it in its `openspec:` frontmatter.
