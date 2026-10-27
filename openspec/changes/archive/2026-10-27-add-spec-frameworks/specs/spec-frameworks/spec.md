## ADDED Requirements

### Requirement: Framework ids
The system SHALL resolve requirement ids of six spec frameworks, each in its own scheme: `openspec:<capability>#<Requirement>[#<Scenario>]`, `speckit:<feature>#<id>[#<scenario>]`, `kiro:<spec>#Requirement <n>[#<n.m>]`, `bmad:<group>#<id>[#<criterion>]`, `gsd:requirements#<id>` and `adr:<number>`. Matching SHALL ignore case and collapse whitespace, SHALL accept each requirement's aliases, SHALL treat a target without a scheme as OpenSpec, and SHALL report a miss with the nearest id. Every consumer of `openspec:` ids (annotations, typed doc edges, `tg check`, `tg edges`, `tg cypher`, `tg trace`) SHALL accept the other schemes the same way.

#### Scenario: Two frameworks side by side
- **WHEN** a project has `openspec/specs/auth/spec.md` and an ADR `docs/adr/0003-use-postgres.md`, and code carries `@tg: implements:: [[openspec:auth#Login]]` and `@tg: implements:: [[adr:0003]]`
- **THEN** both resolve and `tg check` reports nothing

#### Scenario: Alias resolves
- **WHEN** an annotation targets `adr:3` and the record is `0003-use-postgres.md`
- **THEN** it resolves to `adr:0003`

#### Scenario: Miss with suggestion
- **WHEN** an annotation targets `speckit:001-auth#FR-01` and the spec defines `FR-001`
- **THEN** `tg check` reports the target as missing and suggests `speckit:001-auth#FR-001`

### Requirement: Spec Kit reader
The system SHALL read `specs/<feature>/spec.md`. Each `### User Story N - Title (Priority: Pn)` SHALL be a requirement `USN` with the label `UserStory`, its title and priority as properties and its title as an alias. Each numbered item under its `**Acceptance Scenarios**:` SHALL be a scenario `Scenario N` with the alias `N`. Each `- **XX-NNN**:` item SHALL be a requirement of that id: `FR-` items labelled `FunctionalRequirement`, `SC-` items `SuccessCriterion`, `NFR-` items `NonFunctionalRequirement`. An item containing `NEEDS CLARIFICATION` SHALL carry `clarification: needed`. The feature folder name without its numeric prefix SHALL also name the group.

#### Scenario: Stories, scenarios and requirements
- **WHEN** a spec has `### User Story 1 - Sign in (Priority: P1)` with two acceptance scenarios, and items `- **FR-001**: System MUST ...` and `- **SC-001**: ...`
- **THEN** the index holds `speckit:001-auth#US1` with scenarios `Scenario 1` and `Scenario 2`, plus `speckit:001-auth#FR-001` and `speckit:001-auth#SC-001`

#### Scenario: Short feature name
- **WHEN** an annotation targets `speckit:auth#FR-001` and the folder is `specs/001-auth/`
- **THEN** it resolves to `speckit:001-auth#FR-001`

### Requirement: Kiro reader
The system SHALL read `.kiro/specs/<spec>/requirements.md` and `.spec-workflow/specs/<spec>/requirements.md`. Each `### Requirement N` heading, with or without a `: Title`, SHALL be a requirement `Requirement N` with the aliases `N` and the title. Its text SHALL be the `**User Story:**` or `**Objective:**` line. Each numbered item under `#### Acceptance Criteria` SHALL be a scenario `N.M` labelled `AcceptanceCriterion`, with the alias `M` and its EARS pattern (`event-driven`, `state-driven`, `unwanted`, `optional` or `ubiquitous`) as the property `ears`.

#### Scenario: Criteria numbered as tasks cite them
- **WHEN** `### Requirement 2: Export` has three acceptance criteria and the second starts with `IF`
- **THEN** `kiro:<spec>#Requirement 2#2.2` resolves to a scenario with `ears: unwanted`

#### Scenario: cc-sdd format
- **WHEN** a requirement uses `**Objective:** As a user ...` and lowercase `When ..., the system shall ...` criteria
- **THEN** the objective is the requirement's text and each criterion is `event-driven`

### Requirement: BMAD reader
The system SHALL read the BMAD PRD (`docs/prd.md`, sharded `docs/prd/*.md`, `_bmad-output/planning-artifacts/prd.md`). Each `FR1:`, `FR-1:` or `#### FR-1:` item SHALL be a requirement in the group `prd`, and so SHALL each `NFR` item, labelled `FunctionalRequirement` or `NonFunctionalRequirement`. The system SHALL also read story files (`docs/stories/1.2.<slug>.md`, `_bmad-output/implementation-artifacts/1-2-<slug>.md`). Each story file SHALL be a requirement `Story 1.2` in the group `epic-1`, labelled `Story`, with its numbered acceptance criteria as scenarios `AC1`, `AC2`, and so on. A story in `draft` or `backlog` status SHALL be pending.

