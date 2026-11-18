---
name: tg-team
description: Keep the team's who-knows-what map (transactive memory) in the typed graph and route people to each other - who owns or knows a decision, requirement or piece of code, who decided what and with which agent's help, and which agent acts for whom - using the team ontology (Member, Team, TeamAgent; owns, knows_about, decided_by, proposed_by, acts_for, hands_off_to). Use when asked why something is the way it is, who to ask about or who owns some code or a decision, before changing code someone else owns, when drafting or accepting a decision record, or when setting up the team map.
---

# Team map with tg

People remember a team by knowing who knows what and asking them. When questions go to agents instead, that map stops updating. This skill keeps it in the graph, next to the decisions and code it points at, so you route people to each other instead of answering for them.

The rule of thumb: **ask people "why", ask agents "how".** Answer "how" yourself. For "why", quote what was decided and name who decided it and who knows it.

## 0. Is there a team map?

Run `tg ontology` and look for the types `Member`, `Team` and `TeamAgent` and the edges `owns`, `knows_about` and `decided_by`.

If they are missing and the person wants a team map, ask first, then:

1. `tg gen team-types.md > Types/team-types.md`: the team ontology. The project owns it from then on, so adapt the edges to how this team works.
2. Create `lat.md/people.md` (`type: Member`), `lat.md/teams.md` (`type: Team`) and `lat.md/agents.md` (`type: TeamAgent`), each with a leading paragraph, and list them in the `lat.md` index.
3. Add a section for each person, titled with the name people use. Its first sentence gives their handle and role: `@alice, tech lead for payments; owns the retry policy.`
4. Let people write their own `knows_about` edges. Don't guess what someone knows from `git blame`. Suggest it and let them confirm.
5. `tg check` and `tg ontology check` until both pass.

The names are specific so the map composes with other ontologies: if the project also uses OKF's `Person` or the agents ontology's `Agent`, give a note both labels (`type: [Person, Member]`, `type: [Agent, TeamAgent]`) instead of declaring a type twice.

If they are missing and nobody asked, don't create them. Answer from the decisions and code, and say that a team map would let you name people.

## 1. Writing the map

Facts go on edges, because a section has no properties of its own. Its first sentence comes back as `summary` in queries.

```markdown
## Alice Moreau

@alice, tech lead for payments; owns the retry policy and the provider contract.

- member_of:: [[teams#Payments]] {since: "2024-03-01"}
- owns:: [[decisions#Retry a failed charge three times]] {since: "2026-02-10"}
- knows_about:: [[src/payments/retry.ts#chargeWithRetry]] {depth: expert}
```

- `owns` names the one person or team who says yes to a change. `knows_about` with `depth` (expert, working, aware) is the who-knows-what map: many people, graded. Don't merge the two.
- Agents get a section too, with `acts_for:: [[people#Alice Moreau]] {scope: "src/payments", autonomy: ask-first}`, and `hands_off_to:: [[agents#Review bot]] {via: "the pull request description"}` when work passes between agents.
- Put dates on edges (`since`, `date`) so stale knowledge can be found later.

## 2. When someone asks "why"

1. Find the decision: `tg search`, or follow `implements` from the code you started at.
2. Answer with what the decision says and its `motivated_by` reasons, quoted, not paraphrased.
3. Name who decided it and who knows it:

```cypher
MATCH (p:Member)-[r:owns|knows_about|decided_by]-(d:Decision {title: 'Retry a failed charge three times'})
RETURN p.title, p.summary, type(r), r.role, r.depth
```

4. If the record doesn't answer the question, say so and suggest asking the owner. Never invent a reason.

## 3. Before changing code

Run the `tg-impact` skill. Then find whom to talk to before the pull request, not after:

```cypher
MATCH (c:CodeSymbol {path: 'src/payments/retry.ts'})-[:implements]->(d)<-[:owns]-(p)
RETURN c.symbol, d.title, p.title, p.summary
```

Tell the person who owns each decision or requirement the change touches.

## 4. Decisions: agents propose, people decide

When you draft a decision:

- Write it with `proposed_by:: [[agents#<your agent section>]] {session: "<pull request or session link>"}`.
- Never write `decided_by` pointing at an agent. The ontology only allows a `Member`, and `tg ontology check` reports anything else.
- Leave `decided_by` for the person you act for. When they accept, they add `decided_by:: [[people#<name>]] {role: driver, date: <date>, assisted_by: "<agent>"}`. `assisted_by` is disclosure as data: routine, not a confession. Add `role: consulted` lines for the colleagues they asked.

Decisions an agent proposed that no person has decided yet:

```cypher
MATCH (d:Decision)-[:proposed_by]->(a:TeamAgent)
OPTIONAL MATCH (d)-[r:decided_by]->(p:Member)
WITH d, a, count(p) AS deciders WHERE deciders = 0
RETURN d.title, a.title
```

## 5. What you may touch

Read your own `acts_for` edge:

```cypher
MATCH (a:TeamAgent)-[r:acts_for]->(x) RETURN a.title, x.title, r.scope, r.autonomy
```

Outside `scope`, propose and don't edit. With `autonomy: ask-first`, ask before every write. A hand-off never widens scope: when you find a problem in something you can't change, name its owner.

## 6. Keeping the map alive

Offer these to whoever looks after shared context, for example at a weekly retro:

```cypher
// Topics only one person knows: pair someone up
MATCH (p:Member)-[:owns|knows_about]->(x)
WITH x, count(DISTINCT p) AS people, collect(p.title) AS who WHERE people < 2
RETURN x.title, who
```

```cypher
// Everything one person owns or knows, for a handover
MATCH (p:Member {title: 'Alice Moreau'})-[r]->(x) RETURN type(r), x.title
```

`tg refs "people#Alice Moreau"` lists the sections that point at a person. Renaming a person's heading breaks every link to it, and `tg check` lists them all, so the map can't drift silently.

## Limits

- Put queries in instructions, not names. "Ask Alice about payments" is stale the day Alice moves teams.
- Keep only what helps route work. The files are in git and everyone with the repository reads them.
- The built-in engine has no pattern predicates (`WHERE NOT ()-[:x]->(n)`); use `OPTIONAL MATCH` with `count`, as above.
- When you change `Types/team-types.md`, change this project's instructions or skills in the same pull request, so agents know how to use the new edge.
