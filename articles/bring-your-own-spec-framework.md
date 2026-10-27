# Bring your own spec framework

*`tg` used to trace only OpenSpec requirements to code. It now reads Spec Kit, Kiro-style specs, BMAD, Get Shit Done and architecture decision records too. `tg init` asks which one you use, installs it if you have none, and teaches your coding agent the ids. One trace covers all of them.*

---

## Everyone writes specs now, just not the same way

Spec-driven development won. Teams that build with coding agents write the requirement first and let the agent implement it. But there is no single format for that requirement. Approximate GitHub star counts in October 2026 give a sense of scale:

- **GitHub Spec Kit** (about 143k stars) puts each feature in `specs/001-checkout/spec.md`. A spec has user stories with priorities, numbered acceptance scenarios, and requirement ids like `FR-001`.
- **OpenSpec** (about 73k) keeps one spec per capability and proposes changes as deltas against it.
- **Get Shit Done** (about 64k) keeps a `REQUIREMENTS.md` with ids like `AUTH-01`.
- **BMAD** (about 55k) has agent personas write a PRD with `FR-1` items, then story files with acceptance criteria.
- **Kiro's format**, shared by the Kiro IDE, cc-sdd and spec-workflow-mcp, writes acceptance criteria in EARS: `WHEN … THEN the system SHALL …`.

**Architecture decision records** sit beside all of them. ADRs are older than any of these tools and are still the best place to say *why*.