#### Scenario: PRD and story
- **WHEN** the PRD lists `FR-1: Users can sign in` and `1-2-sign-in.md` has two acceptance criteria
- **THEN** `bmad:prd#FR-1` and `bmad:epic-1#Story 1.2#AC2` resolve

### Requirement: GSD reader
The system SHALL read `.planning/REQUIREMENTS.md`, where each `- [ ] **CAT-NN**: ...` item SHALL be a requirement of that id with its `### Category`, its `##` scope heading and whether it is checked off as properties. Items under an out-of-scope heading SHALL be retired.

#### Scenario: Requirement with category
- **WHEN** `### Authentication` lists `- [x] **AUTH-01**: User can sign up`
- **THEN** `gsd:requirements#AUTH-01` resolves with `category: Authentication` and `done: true`

### Requirement: ADR reader
The system SHALL read numbered records (`NNNN-slug.md`) in `docs/adr`, `doc/adr`, `docs/decisions`, the other conventional folders, or the folder named in `.adr-dir`. Each record SHALL be a decision addressed as `adr:<number>`, with the aliases: the number without leading zeros, `ADR-<number>`, the slug and the title. It SHALL take its status from frontmatter, a `## Status` section or a `- Status:` line. A proposed record SHALL be pending, and a superseded, deprecated or rejected record retired. `Supersedes [...](file)` and `Amends [...](file)` lines SHALL become `supersedes` and `amends` relations to the linked record.

#### Scenario: MADR record
- **WHEN** `docs/decisions/0002-use-postgres.md` has frontmatter `status: accepted` and a `## Decision Outcome`
- **THEN** `adr:0002` is an active decision whose text is the decision outcome

#### Scenario: Nygard supersession
- **WHEN** `doc/adr/0004-use-sqlite.md` has `## Status` `Accepted` and a line `Supersedes [2. Use Postgres](0002-use-postgres.md)`
- **THEN** the graph has a `supersedes` edge from `adr:0004` to `adr:0002`

### Requirement: Framework detection
The system SHALL treat a framework as in use when the folders its tool creates exist: `openspec/` for OpenSpec, `.specify/` for Spec Kit, `.kiro/specs`, `.spec-workflow` or a non-empty `.kiro` for Kiro, `_bmad`, `.bmad-core` or `_bmad-output` for BMAD, `.planning/REQUIREMENTS.md` or `.planning/PROJECT.md` for GSD, and for ADRs an ADR folder holding a numbered record, `.adr-dir` or `.log4brains.yml`. The spec index SHALL read the requirement files of every framework in use, and SHALL be absent when none is.

#### Scenario: Spec Kit needs its marker
- **WHEN** a project has `specs/001-auth/spec.md` but no `.specify/`
- **THEN** no Spec Kit requirement is read

#### Scenario: Custom ADR folder
- **WHEN** `.adr-dir` contains `architecture/adr` and that folder holds `0001-x.md`
- **THEN** `adr:0001` resolves

### Requirement: Framework registry
The system SHALL keep one registry of the frameworks with, for each: its name, a one-line description for the wizard, example ids for skills and patch blocks, and the skill folder names and command file names that drive each workflow stage (author, plan, tasks, implement).

#### Scenario: Registry lists six frameworks
- **WHEN** `tg init --help` is shown
- **THEN** `--spec` lists `openspec`, `speckit`, `kiro`, `bmad`, `gsd` and `adr`

### Requirement: Framework nodes in the graph
Each spec requirement SHALL become a graph node labelled `Requirement` (or `Decision` for a decision record) plus its framework's labels, and each scenario a node labelled `Scenario` plus its labels. Every node SHALL carry `framework` and the framework's properties. A record's relations SHALL become typed edges between the nodes.

#### Scenario: User story label
- **WHEN** `tg cypher "MATCH (u:UserStory) RETURN u.requirement, u.priority"` runs in a Spec Kit project
- **THEN** each user story is returned with its priority

#### Scenario: Implements a user story
- **WHEN** code has `@tg: implements:: [[speckit:001-auth#US1]]` and `tg ontology check` runs with the code ontology
- **THEN** no finding is reported, because the node is also a `Requirement`

### Requirement: Docs name any framework
A lat.md file's frontmatter SHALL accept `specs:` with scheme-qualified ids of any framework (a group, a requirement or a record) beside `openspec:`. Both keys SHALL mark the named requirements as documented in `tg trace`, add `references` edges from the file's root section, and fail `tg check` for an entry that resolves to nothing.

