# Team ontology

The team's who-knows-what map (its transactive memory) next to the decisions and code it points at: who is on the team, what each person and agent owns or can explain, who decided what with which agent's help, and which agent acts for whom. Open this folder as an Obsidian vault with the Typed Graph plugin, or in a tg project run `tg gen team-types.md > Types/team-types.md`.

- **Types:** `Member`, `Team`, `TeamAgent`.
- **Edges:** `member_of`, `owns`, `knows_about` (with `depth`), `decided_by` (with `role`, `date`, `assisted_by`), `proposed_by`, `acts_for` (with `scope`, `autonomy`), `hands_off_to`.
- **Questions:** who should I ask about this decision? What did an agent propose that no person has decided? What does only one person know?

```cypher
MATCH (p:Member)-[:owns|knows_about]->(x) WITH x, count(DISTINCT p) AS people, collect(p.title) AS who WHERE people < 2 RETURN x.title, who
```

It builds on the code ontology, which the download includes. `decided_by` ends only at a `Member`: an agent proposes, a person decides. The names are specific so the map composes with other ontologies: a note can be `type: [Person, Member]` with OKF or `type: [Agent, TeamAgent]` with the agents ontology. The `tg-team` skill that `tg init` installs tells coding agents how to use it.
