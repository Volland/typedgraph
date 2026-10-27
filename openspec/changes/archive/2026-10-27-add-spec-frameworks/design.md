## Context

`SpecIndex` in `packages/core/src/openspec/index.ts` parses OpenSpec files and resolves `openspec:` ids. `traceRequirements`, `buildLatGraph`, `checkLattice` and the CLI's `trace`, `graph`, `edges`, `check`, `hook` and `migrate` commands consume it through `isSpecTarget` and `resolve`. `tg init` (`packages/cli/src/commands/init.mts`) plans every file before writing. It patches OpenSpec's skills and commands between `<!-- tg:begin -->` markers and adds `tg:` rules to `openspec/config.yaml`. Its terminal wizard is a sequence of checklists (`Io.choose`) and single choices (`Io.select`) that only exist when a person is at a terminal. Schema notes in `Types/` compose, but a type or edge type declared twice is a `duplicate-declaration`. A graph node can carry several labels (`type: [A, B]`), and an edge is allowed when any label is in its endpoint list.

## Goals / Non-Goals

**Goals:**
- One index and one trace for every framework a project uses, OpenSpec and ADRs side by side.
- A setup wizard that picks, installs and wires a framework without leaving the terminal, and never runs a tool silently in a script.
- Ontology types that match each framework's vocabulary, without breaking the code ontology every project shares.

**Non-Goals:**
- Writing specs: the frameworks' own skills do that.
- Parsing tasks files (`tasks.md`, `_Requirements: 1.1_`) into graph edges. This is a later refinement.
- Frameworks without stable requirement ids (Agent OS, Superpowers).
- Re-implementing installers: tg runs the frameworks' own.

## Decisions

### 1. A scheme per framework, resolved by one index

Ids are `<framework>:<group>#<requirement>[#<scenario>]`, or `adr:<record>` for flat records. One `SpecIndex` holds all of them, keyed by scheme. A target without a scheme stays OpenSpec, so existing `openspec:` frontmatter and annotations are unchanged.

- Alternative rejected: map every framework onto `openspec:` ids. Groups would collide (a Spec Kit feature `auth` beside an OpenSpec capability `auth`), and the id would no longer say which file to open.
- Motivated by: the lat.md compatibility constraint ([[cli#Requirement trace]]). A scheme prefix keeps these ids out of lat.md id space, as `openspec:` already does.

### 2. Each framework's own stable ids, plus aliases

Ids are the ones each framework already writes:
- Spec Kit: `FR-001` and `US1`.
- Kiro: `Requirement 1` and the `N.M` numbers its tasks cite.
- BMAD: `FR-1` and `Story 1.2`.
- GSD: `AUTH-01`.
- ADRs: the record number.

Titles and bare numbers resolve as aliases.

- Alternative rejected: titles as primary ids. Spec Kit and Kiro renumber less often than people retitle.
- Motivated by: the existing rule that a rename breaks every link ([[openspec:tg-trace#Requirement ids]]).

### 3. A base label plus a framework label

Every spec node keeps `Requirement`, `Scenario` or `Decision`, and adds a framework label (`UserStory`, `AcceptanceCriterion`, `ADR`, ...).

- Alternative rejected: framework labels only. That would need `implements` and `verifies` widened in every project's `Types/code-types.md`, which the project owns and tg never rewrites.
- Motivated by: the composition rule for schema notes (no duplicate declarations) and the code ontology's endpoint lists.

### 4. One composed, tg-owned `Types/spec-types.md`

Fragments per framework are merged into a single note: a type is declared once, and an edge's endpoints are unioned. tg rewrites the note on every init.

- Alternative rejected: one note per framework. `Feature`, `FunctionalRequirement`, `AcceptanceCriterion` and `part_of` would be declared twice and clash when two frameworks are chosen.
- Alternative rejected: project-owned like `code-types.md`. Adding a framework later would never bring its types.

### 5. Installers run only with consent

- **Interactive runs:** a single choice per missing framework. The options are: the installed tool, a one-off `npx` or `uvx` run, a global install first, or skip. Every option shows its exact command.
- **Scripts:** run the first option only with `--install-spec`.
- **Dry runs:** print the commands.

Installers run before planning, so the skills they write exist when tg patches them. `Io.exec` is injected, so tests never spawn processes.

- Alternative rejected: always print commands and never run them. The person asked for the wizard to install tools when needed.
- Motivated by: the safe-init constraint ([[openspec:tg-agent-integration#Safe init]]). Scripts never change more than they asked for.

### 6. Patch what exists, whatever was ticked

A framework's skill or command file in a selected agent's folders gets its stage block whether or not the framework was ticked. The file's presence proves the framework is in use, and this matches how OpenSpec patching already works ([[openspec:tg-agent-integration#OpenSpec skill patching]]).

### 7. Recommend from the project

When no framework is found, the wizard recommends one:
- A project with ten or more source files gets OpenSpec, whose change deltas fit brownfield work.
- Otherwise it gets Spec Kit, whose feature specs, plans and tasks fit greenfield work.

The reason is shown next to the recommendation.

## Constraints

- **lat.md parity:** `tg check` must keep agreeing with `lat check` on lat.md content. New schemes and the `specs:` key are invisible to lat, which ignores `@tg:` and unknown frontmatter keys. Constrains [[openspec:spec-frameworks#Framework ids]].
- **No silent writes or runs:** `--dry-run` writes and runs nothing, and a non-interactive run never prompts. Constrains [[openspec:spec-frameworks#Framework install]].
- **Text outside tg's markers is never changed:** this binds every patched framework file. Constrains [[openspec:spec-frameworks#Framework skill patching]].

## Risks / Trade-offs

- **[Upstream formats drift]:** each reader is small and tolerant (optional titles, case-insensitive EARS, v4 and v6 BMAD file names). Unknown lines are skipped, never errors.
- **[Unverified skill names for BMAD and GSD]:** a missing file is simply not patched, so a wrong name costs nothing.
- **[`specs/` used for something else]:** Spec Kit files are read only when `.specify/` exists.
- **[A global install changes the machine]:** it is offered only in the interactive wizard, with its command shown.