#### Scenario: ADR documented
- **WHEN** a lat.md file has `specs: ["adr:0003"]`
- **THEN** `tg trace adr` shows `adr:0003` as documented by that file

#### Scenario: Unknown entry
- **WHEN** a lat.md file has `specs: ["speckit:009-missing"]`
- **THEN** `tg check` reports the entry

### Requirement: Trace across frameworks
`tg trace` SHALL report every framework's requirements, grouped as `<capability>` for OpenSpec, `<scheme><group>` for the others and `adr` for decision records. It SHALL accept any of these group names, or a bare OpenSpec capability, as arguments. Decision records SHALL count as verified. Retired requirements SHALL be listed but never counted as gaps by `--gaps` or `--strict`. Without any framework, it SHALL exit 2 and name the folders it looks for.

#### Scenario: Superseded record is not a gap
- **WHEN** `adr:0002` is superseded and nothing implements it, and `tg trace adr --gaps --strict` runs
- **THEN** `adr:0002` is not listed and the exit code is 0 when every other record is implemented

#### Scenario: Group argument
- **WHEN** `tg trace speckit:001-auth` runs in a project that also uses OpenSpec
- **THEN** only that feature's requirements are listed

#### Scenario: No framework
- **WHEN** `tg trace` runs in a project with no spec framework
- **THEN** it exits 2 and the message names `openspec/`, `.kiro/specs/` and `docs/adr/`

### Requirement: Framework choice
When the `specs` part is set up, `tg init` SHALL choose the frameworks as follows:
- From `--spec`: a comma-separated list of framework ids, or `none`.
- Otherwise, in an interactive setup: a checklist of every framework with its description, with detected frameworks ticked and marked found.
- Otherwise: the detected frameworks.

An unknown id SHALL be an error that names the accepted ids. The chosen frameworks SHALL decide the spec ontology, the scaffolds and how the skills and instructions are filled. `--json` output SHALL list them as `specs`.

#### Scenario: Flag for scripts
- **WHEN** `tg init --spec speckit,adr --json` runs
- **THEN** the JSON lists `specs: ["speckit", "adr"]`

#### Scenario: Unknown framework
- **WHEN** `tg init --spec specflow` runs
- **THEN** it exits with an error naming the accepted ids and writes nothing

#### Scenario: Checklist in a terminal
- **WHEN** `tg init` runs in a terminal in a project with `openspec/` and `docs/adr/0001-x.md`
- **THEN** the spec frameworks checklist shows OpenSpec and ADRs ticked and marked found

### Requirement: Project analysis
When a project uses no spec framework, the interactive checklist SHALL tick one recommended framework with its reason: OpenSpec for a project with ten or more source files, Spec Kit otherwise.

#### Scenario: Existing codebase
- **WHEN** an interactive `tg init` runs in a project with twelve TypeScript files and no spec framework
- **THEN** OpenSpec is ticked and labelled as recommended for an existing codebase

#### Scenario: New project
- **WHEN** an interactive `tg init` runs in an empty project
- **THEN** Spec Kit is ticked and labelled as recommended

### Requirement: Framework install
For each chosen framework the project does not use yet, `tg init` SHALL offer to run the framework's own installer before it plans its files.
- **Commands:** `openspec init --tools <agents>`, `specify init --here --force --integration <agent>`, `cc-sdd`, the BMAD installer or the GSD installer.
- **Ways to run, each shown with its exact command:** the tool when it is on PATH, a one-off `npx` or `uvx` run, or a global install followed by the tool.
- **Interactive runs:** a single choice that also offers to skip.
- **Non-interactive runs:** only with `--install-spec`, using the first way.
- **Skipped, dry runs and hosts that cannot run programs:** the command SHALL be printed as a note instead.
- **Missing prerequisite:** when a framework's prerequisite is not on PATH, a note SHALL say what to install.
- **Failure:** a step that exits non-zero SHALL stop that framework's install with a note.
- **ADRs:** no installer is run.

#### Scenario: Installed in a terminal
- **WHEN** an interactive `tg init` runs with OpenSpec ticked, no `openspec/` folder, `openspec` on PATH and the person picks Run
- **THEN** `openspec init --tools claude` runs in the project and the OpenSpec skills it writes are patched in the same run

#### Scenario: Script without consent
- **WHEN** `tg init --spec openspec --json` runs without `--install-spec` in a project without `openspec/`
- **THEN** nothing is run and a note gives the command

#### Scenario: Script with consent
- **WHEN** `tg init --spec speckit --install-spec --json` runs with `uvx` on PATH and no `specify`
- **THEN** `uvx --from specify-cli specify init --here --force --integration claude` runs

