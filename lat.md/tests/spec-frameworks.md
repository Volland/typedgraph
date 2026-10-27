---
type: Scenario
lat:
  require-code-mention: true
---
# Spec Frameworks Tests

Test specifications for reading, choosing, installing and wiring spec frameworks other than OpenSpec. See [[cli#Spec frameworks]].

## Spec Kit reader

How `specs/<feature>/spec.md` becomes requirements.

### Stories, scenarios and requirements

User stories become `USN` requirements with priority, title and numbered acceptance scenarios; `FR-`, `SC-` items become requirements with their labels, and `NEEDS CLARIFICATION` is flagged.

### Short feature name

`speckit:auth#FR-001` resolves in the folder `specs/001-auth/`.

## Kiro reader

How Kiro, cc-sdd and spec-workflow-mcp `requirements.md` files become requirements.

### Criteria numbered as tasks cite them

Acceptance criteria are scenarios `N.M`, labelled `AcceptanceCriterion` with their EARS pattern, and resolve by bare number too.

### cc-sdd format

An `**Objective:**` line is the requirement text and lowercase `When ..., the ... shall` criteria are event-driven.

## BMAD reader

How the BMAD PRD and story files become requirements.

### PRD and story

`FR-1` headings and `NFR1:` items of the PRD and the acceptance criteria of a `1-2-<slug>.md` story resolve, with the story's status.

## GSD reader

How `.planning/REQUIREMENTS.md` becomes requirements.

### Requirement with category

A `**AUTH-01**` item carries its category and checkbox; items under "Out of Scope" are retired.

## ADR reader

How architecture decision records become decisions.

### MADR record

A MADR record with `status: accepted` is an active decision whose text is the decision outcome.

### Nygard supersession

A `Supersedes [...]` line becomes a `supersedes` edge, the superseded record is retired, and the node is labelled `Decision` and `ADR`.

## Framework ids

Schemes, aliases and misses across frameworks.

### Two frameworks side by side

OpenSpec and ADR annotations in one project both resolve and `tg check` passes.

### Alias resolves

`adr:3`, a slug and a scheme-less OpenSpec id resolve; frameworks and groups are listed per scheme.

### Miss with suggestion

A near-miss Spec Kit id gets a suggestion, and a framework with no files says so.

## Framework nodes in the graph

Spec nodes carry a base label and their framework's label.

### User story label

A user story is `Requirement` and `UserStory` with its priority, and a Kiro criterion `Scenario` and `AcceptanceCriterion`.

### Implements a user story

`implements` to a user story passes `tg ontology check` with the code ontology, and Cypher finds it by `UserStory`.

## Framework detection

Which folders mean a framework is in use.

### Spec Kit needs its marker

`specs/<feature>/spec.md` is read only when `.specify/` exists.

### Custom ADR folder

The folder named in `.adr-dir` is read.

## Framework registry

The registry the wizard and usage text are built from.

### Registry lists six frameworks

`tg init --help` lists every framework id for `--spec`.

## Docs name any framework

The `specs:` frontmatter key.

### ADR documented

A record named in `specs:` is documented in `tg trace`, and `tg check` passes.

### Unknown entry

A `specs:` entry that resolves to nothing fails `tg check`.

## Trace across frameworks

`tg trace` over several frameworks.

### Superseded record is not a gap

A superseded record is listed as retired and is never a gap under `--gaps --strict`.

### Group argument

`tg trace speckit:001-auth` lists only that feature; a bare OpenSpec capability still works.

### No framework

Without a framework `tg trace` exits 2 and names the folders it looks for.

## Framework choice

The spec framework step of `tg init`.

### Flag for scripts

`--spec speckit,adr` chooses the frameworks and `--json` lists them.

### Unknown framework

An unknown `--spec` id is an error naming the accepted ids, and nothing is written.

### Checklist in a terminal

Detected frameworks are ticked and marked found.

## Project analysis

The recommendation when a project uses no framework.

### Existing codebase

Twelve source files recommend OpenSpec, with the count as the reason.

### New project

An empty project recommends Spec Kit.

## Framework install

Running a framework's own installer with consent.

### Installed in a terminal

The picked installer runs and the OpenSpec skill it writes is patched in the same run.

### Script without consent

Without `--install-spec` nothing runs and a note gives the command.

### Script with consent

With `--install-spec` and only `uvx` on PATH, Spec Kit is installed with a one-off `uvx` run.

### Dry run

A dry run runs and writes nothing and prints the command.

## Framework skill patching

tg blocks in other frameworks' skills and commands.

### Spec Kit skill patched

`speckit-implement` gains the implement block with Spec Kit ids and keeps its own text.

### Command file of another agent

OpenCode's `speckit.tasks.md` command gains the tasks block.

### Re-run is stable

A second run changes nothing and leaves one block.

## Framework scaffolds

Files tg writes for a chosen framework.

### First ADR

ADRs chosen without a folder get a first record and a template, and `adr:1` resolves.

### Kiro steering

Kiro chosen writes `.kiro/steering/tg.md` with `inclusion: always`.

## Ontology per framework

The composed `Types/spec-types.md`.

### Spec Kit and Kiro together

`Feature` is declared once and `tg ontology` reports no duplicate.

### Only what is chosen

ADRs alone declare `ADR` and `amends` and no Spec Kit types.

## Skills follow the frameworks

Skills and instructions filled per framework.

### Skill for Spec Kit

The trace skill explains Spec Kit ids, leaves out Kiro and keeps no placeholder.

### Instructions name the frameworks

The instruction block has one line for OpenSpec and one for ADRs.
