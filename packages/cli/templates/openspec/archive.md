## Traceability with tg

This project traces OpenSpec requirements to code and records its intent as a typed graph with `tg` (see the `tg-trace` and `tg-docs` skills). Around the archive:

- Before archiving, run `tg trace <capabilities of this change> --gaps` and include the result in the summary. Unimplemented or unverified requirements are worth a warning and a confirmation, like incomplete tasks.
- Check the deltas for renamed requirements or scenarios (RENAMED, or a MODIFIED header that no longer matches): annotations and typed doc edges still point at the old names. `tg edges --to "openspec:<capability>#<Old name>"` lists code annotations; `tg cypher "MATCH (s)-[r]->(q:Requirement {name: '<Old name>'}) RETURN s.section, type(r)"` lists doc edges. Update them before or with the archive.
- Make sure the change's design decisions live on in `lat.md/` as `Decision` sections with their `motivated_by::` and `supersedes::` edges: the change folder is archived, the decisions are not.
- After archiving, run `tg check`{{if:lat-integration}}, `lat check`{{end}} and `tg ontology check`: every `openspec:` link must still resolve against the merged specs and every typed edge must fit the ontology. Fix anything they report before finishing.
- If the archive created a new capability spec, make sure a lat.md file names it in its `openspec:` frontmatter, and replace the generated "TBD" Purpose.
