# Code ontology

The vocabulary `tg init` installs in a code project, as a vault: what the code is meant to do and why. Open this folder as an Obsidian vault with the Typed Graph plugin, or copy `Types/` and `Templates/` into your own vault.

- **Types:** `Decision`, `Requirement`, `Scenario`, `Constraint`, `Concept`, `Change`.
- **Edges:** `refines`, `depends_on`, `supersedes`, `motivated_by`, `constrains`, `defines`, `introduced_by`, `changed_by`, `implements` and `verifies` (written from code with `@tg:` comments), plus `-contradicts` from the shared core.
- **Questions:** why is this decision the way it is? What is knowingly in conflict, until when? Which requirement has no scenario?

```cypher
MATCH (a)-[r:contradicts]->(b) RETURN a.title, b.title, r.ticket, r.until
```

`Types/code-types.md` here is the same file `tg init` writes, so a tg project already has it. The `requirements` and `team` ontologies build on it.
