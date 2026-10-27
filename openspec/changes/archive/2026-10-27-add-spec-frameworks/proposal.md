## Why

`tg` traces requirements to code, tests and docs, but only for OpenSpec: the reader, the `openspec:` id scheme, the `tg init` patches, the config rules and the bundled skills all assume `openspec/`. Most teams that write specs for coding agents use something else. GitHub Spec Kit (~143k stars) is the most adopted, BMAD (~55k) and Get Shit Done (~64k) have large followings, and Kiro's format is shared by the Kiro IDE, cc-sdd and spec-workflow-mcp. Architecture decision records (MADR, Nygard/adr-tools, log4brains) sit next to all of them, and the code ontology already has a `Decision` type they map onto. A project that uses Spec Kit, or OpenSpec plus ADRs, gets nothing from `tg trace` today. A project with no spec framework gets no help choosing or installing one.

## What Changes

- **Readers for six frameworks.** OpenSpec stays as it is. New readers cover Spec Kit `specs/<feature>/spec.md`, Kiro-format `requirements.md` (`.kiro/specs/`, `.spec-workflow/specs/`), the BMAD PRD and story files, GSD `.planning/REQUIREMENTS.md`, and ADR folders. Each framework gets its own id scheme: `speckit:001-auth#FR-001`, `speckit:001-auth#US1#Scenario 1`, `kiro:auth#Requirement 1#1.2`, `bmad:prd#FR-1`, `bmad:epic-1#Story 1.2#AC1`, `gsd:requirements#AUTH-01`, `adr:0003`. They resolve in annotations, typed doc edges, `tg check`, `tg trace`, `tg edges` and `tg cypher` exactly as `openspec:` ids do. Aliases also resolve: a user story's title, a bare criterion number, an ADR number without leading zeros.
- **Detection.** A framework is in use when the folders its tool creates exist: `openspec/`, `.specify/`, `.kiro/` or `.spec-workflow/`, `_bmad/`, `.planning/`, or an ADR folder (or `.adr-dir`). `tg trace` with no framework found says which folders it looks for.
- **Docs frontmatter.** A new `specs:` key takes scheme-qualified ids of any framework; `openspec:` keeps working.
- **`tg trace` across frameworks.** Groups are named `speckit:<feature>`, `kiro:<spec>`, `adr`. Decision records count as verified, since a decision needs no test. Retired records are listed but never reported as gaps: superseded, deprecated or rejected ADRs, and out-of-scope requirements.
- **Graph nodes keep a base label and gain a framework label.** Spec nodes keep the base label the code ontology's edges allow (`Requirement`, `Scenario` or `Decision`) and add their framework's own: `UserStory`, `FunctionalRequirement`, `SuccessCriterion`, `AcceptanceCriterion` (with its EARS pattern), `Story`, `ADR`. They also carry the framework's properties: priority, status, date. ADR `Supersedes` and `Amends` lines become `supersedes` and `amends` edges.
- **A spec ontology per project.** `tg init` writes `Types/spec-types.md` with the types and edges of the chosen frameworks only, merged so a name shared by two frameworks (`Feature`, `part_of`) is declared once. tg rewrites this file on every run; `Types/code-types.md` stays project-owned.
- **A spec-framework step in the `tg init` wizard.** The `openspec` part becomes `specs`; `openspec` is still accepted as an alias.
  - A checklist of the six frameworks. Detected ones are ticked and marked found. When none is found, the project is analysed and one is recommended: OpenSpec for an existing codebase, Spec Kit for a new one.
  - For each chosen framework not yet in the project, tg offers to run its installer: the tool if it is on PATH, a one-off `npx` or `uvx` run, or a global install first. Each option shows the exact command. Examples: `openspec init --tools <agents>`, `specify init --here --force --integration <agent>`, `npx cc-sdd@latest`, `npx bmad-method install`, `npx get-shit-done-cc`.
  - Scripts choose with `--spec <ids>|none` and run installers only with `--install-spec`. A dry run only prints the commands.
  - ADRs need no tool: tg writes `docs/adr/0001-record-architecture-decisions.md` and a MADR template. Kiro gets an always-included steering file, `.kiro/steering/tg.md`.
- **tg steps in every framework's skills and commands.** OpenSpec's patches are unchanged. Spec Kit (`speckit-specify`, `-plan`, `-tasks`, `-implement` skills and `speckit.*` command files), cc-sdd (`kiro-spec-*`), BMAD (`bmad-create-prd`, `bmad-create-story`, `bmad-dev-story`) and GSD files get a tg block for their stage (author, plan, tasks or implement), filled with that framework's ids. These files are patched in every selected agent's skills and command folders.
- **Skills and instructions follow the frameworks.** The `tg-trace` skill, the agent instruction block, the Cursor rules, `tg-audit`, `tg-impact`, `tg-docs` and `tg-graph` are filled with the id grammar and conventions of the frameworks the project uses. `tg gen` prints them for the frameworks in the current folder.

## Capabilities

### New Capabilities
- `spec-frameworks`: framework readers and id schemes, detection, `specs:` frontmatter, the trace and graph behaviour across frameworks, the wizard's framework choice and installers, framework skill patching and scaffolds, the per-framework ontology, and skills filled per framework.

### Modified Capabilities
- `tg-agent-integration`: the `openspec` setup part becomes `specs` (with `openspec` as an alias), and the interactive parts checklist ticks every part, since the framework step decides what to set up.

## Impact

- **Bound by:** [[cli#Requirement trace]] (the `openspec:` scheme keeps ids out of lat.md id space, so new schemes must too), [[cli#Agent integration]] (init writes by default, re-runs change only what is out of date, and user text outside tg's markers is never touched), and [[code-ontology]] (spec nodes must keep labels the code ontology's `implements` and `verifies` endpoints allow).
- **Lat.md sections touched:** `cli#Requirement trace`, `cli#Agent integration`, `cli#Code ontology`, `tests/tg-trace` and `tests/tg-agent`, plus a new `tests/spec-frameworks`.
- **Requirements added:** every requirement in `[[openspec:spec-frameworks#Framework ids]]` and the others of that capability. **Requirement modified:** `[[openspec:tg-agent-integration#Setup parts]]`.
- **packages/core:** `openspec/frameworks.ts` (readers, registry, locations); `SpecIndex` gains multiple schemes, aliases, `entries()` and `frameworks()`; `traceRequirements`, `buildLatGraph`, `checkLattice` and `parseFrontmatter` read `specs:` and framework labels.
- **packages/cli:**
  - New: `specs.mts` (detection, file discovery, install options, ontology fragments, template filling) and the `templates/specs/` folder.
  - Changed: `init.mts` (wizard step, installers, patches, scaffolds), `agents.mts` (command folders, Spec Kit keys), `project.mts`, `trace.mts` and `gen.mts`.
  - `Io.exec` runs installers with the terminal attached.
- **Compatibility:**
  - `--only openspec`, `--skip openspec` and `--no-openspec` keep working.
  - OpenSpec ids, patches and config rules are unchanged.
  - Projects that use only OpenSpec gain `Types/spec-types.md` on their next `tg init`.
