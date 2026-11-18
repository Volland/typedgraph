# Who knows, who decides, what the agent may do: a team map in tg

*A practical companion to "From Islands to Archipelago". How to write your team's transactive memory down as a typed graph next to the code: who owns what, who decided what, which agent acts for whom. Then how to teach your agents to route people to each other instead of around each other. Every file and query here was run with tg 0.28.1. Since tg 0.29.0, the team ontology is one command away (`tg gen team-types.md`) and `tg init` installs the `tg-team` skill.*

---

## The bridge, not the island

[From Islands to Archipelago](https://volodymyrpavlyshyn.substack.com/p/from-islands-to-archipelago-building), the second part of *The AI Cohesion Paradox*, argues that a team using AI without a plan turns into islands: each person with an agent is productive, and disconnected from everyone else. Its fix is mostly social. It proposes seven habits, a handful of rituals, a rotating context steward and incentives that reward sharing. Tools come last, with one test: *does it help the agent route people to each other, or around each other?*

This article is the "tools" section of that essay, written out in full. It assumes the habits and shows what to write down so they hold. The essay's warning applies to everything below: *a well-typed graph that nobody talks about is just a nicer-looking island.* The graph doesn't replace a single conversation. It makes conversations cheaper to start, and it keeps a record of the ones that ended in a decision.

## Transactive memory, briefly

Daniel Wegner's term for how a group remembers is *transactive memory*. It is often misremembered as "transactional". Nobody in a team holds everything. Everyone holds a map of who holds what, and asks. Each question does two jobs: it gets an answer, and it updates the map. You learn that Bogdan knows the idempotency layer because you asked him once.

AI erodes this quietly. A question you used to ask a colleague now goes to your agent. You still get an answer, but the map stops updating. Worse, what your agent learned in its session sits in a chat history nobody else will read. After a year the team no longer knows who knows what. Hopf and colleagues (*Journal of Information Technology*, 2025) found that people and agents *can* build a joint transactive memory, but only by design.

tg can hold that design. It cannot make anyone share. What it can do is turn "who knows what" and "who decided what" from folklore into typed edges that sit beside the decisions and code they point at. People and agents both read them, and `tg check` fails when they break.

## Three channels, and what each needs written down

The essay names three channels of interaction and one dependency between them: *channel 3 can only be as good as channel 1.*

| Channel | What crosses it | What the graph holds | Edges in this article |
|---|---|---|---|
| Human to human | trust, judgment, disagreement, "why" | who owns, who knows, who decided and in what role | `owns`, `knows_about`, `decided_by`, `member_of` |
| Human to agent | intent, context, review | whom an agent acts for and what it may touch; what it proposed; where it helped | `acts_for`, `proposed_by`, `assisted_by` (a property) |
| Agent to agent | specs, contracts, hand-offs | which document work passes through, and the decisions both agents read | `hands_off_to`, plus the code ontology's `implements`, `motivated_by` |

The order matters. Agents inherit only what people agreed and wrote down. If channel 1 never happened, channel 3 has nothing to share. So we start with people.

## Step 1: extend the ontology with a team layer

`tg init` installs a code ontology in `Types/code-types.md`: `Decision`, `Requirement`, `Scenario`, `Constraint`, `Concept` and `Change`, plus edges such as `implements` and `motivated_by`. It has no people in it, on purpose: who your team is and how it decides is yours to say. Add it as a second schema file, `Types/team-types.md`. Since tg 0.29.0 you don't have to type it: `tg gen team-types.md > Types/team-types.md` writes exactly this schema, with a short usage note.

```yaml
---
tgs: "0.6"
schemas:
  Person:
    description: "Someone on the team. A section per person, titled with the name people use; its first sentence gives their handle and role."
  Team:
    description: "A group that owns things together and answers for them as one; its first sentence says where to ask it."
  Agent:
    description: "A coding agent or automation that does work in this repository on someone's behalf; its first sentence names the product."
edgeTypes:
  member_of:
    description: A person belongs to a team.
    from: Person
    to: Team
    properties:
      since: {kind: text, description: Date they joined.}
  owns:
    description: Answers for this decision, requirement, term or code; the first person to ask, and the one who says yes to a change.
    from: [Person, Team]
    to: [Decision, Requirement, Concept, Constraint, CodeFile, CodeSymbol]
    properties:
      since: {kind: text, description: Date ownership started.}
  knows_about:
    description: Can explain this without looking it up. The who-knows-what map, kept beside what it points at.
    from: [Person, Agent]
    to: [Decision, Requirement, Concept, Constraint, CodeFile, CodeSymbol]
    properties:
      depth: {values: [expert, working, aware], description: How far you can rely on them.}
      since: {kind: text, description: Date from which it holds.}
  decided_by:
    description: Who made this decision, and in what role. An agent can propose; only people decide.
    from: Decision
    to: Person
    properties:
      role: {values: [driver, approver, consulted], description: "RACI-style part in the decision."}
      date: {kind: date, description: When they took that part.}
      assisted_by: {kind: text, description: "The agent that helped draft or analyse it, if any. Disclosure as data."}
  proposed_by:
    description: Who first wrote this down, a person or an agent.
    from: [Decision, Requirement, Change]
    to: [Person, Agent]
    properties:
      session: {kind: text, description: A link to the agent session or pull request where it started.}
  acts_for:
    description: An agent works on this person's or team's behalf and inherits their permissions and accountability.
    from: Agent
    to: [Person, Team]
    properties:
      scope: {kind: text, description: "What it may touch, such as a folder or a kind of task."}
      autonomy: {values: [suggest, ask-first, autonomous], description: How far it may act without the person.}
  hands_off_to:
    description: One agent passes work to another, through a document both can read.
    from: Agent
    to: Agent
    properties:
      via: {kind: text, description: The section or spec the work passes through.}
      when: {kind: text, description: The trigger for the hand-off.}
---
The team ontology: who is here, what each person and agent answers for or knows, and who decided what.
It extends the code ontology in `code-types.md`; it adds no types the code ontology already has.
```

The design choices are the useful part. Each one is a rule you can reuse:

- **Separate the layers.** People change faster than code types. Keeping them in their own file means a reorganization touches one file. It also means `tg upgrade`, which refreshes what `tg init` installed, never touches it. I checked: after adding this file and a custom skill, `tg upgrade --dry-run` reports nothing to change.
- **Point at the code ontology instead of copying it.** `owns` ends at `Decision`, `Requirement`, `CodeFile` and `CodeSymbol`, types that already exist. The team layer adds edges *into* the intent graph; it doesn't add a parallel vocabulary.
- **Put accountability in the endpoints.** `decided_by` runs from `Decision` to `Person` and nothing else. That one line is the rule "an agent can propose; only people decide", and `tg ontology check` enforces it (see below).
- **Put facts on edges, not on sections.** In a tg project a section node has a title, a summary (its leading paragraph), a file and lines, but no properties of its own. A frontmatter key such as `source:` doesn't reach the sections below it. So everything you want to query goes on an edge: `autonomy` sits on `acts_for`, `role` and `date` on `decided_by`. Contact details go in the first sentence, which queries return as `summary`. My first draft declared `handle` and `autonomy` as properties of `Person` and `Agent`. The check accepted that, and every query returned `null`.
- **Make disclosure a property, not a confession.** The essay's third habit is "make disclosure boring". `assisted_by` on `decided_by` turns "AI-assisted" into one more field on the edge, as routine as a date.
- **Separate owning from knowing.** `owns` names the one person who says yes to a change. `knows_about` with a `depth` is the transactive memory itself: many people, graded. Most teams mix the two up, and that's how "ask Alice" becomes the answer to everything.
- **Describe every name.** `tg ontology` prints each description, and the `tg-docs` skill tells agents to read it before writing. A description is the definition both people and agents get.

**Tip: quote descriptions that contain a comma.** In a `{…}` flow map, an unquoted value ends at the first comma. My first draft had `description: The chat or forge handle, so an agent can tell you who to message.` and `tg ontology` showed only "The chat or forge handle". Quote the value or move it to its own block. The schema above quotes every description that has a comma.

## Step 2: write the map

People, teams and agents are sections, like everything else in `lat.md/`. Give each file a type and every section below the title gets that label:

```markdown
---
type: Person
---
# People

The people on the payments team, with what they own and what they can explain without looking it up.

## Alice Moreau

@alice, tech lead for payments; owns the retry policy and the payment provider contract.

- member_of:: [[teams#Payments]] {since: "2024-03-01"}
- owns:: [[decisions#Retry a failed charge three times]] {since: "2026-02-10"}
- knows_about:: [[constraints#Provider rate limit]] {depth: expert}
- knows_about:: [[src/payments/retry.ts#chargeWithRetry]] {depth: expert}

## Bogdan Kovalenko

@bogdan, backend engineer; wrote the idempotency layer and is the person to ask about duplicate charges.

- member_of:: [[teams#Payments]] {since: "2025-09-15"}
- knows_about:: [[concepts#Idempotency key]] {depth: expert}
- knows_about:: [[decisions#Retry a failed charge three times]] {depth: working}
```

Agents get the same treatment, with whom they act for and how far they may go:

```markdown
---
type: Agent
---
# Agents

The coding agents that work in this repository, whom each acts for and how far it may go alone.

## Alice's Claude Code

Claude Code, working for Alice; drafts payment changes and decision records for her review.

- acts_for:: [[people#Alice Moreau]] {scope: "src/payments, lat.md/decisions.md", autonomy: ask-first}
- knows_about:: [[decisions#Retry a failed charge three times]] {depth: working}
- hands_off_to:: [[agents#Review bot]] {via: "the pull request description", when: "a change touches src/payments"}

## Review bot

A CI review agent; checks every payment pull request against the decisions it touches.

- acts_for:: [[teams#Payments]] {scope: "read only", autonomy: autonomous}
```

And a decision records who made it, in what role, with what help, and where it started:

```markdown
## Retry a failed charge three times

A charge that fails with a network or 5xx error is retried three times with backoff, then reported to checkout as failed.

- motivated_by:: [[constraints#Provider rate limit]] {weight: primary}
- motivated_by:: [[concepts#Idempotency key]] {weight: secondary}
- decided_by:: [[people#Alice Moreau]] {role: driver, date: 2026-02-10, assisted_by: "Claude Code"}
- decided_by:: [[people#Chen Wei]] {role: consulted, date: 2026-02-09}
- proposed_by:: [[agents#Alice's Claude Code]] {session: "PR #212"}

<option id="three" outcome="chosen">

Three retries plus the first attempt stays inside the provider's four attempts an hour.

</option>

<option id="five" outcome="rejected">

Five retries recovered slightly more charges in the load test but the fifth attempt trips the rate limit.

</option>
```

The code that realizes it points back with one comment:

```ts
// @tg: implements:: [[decisions#Retry a failed charge three times]] {since: "2026-02"}
export async function chargeWithRetry(charge: () => Promise<void>): Promise<void> { … }
```

This is the essay's opening question, *why does the payment service retry three times, and is three a requirement?*, answered in a place both a person and an agent will find it. Three is the limit of a constraint, which a named person decided on with a named colleague consulted, after rejecting five for a stated reason. The agent that drafted the record is on file, and so is the session where it started.

Some writing tips that save trouble later:

- **One person, one section, a name people actually use.** Links are `[[people#Alice Moreau]]`. If you rename the heading, `tg check` reports every link that broke. That's the point: the map can't drift silently.
- **Write `knows_about` from the person's side, and let them write it.** Self-reported knowledge is imperfect, but it's honest. A manager-written skills matrix is neither. A short `depth` scale (expert, working, aware) beats a 1-to-10 score nobody calibrates.
- **Put dates on edges, not in prose.** `since` and `date` are queryable, while "a while ago" isn't. Edges with dates are how you find stale knowledge later.
- **Record the consulted, not only the deciders.** `role: consulted` is how the product manager's input survives. It's also the cheapest way to show that a decision crossed an island.

## Step 3: ask the map

Everything above is now one graph that `tg cypher` can query. Agents get the same queries through the `tg_cypher` tool of `tg mcp`. These are real outputs from the example project.

**Who should I ask about the retry policy?** Owners first, then people who can explain it:

```
tg cypher 'MATCH (p:Person)-[r:owns|knows_about]->(d:Decision {title: "Retry a failed charge three times"})
           RETURN p.title AS ask, type(r) AS because, r.depth AS depth ORDER BY because DESC'

ask              | because     | depth
-----------------+-------------+--------
Alice Moreau     | owns        | null
Bogdan Kovalenko | knows_about | working
```

**Who decided, in what role, and with what help?**

```
tg cypher 'MATCH (d:Decision)-[r:decided_by]->(p:Person)
           RETURN d.title, p.title, r.role, r.date, r.assisted_by'

d.title                           | p.title      | r.role    | r.date     | r.assisted_by
----------------------------------+--------------+-----------+------------+--------------
Retry a failed charge three times | Alice Moreau | driver    | 2026-02-10 | Claude Code
Retry a failed charge three times | Chen Wei     | consulted | 2026-02-09 | null
```

**I'm about to change this function. Whom do I talk to?** This walks from code through the decision it implements to the person who owns it, the "collision check" from the essay as a query:

```
tg cypher --code annotated 'MATCH (c:CodeSymbol)-[:implements]->(d:Decision)<-[:owns]-(p:Person)
                            RETURN c.name AS code, d.title AS decision, p.title AS owner'

code            | decision                          | owner
----------------+-----------------------------------+-------------
chargeWithRetry | Retry a failed charge three times | Alice Moreau
```

**Where does only one person hold the knowledge?** This is the bus-factor view of transactive memory:

```
tg cypher 'MATCH (p:Person)-[:owns|knows_about]->(x)
           WITH x, count(DISTINCT p) AS people, collect(p.title) AS who WHERE people < 2
           RETURN x.title AS topic, who'

topic           | who
----------------+---------------------
chargeWithRetry | ["Alice Moreau"]
Idempotency key | ["Bogdan Kovalenko"]
```

Each row is a pairing waiting to happen. The essay's fifth habit is to pair across islands. This query tells you which pairs.

**What did an agent propose that no person has decided yet?**

```
tg cypher 'MATCH (d:Decision)-[:proposed_by]->(a:Agent)
           OPTIONAL MATCH (d)-[r:decided_by]->(p:Person)
           WITH d, a, count(p) AS deciders WHERE deciders = 0
           RETURN d.title AS waiting_for_a_person, a.title AS proposed_by'

waiting_for_a_person                  | proposed_by
--------------------------------------+--------------------
Cache provider tokens for ten minutes | Alice's Claude Code
```

This is the most important query in the article. An agent can write a perfectly reasonable decision record and open a pull request, and nobody has to agree to it before the code ships. This query shows that gap, and a context steward can run it every Monday.

**Which agents act for whom, and how far may they go?**

```
tg cypher 'MATCH (a:Agent)-[r:acts_for]->(x)
           RETURN a.title AS agent, x.title AS on_behalf_of, r.scope AS scope, r.autonomy AS autonomy'

agent               | on_behalf_of | scope                             | autonomy
--------------------+--------------+-----------------------------------+-----------
Alice's Claude Code | Alice Moreau | src/payments, lat.md/decisions.md | ask-first
Review bot          | Payments     | read only                         | autonomous
```

`tg refs` gives the reverse view for one person: every section that points at them. That's the starting list for a handover when someone moves teams:

```
tg refs "people#Alice Moreau"

* Section: [[lat.md/agents#Agents#Alice's Claude Code]] (wiki link)
* Section: [[lat.md/decisions#Decisions#Retry a failed charge three times]] (wiki link)
```

What she owns and knows sits on her own section's outgoing edges: `MATCH (p:Person {title: "Alice Moreau"})-[r]->(x) RETURN type(r), x.title`.

## The ontology is the guardrail

Writing the rules into the schema pays off the first time someone, or something, breaks them. Here is what `tg ontology check` said when an agent recorded itself as the decider:

```
- decided_by:: [[agents#Alice's Claude Code]] {role: driver}

$ tg ontology check
- lat.md/decisions.md:35: 'decided_by' ends at Person, not Agent

1 finding. Run tg ontology to see the declared types and edges.
```

And here is what it said about my own first draft, where the review bot acted for a team while `acts_for` was only declared for people:

```
- lat.md/agents.md:20: 'acts_for' ends at Person, not Team
```

I decided an agent may act for a team, and widened the endpoint to `[Person, Team]`. That's the right response to a finding: either the data is wrong or the rule is. Either way, the change goes through review as a diff to `Types/team-types.md`, where the team can argue about it.

**Tip: put `tg ontology check` in CI next to `tg check`.** The Stop hook that `tg init` installs for Claude Code blocks an agent from finishing in two cases: when `tg check` finds errors, or when code changed and `lat.md/` didn't. It doesn't run the ontology check. Two lines in CI close that gap for people and agents alike:

```yaml
- run: tg check
- run: tg ontology check
```

## Step 4: teach the agents, by updating the skills

An ontology tells an agent what the words mean. It doesn't tell the agent how to behave with them. That's the skills' job, and it's the half people forget.

The `tg-docs` skill that `tg init` installs already tells agents to read `tg ontology` once per session and to "prefer a fitting domain type over a generic one". So the moment `Types/team-types.md` exists, an agent writing docs knows `Person`, `decided_by` and `assisted_by`. What it doesn't know is the *routing* behavior the essay asks for: *ask humans "why", ask agents "how".* Since tg 0.29.0, `tg init` installs that behavior as the bundled `tg-team` skill, and `tg upgrade` adds it to projects set up earlier. Here is the core of it, as you'd write it for a project of your own:

```markdown
---
name: tg-team
description: Route questions to the people who own or know the answer, and record who decided what, using the team ontology in Types/team-types.md. Use when asked why something is the way it is, who owns or knows a piece of code or a decision, or when drafting a decision record.
---

# Team map

The team's who-knows-what map is in lat.md/people.md, teams.md and agents.md, typed by
Types/team-types.md. Read `tg ontology` for the edge meanings before using them.

## When someone asks "why"

1. Find the decision: `tg search`, then follow `implements` from the code if you started there.
2. Answer with what the decision says and its `motivated_by` reasons, quoted, not paraphrased.
3. Name who decided it and who knows it; their section's first sentence (`summary`) has their handle:
   MATCH (p:Person)-[r:owns|knows_about|decided_by]-(d:Decision {title: "<decision title>"})
   RETURN p.title, p.summary, type(r), r.role
4. If the record does not answer the question, say so and suggest asking the owner. Never invent a reason.

## When you are about to change code

Run the tg-impact skill first. For each decision or requirement the change touches, list its owner
and tell the user whom to talk to before the pull request, not after.

## When you draft a decision

- Write it with `status: proposed` and `proposed_by:: [[agents#<your agent section>]] {session: "<PR or session link>"}`.
- Never write `decided_by` for yourself; the ontology forbids it. Leave it for the person you act for.
- When the person accepts, they add `decided_by:: [[people#<name>]] {role: driver, date: <date>, assisted_by: "<agent>"}`.

## What you may touch

Read your own `acts_for` edge, its `scope` and its `autonomy`. Outside that scope, propose; do not edit.
With `ask-first`, ask before every write.
```

A few tips from writing skills like this:

- **Point the skill at queries, not at people's names.** Names change, and the query reads the current graph. A skill that says "ask Alice about payments" is stale the day Alice moves teams.
- **Keep the skill's rules and the ontology's rules the same rules.** "Never write `decided_by` for yourself" is in the skill *and* enforced by the `decided_by` endpoint. The skill explains it, and the schema enforces it. If they ever disagree, the check wins and the skill is the thing to fix.
- **Review skills like code.** The essay's third process change is "agent context as team property". A skill is a file in git. It gets a pull request, a reviewer and a `git blame` like any other file, and `tg upgrade` leaves your own skills and `Types/` files untouched.
- **Update the skill when you change the ontology, in the same pull request.** Adding an edge type without telling the agents how to use it gives you an edge nobody writes. Changing the skill without the schema gives you instructions the check rejects. Treat `Types/*.md` and `.claude/skills/*` as one change.

## Human to human: what the graph does for the conversation

Most of the essay's habits are about people talking. The graph supports them without replacing them:

- **Agree on intent before generating.** The essay's intent note maps onto a `Decision` with `status: proposed`. You write it, one colleague reads it in ten minutes, and the second `decided_by` line with `role: consulted` is the proof the conversation happened. The agent then starts from an agreed record instead of a private prompt.
- **The weekly agent retro, kept.** The retro asks for one win, one failure and one prompt or skill worth keeping. The skill worth keeping goes into `.claude/skills/`. A failure that revealed a wrong assumption becomes a `Decision` that `supersedes` the old one, or a `-contradicts` edge with a ticket and a deadline. The retro's output is a diff, so the next retro can read it.
- **The collision check.** The code-to-owner query above, run on the files in this week's pull requests, answers "whose work touches whose?" with names instead of guesses.
- **The context steward's monthly hour.** Run three queries: decisions an agent proposed that nobody decided, topics that only one person knows, and `knows_about` edges whose `since` is older than a year. Each row is a conversation to start, not a cell to fill in.
- **Measure shared-context vitality.** The essay suggests counting contributors to shared instructions and decision records each month. With everything in git that's one command: `git shortlog -sn --since="1 month ago" -- lat.md Types .claude/skills`. A falling count means the graph is turning back into an island.

## Human to agent: intent in, context out, review back

The second channel is the one that is "almost entirely private" today, sitting in individual chat histories. tg changes where it lives:

- **Context comes from the shared graph, not from your prompt.** The prompt hook that `tg init` installs runs `tg search` on every message and adds the matching sections. The person and the agent start from the same decisions, and the agent cites them rather than half-remembering a conversation.
- **The agent's work becomes visible by default.** `proposed_by` with a `session` link turns "work out loud with your agent", the second habit, into a field. The dead end the agent hit last week is one click away for the next person, instead of being lost in someone's history.
- **Disclosure is metadata.** `assisted_by` makes AI help visible without making it an event. The query that lists it is the same query that lists the human deciders, which is exactly how boring it should be.
- **Review is a conversation about intent.** Because the decision record is in the diff next to the code, the reviewer can ask "why?" about the decision instead of "what?" about the code, as the seventh habit asks. With `tg-impact`, the author's agent can list every decision a change touches before review begins.

## Agent to agent: the channel that barely exists

The essay says agent-to-agent interaction "barely exists yet" and inherits only what humans agreed and wrote down. The typed graph makes that literal. Two agents that never talk directly still read the same `Decision` and `Requirement` sections, so they start from the same agreed intent. They are the essay's two crews who "meet in the middle".

`hands_off_to` names a hand-off and, more usefully, its `via`: the document the work passes through. In the example, Alice's agent hands off to the review bot through the pull request description. The review bot then runs `tg-impact` on the diff, finds the decisions the change touches, and checks the change against them. Neither agent has to trust the other's memory. Both trust the graph, which `tg check` keeps honest.

Two rules keep this channel healthy:

- **An agent hands off through a document, never through a private context.** If the next agent needs to know it, it goes in a section with an edge. That's the only way the third channel stays as good as the first.
- **Delegation follows accountability.** Each agent has an `acts_for` edge, and a hand-off never widens its scope. When the review bot finds a problem in a decision, it doesn't fix the decision. It names the owner, because it acts for a team with `scope: "read only"`.

The next part of the series takes this further with Promise Theory as the vocabulary for what agents may promise each other. The graph above is where those promises will be written down.

## Tips and tricks, collected

1. **Say *transactive*, model it as `knows_about` with `depth`.** Keep it separate from `owns`.
2. **Put team types in their own `Types/` file.** `tg upgrade` will never touch it.
3. **Write accountability rules as edge endpoints**, such as `decided_by: Decision → Person`, so `tg ontology check` enforces them.
4. **Put facts on edges:** `role`, `date`, `since`, `assisted_by`, `scope`, `autonomy`, `via`. A section has no properties of its own. Its first sentence comes back as `summary`, so contact details go there.
5. **Quote any YAML description with a comma** in a `{…}` map.
6. **Run `tg ontology check` in CI.** The agent Stop hook runs `tg check` only.
7. **Ship a project skill with the ontology, and change both in the same pull request.**
8. **Write queries into skills, not names.**
9. **Keep three queries for the context steward:** undecided agent proposals, single-holder topics, stale `knows_about`.
10. **Use `tg refs` on a person** to start a handover, and outgoing edges for what they own.
11. **Follow `implements` back to owners before a change** (`tg cypher --code annotated`), and talk to them first.
12. **Measure contributors to `lat.md`, `Types` and skills** with `git shortlog` each month.

## What it does not do

- **It doesn't create the will to share.** The essay is right that the bridges are habits. A team that never talks will produce a tidy, accurate, ignored graph.
- **It isn't an org chart or an HR system.** Keep only what helps route work: names people use, handles, roles in their own words. Leave out anything personal that the work doesn't need. The files are in git and everyone with the repository can read them.
- **`knows_about` goes stale.** People forget and move on. Dates on edges and a monthly look at the old ones are the fix, not a bigger schema.
- **It doesn't decide.** The graph records who decided. Nothing in tg chooses for you, and the ontology above makes sure an agent can't record itself as having chosen.

## Try it

```
npm install -g @typedgraph/cli
tg init                        # code ontology, agent instructions, hooks, skills (tg-team among them)
tg gen team-types.md > Types/team-types.md
# add lat.md/people.md, teams.md, agents.md as above, or ask your agent: the tg-team skill knows how
tg check && tg ontology check  # links resolve, edges fit the ontology
tg cypher 'MATCH (p:Person)-[:owns|knows_about]->(x) RETURN p.title, collect(x.title)'
```

Then do the part no tool does: pick one habit from the essay, run the "waiting for a person" query at your next retro, and talk about each row.

*Typed Graph is an open-source Obsidian plugin and CLI that turns Markdown notes and code annotations into a typed, queryable graph. The examples in this article were run with tg 0.28.1.*
