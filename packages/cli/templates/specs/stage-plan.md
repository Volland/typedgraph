## Traceability with tg

This project records its intent as a typed graph with `tg`. While planning the design of this {{name}} spec:

- Run `tg ontology` once and use its type and edge names.
- Write each design decision so it can become a lat.md `Decision` section: the choice, the alternatives rejected, and its reasons as named relations (`- motivated_by::` a constraint or concept, `- supersedes::` an earlier decision).
- Name the external rules the design must respect as `Constraint` sections with `- constrains:: [[{{requirement}}]] {strength: must}` edges.
- Check what already exists before designing: `tg trace` shows what is implemented, `tg cypher --code annotated "MATCH (c:CodeSymbol)-[:implements]->(r) RETURN r.requirement, c.path, c.symbol"` shows where.
