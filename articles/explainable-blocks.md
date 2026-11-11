# Explainable blocks: an ontology for the inside of your documents

*Until now, `tg` stopped at the heading. Typed Graph 0.26 lets a type say what goes inside its sections: XML blocks such as `<option>`, `<rule>` or `<rollback>`, each with a description an agent can read before writing one. Blocks you give an id become graph nodes that code can point at. The rest stays prose, and `tg` checks it all.*

---

## The graph stopped at the section

[Typed Graph](https://typedgraph.org) keeps a project's intent in small Markdown files with types: a `Decision` here, a `Requirement` there. Typed edges join them, as in `motivated_by:: [[constraints#Session limit]]`. `tg` turns all of it into a graph you can check and query. The smallest node in that graph used to be a section.

A section is often too coarse. Take a decision. It records what was chosen, but also the options weighed and the consequences accepted. A rejected option is the part people ask about a year later ("why not Redis?"). A requirement often bundles several rules that different functions implement. A runbook needs a rollback, and when it is missing someone finds out at 3 a.m.

Writers already mark these parts. Prompt files, Claude skills and agent instructions are full of `<example>`, `<constraint>` and `<when_to_use>` tags. Anthropic recommends XML tags for separating the parts of a prompt, and our [research long read](one-file-or-a-graph.md) sums up the mixed evidence on formats. But nothing says what a tag means. To the next writer, human or agent, `<consequence>` is a guess, and no tool can check, link or query what is inside it.

Version 0.26 closes that gap in three steps. The ontology explains itself, types declare the blocks their sections hold, and blocks you name become part of the graph.

## Step one: the ontology explains itself

Every type, property, edge and edge type in a schema note can now carry a `description`. This is part of version 0.4 of the Typed Graph Schema specification (TGS), which also adds the `elements` and `sections` keys used below. The bundled code ontology that `tg init` installs describes every name it declares. Here is what `tg ontology` prints for `Decision` in a fresh project:

```
  Decision  (Types/code-types.md)
    A choice that was made, with its reason and the alternatives rejected. An ADR is one.
    properties:
      status (text, proposed|accepted|superseded|rejected, default proposed) — Where the decision is in its life.
      date (date) — When it was decided.
      owner (text) — Who answers for it.
    edges: supersedes → Decision; contradicts → Decision|Requirement|Constraint; motivated_by → Constraint|Concept|Decision; changed_by → Change
    elements:
      <option> — An alternative that was considered, and why it won or lost. Give it an id when code or a later decision must point at it.
        attributes:
          id (text) — Stable address, unique in the file, linked as file#^id.
          outcome (text, chosen|rejected|deferred) — What happened to this option.
      <consequence> — What becomes easier, harder or riskier because of the decision.
        attributes:
          kind (text, good|bad|risk)
```

The listing keeps the shape of the YAML it comes from: each element, then its attributes, shown the way properties are shown. That listing is what a coding agent reads before it writes. The agent instructions and the `tg-docs` skill that `tg init` installs tell it to run `tg ontology` first. An agent no longer has to infer what `refines` means from its name or guess which attributes `<option>` takes: the ontology says so in plain words. The SHACL export writes the same text as `sh:description`, so RDF tools see it too.

## Step two: blocks inside a section

The `elements` key of a type declares the XML tags its sections may hold. A Decision section can now look like this:

```markdown
## Short-lived access tokens

Access tokens expire after 15 minutes and refresh tokens rotate on every use.

<option id="redis-sessions" outcome="rejected">

Keep server sessions in Redis: simple revocation, but one more stateful service to run and fail over.

- motivated_by:: [[constraints#Session limit]]

</option>

<option id="jwt-rotation" outcome="chosen">

Stateless JWTs with rotating refresh tokens and a small revocation list.

</option>

<consequence kind="risk">

A stolen refresh token works until its next rotation.

</consequence>
```

Two details matter. The tags sit on their own lines with blank lines inside, so every Markdown reader still renders the text and `tg check` still reads the links in it. And the typed edge inside the first option belongs to that option, not to the whole section. The session limit was the reason Redis lost, not the reason for the decision. The graph says exactly that:

```
$ tg cypher 'MATCH (o:Element)-[r:motivated_by]->(c) RETURN o.element, type(r), c.title'
o.element                        | type(r)      | c.title
---------------------------------+--------------+--------------
lat.md/decisions#^redis-sessions | motivated_by | Session limit
```

Every option the project ever weighed is now one query away, including the options in its architecture decision records:

```
$ tg cypher 'MATCH (d:Decision)-[:contains]->(o:Element {tag: "option"}) RETURN d.title, o.element, o.outcome'
d.title                         | o.element                        | o.outcome
--------------------------------+----------------------------------+----------
Short-lived access tokens       | lat.md/decisions#^redis-sessions | rejected
Short-lived access tokens       | lat.md/decisions#^jwt-rotation   | chosen
Use Postgres for sessions audit | adr:0002#^postgres               | chosen
Use Postgres for sessions audit | adr:0002#^kafka                  | rejected
```

## Step three: an id is an address

An element with an `id` can be linked as `file#^id`. That is the form Obsidian uses for block references, and it keeps working when you move the block to another section. Code points at it like any other target:

```ts
// @tg: implements:: [[decisions#^jwt-rotation]]
export function rotateRefreshToken(old: string): string {
  return old;
}

// @tg: implements:: [[adr:2#^postgres]]
export function auditRotation(id: string): void {}
```

The second annotation points into an ADR, `docs/adr/0002-use-postgres.md`. Elements in spec files work the same way: `[[adr:3#^redis]]` and `[[openspec:auth#^lockout]]` resolve, with any alias of the record or group. Now the question "which code realizes the option we chose?" has an answer:

```
$ tg cypher 'MATCH (c:CodeSymbol)-[:implements]->(o:Element) RETURN c.symbol, o.element, o.outcome'
c.symbol           | o.element                      | o.outcome
-------------------+--------------------------------+----------
rotateRefreshToken | lat.md/decisions#^jwt-rotation | chosen
auditRotation      | adr:0002#^postgres             | chosen
```

`tg check` resolves these links, so a typo fails the build and gets a suggestion:

```
- src/tokens.ts:1: @tg: [[decisions#^jwt-rotaton]] — no element with that id — did you mean '[[lat.md/decisions#^jwt-rotation]]'?
```

## The balance rule: an id or a type makes a node

A graph with a node for every paragraph is as unreadable as no graph at all. So `tg` follows one rule. **An element becomes a node only when it has an `id`, or when the ontology gives its tag a `type`.** An id means the author wants to point at it. A type means the block is an ontology thing in its own right. Everything else stays text in its section. It is still described and checked, but it adds nothing to the graph.

The `<consequence>` above has no id and no type, so it is not a node. Undeclared tags like `<details>` are just HTML. The code ontology guide that `tg init` installs gives the rule as a table, and the `tg-docs` skill teaches it to agents:

| The part | Write it as |
| --- | --- |
| nothing points at it and nobody checks it | prose |
| it lives only inside its section, but something links to it, queries it or checks it | an element, with an `id` if it is linked |
| readers navigate to it | a heading |
| it has a life of its own: edges from several places, its own status, several paragraphs | a separate typed section |

The bundled ontology uses `type` exactly once, on purpose. A Requirement's `<rule>` is itself a `Requirement`, so a long requirement can be implemented and tested one rule at a time:

```markdown
## Password policy

Passwords are checked when they are set or changed.

<rule id="min-length" strength="must">

At least 12 characters.

</rule>

<rule id="breached" strength="must">

Not in the breached-password list.

</rule>
```

With one function annotated `implements:: [[requirements#^min-length]]`, the gap shows up at once:

```
$ tg cypher 'MATCH (r:Requirement:Element) OPTIONAL MATCH (c)-[i:implements]->(r) RETURN r.element, r.strength, count(i) AS implemented'
r.element                       | r.strength | implemented
--------------------------------+------------+------------
lat.md/requirements#^min-length | must       | 1
lat.md/requirements#^breached   | must       | 0
```

The other blocks in the bundled ontology are text with a meaning: `<example>` with `<input>` and `<output>`, `<non-goal>`, Scenario's `<given>`, `<when>` and `<then>`, Constraint's `<exception>`, and Concept's `<example>` and `<counterexample>`. None of them is required, so existing docs stay clean.

## Your own document types, checked

The bundled vocabulary is a start. The same keys describe any kind of document your team writes. A runbook type, in a schema note at `Types/Runbook.md`:

```yaml
tgs: "0.5"
schema:
  description: How to operate one part of the system when something goes wrong.
  sections:
    Symptoms: {required: true, description: What an on-call engineer sees first.}
  elements:
    step:
      description: One action, in order, that an engineer or an agent can run.
      attributes:
        risk: {values: [safe, disruptive], required: true}
    rollback:
      description: How to undo the steps if they make things worse.
      required: true
      many: false
```

`tg ontology` turns it into a writing guide:

```
  Runbook  (Types/Runbook.md)
    How to operate one part of the system when something goes wrong.
    sections:
      ## Symptoms  (required) — What an on-call engineer sees first.
    elements:
      <step> — One action, in order, that an engineer or an agent can run.
        attributes:
          risk (text, safe|disruptive, required)
      <rollback>  (exactly one) — How to undo the steps if they make things worse.
```

And `tg ontology check` holds every runbook to it. Here is a runbook with a symptoms section and two steps, but no rollback and one step without a risk:

```
- lat.md/runbooks.md:8: 'Token service down' (Runbook) has no <rollback>: How to undo the steps if they make things worse.
- lat.md/runbooks.md:22: <step> needs the attribute 'risk'

2 findings. Run tg ontology to see the declared types and edges.
```

The finding repeats the description, so whoever fixes it, human or agent, learns what the missing block is for. The same checks run in `tg validate` and in the Obsidian plugin's diagnostics, where each typed note is one document. They report:

- required blocks and headings that are missing
- a single-use block that appears twice
- attribute values outside the declared ones
- a declared tag that is never closed

Elements nest, attributes have a small fixed set of keys, and every shorthand has one meaning. [Declaring document elements](declaring-document-elements.md) is the guide to writing them, with the scope rules of TGS 0.5.

The descriptions also matter for retrieval. When an agent pulls one block out of a long file, `<rollback>` arrives with its meaning attached.

## ADRs and specs get the same treatment

`tg init --spec adr` now writes an ADR template whose considered options are `<option>` blocks and whose consequences are `<consequence>` blocks. The ADR type declares MADR's headings with descriptions. An ADR is also a Decision, so it inherits Decision's blocks. The spec authoring guidance that `tg init` adds to OpenSpec, Spec Kit, Kiro, BMAD and GSD skills tells agents to mark a rule with an id only when code or a test will point at it.

## Upgrading a project set up earlier

A project set up with an older `tg` has older skills and an ontology without any of this. Version 0.26 adds `tg upgrade`. It works out what `tg init` set up earlier, then refreshes those files and nothing else. In a terminal it first offers a newer `tg` if npm has one. Here it is on a project with an outdated skill, a deleted skill and a pre-0.4 ontology:

```
$ tg upgrade --yes
tg 0.26.0 has newer files for aged (instructions, hooks, skills, ontology; Claude Code):
  ~ updated .claude/skills/tg-docs/SKILL.md
  + new     .claude/skills/tg-graph/SKILL.md
  ~ updated Types/code-types.md
  Types/code-types.md gains 41 descriptions or declarations; nothing in it is overwritten.
Wrote 3 files. Run tg check and tg ontology check.
```

`Types/code-types.md` belongs to you, so `tg upgrade` never replaces it. Declarations it shares with the new ontology gain only the descriptions, elements and sections they lack. Your own values, comments and types stay, and a type you deleted does not come back.

## What it is not

- **Not a full XML parser.** Blocks start at the beginning of a line and end at the end of one. Inline tags are text, and text that is not attribute syntax, like `<insert a summary here>`, is not a tag.
- **No content models.** `required`, `many` and nesting are the whole grammar, with no ordering rules. That is deliberate: DTD-style schemas are why DocBook and DITA feel heavy.
- **Not in the editor graphs yet.** The Obsidian plugin and the VS Code extension read the new keys and report the findings, but still draw one node per note. Element nodes live in the `tg` graph that `tg cypher`, `tg ontology check` and the MCP tools query.
- **Not known to lat.md.** `lat check` does not understand `#^` links, so projects that use them differ from it on those links only.

## Try it

```sh
npm install -g @typedgraph/cli
tg init            # or: tg upgrade, in a project set up earlier
tg ontology        # read what every type, edge and block means
```

Then mark one rejected option in a decision you still get asked about, give it an id, and point at it from the code that made it lose. The spec is [Typed Graph Schema 0.4](https://typedgraph.org/spec/tgs/v0.4/), and the [docs](https://typedgraph.org/docs.html) cover the rest.

---

*Every command output above comes from a real run of tg 0.26.0 on a fresh project, set up with `tg init --yes --spec adr`, on 11 November 2026. The two `tg ontology` listings were run again with tg 0.27.0, which implements TGS 0.5, which shows elements in the shape of their YAML. 0.26.0 squeezed attributes into the tag, as `<step risk=safe|disruptive!>`.*