Until this release, the [Typed Graph](https://typedgraph.org) CLI understood exactly one of these. An [earlier article](specs-that-know-their-code.md) showed how `tg` gives every OpenSpec requirement an id, so code can say `implements` and tests can say `verifies`. If your team used Spec Kit, none of that applied to you.

## One trace, six frameworks

Each framework now has its own id scheme. The ids are the ones the framework already writes, so nobody has to rename anything:

| Framework | Requirement | Scenario or criterion |
|---|---|---|
| OpenSpec | `openspec:auth#Login` | `openspec:auth#Login#Valid password` |
| Spec Kit | `speckit:001-checkout#FR-001`, `#US1` | `speckit:001-checkout#US1#Scenario 2` |
| Kiro, cc-sdd, spec-workflow-mcp | `kiro:reports#Requirement 2` | `kiro:reports#Requirement 2#2.1` |
| BMAD | `bmad:prd#FR-1`, `bmad:epic-1#Story 1.2` | `bmad:epic-1#Story 1.2#AC1` |
| Get Shit Done | `gsd:requirements#AUTH-01` | none |
| ADRs (MADR, Nygard, log4brains) | `adr:0003` | none |

The scheme prefix keeps these ids apart, both from each other and from your `lat.md` sections. That is why `tg check` still agrees with lat.md's own check.

Aliases resolve too:
- `speckit:checkout#FR-001` finds the folder `001-checkout`.
- A user story's title finds the story.
- `kiro:reports#2#1` finds criterion `2.1`.
- `adr:3` finds `0003-use-postgres.md`.

They work everywhere `openspec:` ids already did: in `@tg:` comments, in typed edges in your docs, and in `tg check`, `tg trace`, `tg edges` and `tg cypher`.

## The setup asks which one you use

`tg init` is the setup wizard. It now has a step for spec frameworks.

- **Detects:** it looks for the folders each tool creates: `.specify/`, `openspec/`, `.kiro/`, `_bmad/`, `.planning/` and the usual ADR folders. Every framework it finds is ticked and marked *found*.
- **Recommends:** if it finds none, it looks at the project and ticks one, with the reason shown. A project with existing code gets OpenSpec, because change proposals with deltas suit an evolving codebase. A nearly empty one gets Spec Kit, whose feature specs, plans and task lists suit a new project. You can untick it, tick another, or tick ADRs as well.
- **Installs:** for each framework you tick that is not set up yet, it offers to run that framework's own installer. There are up to three ways, and each one shows its exact command:
  - use the tool already on your PATH, for example `specify init --here --force --integration claude`;
  - run it once with `npx` or `uvx`, without installing anything;
  - install the tool first, for example with `uv tool install specify-cli`.

  You can always skip and get the command printed instead.

Scripts never get a surprise. Without a terminal, `tg init` uses `--spec` (for example `--spec speckit,adr`, or `--spec none`). It runs an installer only when you pass `--install-spec`, and `--dry-run` prints the commands without running them.

ADRs need no tool. When you tick them, `tg init` writes `docs/adr/0001-record-architecture-decisions.md` and a MADR template itself.

Here is what happened in a new, empty project with Spec Kit and ADRs ticked:

```
$ tg init --agent claude --spec speckit,adr --install-spec
  + created lat.md/lat.md
  + created lat.md/code-ontology.md
  + created Types/code-types.md
  + created Types/spec-types.md
  ~ updated CLAUDE.md
  + created .claude/settings.json
  + created .mcp.json
  ~ updated .claude/skills/speckit-specify/SKILL.md
  ~ updated .claude/skills/speckit-clarify/SKILL.md
  ~ updated .claude/skills/speckit-plan/SKILL.md
  ~ updated .claude/skills/speckit-tasks/SKILL.md
  ~ updated .claude/skills/speckit-implement/SKILL.md
  + created docs/adr/0001-record-architecture-decisions.md
  + created docs/adr/template.md
Wrote 26 files.
```

(I left out the six tg skills and the template notes.)

The `updated` lines are the interesting ones. Spec Kit's installer ran first and wrote its own skills and its own `CLAUDE.md`. `tg init` then appended a short tg section to each skill that drives a stage of the work. Your text outside that section is never touched. Each section fits its stage:
- The **specify** skill now says to keep requirement ids stable.
- The **tasks** skill adds a task to annotate each requirement's code and each scenario's test.
- The **implement** skill says to put `implements:: [[speckit:<feature>#FR-001]]` above the function it writes.

OpenSpec, cc-sdd, BMAD and GSD skills get the same kind of section, written with their own ids.

## What the trace shows

I added a checkout spec with two user stories, three functional requirements and one success criterion. I also added a decision record: charge every order through an idempotency key. Then I wrote two functions and two tests, annotated like this:

```ts
// @tg: implements:: [[speckit:checkout#FR-001]], implements:: [[adr:2]]
export function pay(orderId: string, card: string) {

// @tg: implements:: [[speckit:checkout#US1]] {confidence: partial}
export function checkout(cart: string[], card: string) {
```

```ts
// @tg: verifies:: [[speckit:checkout#US1#1]] {level: integration}
it('creates an order for a valid card', () => {});
```

`tg trace` lists both frameworks in one report:

```
adr  2 req · 1 implemented · 2 verified · 0 documented
  ✗ 0001 Record architecture decisions  — unimplemented, undocumented
  ✓ 0002 Charge through an idempotency key  — undocumented
      implements  src/checkout.ts#pay:1

speckit:001-checkout  6 req · 2 implemented · 1 verified · 0 documented
  ✗ US1 Pay for a cart  — unverified, undocumented
      implements  src/checkout.ts#checkout:6
      ✓ scenario  Scenario 1  test/checkout.test.ts:1 "creates an order for a valid card"
      ✗ scenario  Scenario 2
  ✗ US2 Apply a coupon  — unimplemented, unverified, undocumented
      ✗ scenario  Scenario 1
  ✗ FR-001  — unverified, undocumented
      implements  src/checkout.ts#pay:1
  ✗ FR-002  — unimplemented, undocumented
      verifies    test/checkout.test.ts:4 "keeps the cart when the card is declined"
  ✗ FR-003  — unimplemented, unverified, undocumented
  ✗ SC-001  — unimplemented, unverified, undocumented

8 requirements: 3 implemented, 3 verified, 0 documented
```

Three details are worth a closer look:

- **Decisions don't need tests.** A decision record is never reported as unverified. Its question is whether code follows it.
- **Retired records are not gaps.** An ADR marked superseded, deprecated or rejected stays in the list but never counts as a gap, so `tg trace --strict` in CI does not nag about decisions you replaced on purpose. A record that says `Supersedes [2. Use Postgres](0002-use-postgres.md)` becomes a `supersedes` edge in the graph.
- **Typos fail with a suggestion.** I wrote `FR-01` on purpose:

```
- src/checkout.ts:11: @tg: [[speckit:checkout#FR-01]] — no requirement "FR-01" in Spec Kit "001-checkout" — did you mean '[[speckit:001-checkout#FR-001]]'?
```

## Two labels on every requirement

Every project that `tg init` sets up gets a small *code ontology*: a list of the types of things in the graph and the links allowed between them. In it, `implements` links code to a `Requirement` or a `Decision`, and `verifies` links a test to a `Requirement` or a `Scenario`. Each project owns that file and can edit it, so a new framework must not need a change to it. But a user story is not just any requirement. It has a priority, a title and acceptance scenarios, and you want to ask questions about exactly those.

So every node `tg` reads from a spec file carries two labels:
- the base label the code ontology already allows: `Requirement`, `Scenario` or `Decision`;
- the label of its own framework: `UserStory`, `FunctionalRequirement`, `SuccessCriterion`, `AcceptanceCriterion`, `Story` or `ADR`.

`implements` works unchanged, and Cypher queries can be as specific as you like:

```
$ tg cypher "MATCH (s:Scenario)<-[:contains]-(u:UserStory {priority: 'P1'})
             OPTIONAL MATCH (t)-[:verifies]->(s)
             RETURN s.scenario, s.text, count(t) AS tests"
s.scenario                          | s.text                                                                                     | tests
------------------------------------+--------------------------------------------------------------------------------------------+------
speckit:001-checkout#US1#Scenario 1 | Given a cart with items, When the shopper pays with a valid card, Then an order is created | 1
speckit:001-checkout#US1#Scenario 2 | Given a declined card, When the shopper pays, Then the cart is kept and an error is shown  | 0
```

That is every P1 acceptance scenario and how many tests prove it, in one query. Spec Kit marks open questions with `[NEEDS CLARIFICATION]`, and those become a property too:

```
$ tg cypher "MATCH (r:FunctionalRequirement) WHERE r.clarification = 'needed' RETURN r.requirement, r.text"
r.requirement               | r.text
----------------------------+----------------------------------------------------------------------------
speckit:001-checkout#FR-003 | System MUST reject expired coupons via [NEEDS CLARIFICATION: grace period?]
```

An agent that runs this before implementing knows to ask first.

Kiro criteria carry their EARS pattern, so `MATCH (c:AcceptanceCriterion {ears: "unwanted"})` lists every `IF … THEN` error path, which are exactly the cases people forget to test. ADRs carry their status and date, so `MATCH (c:CodeSymbol)-[:implements]->(d:ADR)` shows which code depends on which decision.

The framework labels are declared in `Types/spec-types.md`. `tg init` writes that file with only the frameworks you chose, and merges what they share: Spec Kit and Kiro both have a `Feature`, which is declared once. `tg init` owns this file and rewrites it on every run. Your own vocabulary stays in `Types/code-types.md`, which `tg` never overwrites.

## The skills follow the frameworks

The `tg-trace` skill that `tg init` installs used to be an OpenSpec manual. Now it is written for the frameworks you picked. A Spec Kit project's skill explains `FR-` ids, user stories and `[NEEDS CLARIFICATION]`. It says nothing about Kiro criteria, because that project has none.

The same goes for:
- the instruction block in `CLAUDE.md` or `AGENTS.md` and the Cursor rules;
- the `tg-audit` skill, which now tells an agent how to fix a stale spec the way that framework does it: an OpenSpec change, an edited Spec Kit spec, or a new ADR that supersedes the old one.

## What it does not do

`tg` does not write your specs. The framework's own skills do that, and `tg` only adds the steps that keep them traceable.

Two things are not done yet:
- **Task lists are not read.** Spec Kit's `T012 [US1]` lines and Kiro's `_Requirements: 1.1_` are not graph edges yet. Agents read them, but `tg` doesn't.
- **Some BMAD and GSD skill names are unconfirmed.** If a name is wrong, that skill is simply not patched; nothing breaks.

If your team uses a format that is not on the list, the [spec frameworks page](spec-frameworks.html) explains how a new one is added.

## Try it

```
npm i -g @typedgraph/cli
tg init
```

In a terminal, `tg init` asks which framework you use. In CI, use `tg init --spec <framework>`.

*All output in this article comes from a real run of the built CLI on a new project, with Spec Kit 1.x installed by `tg init`. Star counts are approximate, taken from GitHub in October 2026.*