#### Scenario: Dry run
- **WHEN** `tg init --spec openspec --install-spec --dry-run` runs
- **THEN** nothing is run or written and a note gives the command

### Requirement: Framework skill patching
When a framework's stage skill (`<skills>/<name>/SKILL.md`) or command file (`<commands>/<name>.md`, `.prompt.md` or `.agent.md`) exists in a selected agent's folders, `tg init` SHALL append the tg block for that stage, filled with the framework's ids, between `<!-- tg:begin -->` and `<!-- tg:end -->`. On later runs it SHALL replace only that block. It SHALL skip patching when the `specs` part is not selected. The targets are:
- Spec Kit: `speckit-specify`, `speckit-clarify`, `speckit-plan`, `speckit-tasks` and `speckit-implement`.
- cc-sdd: `kiro-spec-requirements`, `kiro-spec-design`, `kiro-spec-tasks` and `kiro-spec-impl`.
- BMAD: `bmad-create-prd`, `bmad-create-story` and `bmad-dev-story`.
- GSD: plan-phase and execute-phase.

#### Scenario: Spec Kit skill patched
- **WHEN** `.claude/skills/speckit-implement/SKILL.md` exists and `tg init --write` runs
- **THEN** it ends with a tg block that tells the agent to annotate code with `implements:: [[speckit:<feature>#FR-001]]`, and its original text is unchanged

#### Scenario: Command file of another agent
- **WHEN** `.opencode/command/speckit.tasks.md` exists and `tg init --agent opencode --write` runs
- **THEN** it ends with the tasks block

#### Scenario: Re-run is stable
- **WHEN** `tg init --write` runs a second time
- **THEN** each patched file still holds exactly one tg block

### Requirement: Framework scaffolds
When Kiro is chosen, `tg init` SHALL write `.kiro/steering/tg.md` with `inclusion: always` and the tg rules for Kiro ids. When ADRs are chosen and the project has no ADR folder, it SHALL write `docs/adr/0001-record-architecture-decisions.md` and `docs/adr/template.md` in MADR format, each only when absent.

#### Scenario: First ADR
- **WHEN** `tg init --spec adr --write` runs in a project without ADRs
- **THEN** `docs/adr/0001-record-architecture-decisions.md` exists and `adr:0001` resolves afterwards

#### Scenario: Kiro steering
- **WHEN** `tg init --spec kiro --write` runs
- **THEN** `.kiro/steering/tg.md` starts with `inclusion: always`

### Requirement: Ontology per framework
When the `ontology` part is set up and at least one framework is chosen, `tg init` SHALL write `Types/spec-types.md`. The note SHALL declare the types and edges of the chosen frameworks only, merged so that a type shared by two frameworks is declared once and an edge shared by two has the union of their endpoints, and tg SHALL rewrite it on every run. The types are: `Capability` (OpenSpec), `Feature`, `UserStory`, `FunctionalRequirement`, `SuccessCriterion` and `Principle` (Spec Kit), `AcceptanceCriterion` (Kiro, BMAD), `Epic` and `Story` (BMAD), `Phase` (GSD) and `ADR`. The edges are: `part_of`, `governs`, `delivered_in` and `amends`. The note SHALL read without diagnostics next to `Types/code-types.md`.

#### Scenario: Spec Kit and Kiro together
- **WHEN** `tg init --spec speckit,kiro --write` runs
- **THEN** `Types/spec-types.md` declares `Feature` once, `UserStory` and `AcceptanceCriterion`, and `tg ontology` reports no duplicate declaration

#### Scenario: Only what is chosen
- **WHEN** `tg init --spec adr --write` runs
- **THEN** `Types/spec-types.md` declares `ADR` and `amends` and no `UserStory`

### Requirement: Skills follow the frameworks
The `tg-trace` skill, the agent instruction block, the Cursor rules and the `tg-audit`, `tg-graph`, `tg-impact` and `tg-docs` skills SHALL describe the id grammar and conventions of the frameworks `tg init` sets up, or OpenSpec when there are none. `tg gen` SHALL fill them for the frameworks of the current folder, and SHALL also print each framework's section (`spec-<id>.md`), each framework stage block (`<id>-<stage>.md`) and the spec ontology (`spec-ontology.md`).

#### Scenario: Skill for Spec Kit
- **WHEN** `tg init --spec speckit --write` runs
- **THEN** `.claude/skills/tg-trace/SKILL.md` explains `speckit:<feature>#FR-001` ids and does not contain the Kiro section

#### Scenario: Instructions name the frameworks
- **WHEN** `tg init --spec openspec,adr --write` runs
- **THEN** the tg block in `CLAUDE.md` holds one line for OpenSpec ids and one for `adr:` ids
