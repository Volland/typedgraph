## ADDED Requirements

### Requirement: OpenFlow reader
The system SHALL read OpenFlow's `docs/current/<capability>/spec.md` and `requirements.md`, and the same files in each folder under `docs/changes/`, never `docs/archive/`. Each scenario in a `spec.md` frontmatter `scenarios` list (JSON as OpenFlow writes it, or YAML) SHALL be a requirement of its id (`SC-001`), labelled `BehaviorScenario`, with its name as alias and title, its criticality, and its given, when and then as text. Each `requirements.md` table row whose first cell is an id (`R1`, `US-001`, `FR-001`, `NFR-1`), and each `- **FR-001**:` item, SHALL be a requirement of that id with its priority and acceptance columns as properties; rows still holding `{{placeholders}}` SHALL be skipped. Requirements from a change folder SHALL be pending in that change.

#### Scenario: Scenarios and requirement rows
- **WHEN** `docs/current/drift-guardian/spec.md` has a frontmatter scenario `SC-001` with criticality `critical`, and its `requirements.md` has a row `| R1 | 创建任务 | P0 | ... |` and a template row `| US-001 | {{role}} | ... |`
- **THEN** `openflow:drift-guardian#SC-001` resolves with `criticality: critical`, `openflow:drift-guardian#R1` with `priority: P0`, and `US-001` is missing

#### Scenario: Open change is pending
- **WHEN** `docs/changes/2026-05-21-drg-task-scheduler/requirements.md` lists `R2`, and the same file sits under `docs/archive/`
- **THEN** `openflow:2026-05-21-drg-task-scheduler#R2` is pending in that change and nothing from the archive resolves

## MODIFIED Requirements

### Requirement: Framework ids
The system SHALL resolve requirement ids of seven spec frameworks, each in its own scheme: `openspec:<capability>#<Requirement>[#<Scenario>]`, `speckit:<feature>#<id>[#<scenario>]`, `kiro:<spec>#Requirement <n>[#<n.m>]`, `bmad:<group>#<id>[#<criterion>]`, `gsd:requirements#<id>`, `openflow:<capability>#<id>` and `adr:<number>`. Matching SHALL ignore case and collapse whitespace, SHALL accept each requirement's aliases, SHALL treat a target without a scheme as OpenSpec, and SHALL report a miss with the nearest id. Every consumer of `openspec:` ids (annotations, typed doc edges, `tg check`, `tg edges`, `tg cypher`, `tg trace`) SHALL accept the other schemes the same way.

#### Scenario: Two frameworks side by side
- **WHEN** a project has `openspec/specs/auth/spec.md` and an ADR `docs/adr/0003-use-postgres.md`, and code carries `@tg: implements:: [[openspec:auth#Login]]` and `@tg: implements:: [[adr:0003]]`
- **THEN** both resolve and `tg check` reports nothing

#### Scenario: Alias resolves
- **WHEN** an annotation targets `adr:3` and the record is `0003-use-postgres.md`
- **THEN** it resolves to `adr:0003`

#### Scenario: Miss with suggestion
- **WHEN** an annotation targets `speckit:001-auth#FR-01` and the spec defines `FR-001`
- **THEN** `tg check` reports the target as missing and suggests `speckit:001-auth#FR-001`

### Requirement: Framework detection
The system SHALL treat a framework as in use when the folders its tool creates exist: `openspec/` for OpenSpec, `.specify/` for Spec Kit, `.kiro/specs`, `.spec-workflow` or a non-empty `.kiro` for Kiro, `_bmad`, `.bmad-core` or `_bmad-output` for BMAD, `.planning/REQUIREMENTS.md` or `.planning/PROJECT.md` for GSD, `.openflow/`, `openflow.jsonc` or `openflow.json` for OpenFlow, and for ADRs an ADR folder holding a numbered record, `.adr-dir` or `.log4brains.yml`. The spec index SHALL read the requirement files of every framework in use, and SHALL be absent when none is.

#### Scenario: Spec Kit needs its marker
- **WHEN** a project has `specs/001-auth/spec.md` but no `.specify/`
- **THEN** no Spec Kit requirement is read

#### Scenario: Custom ADR folder
- **WHEN** `.adr-dir` contains `architecture/adr` and that folder holds `0001-x.md`
- **THEN** `adr:0001` resolves

### Requirement: Framework registry
The system SHALL keep one registry of the frameworks with, for each: its name, a one-line description for the wizard, example ids for skills and patch blocks, and the skill folder names and command file names that drive each workflow stage (author, plan, tasks, implement).

#### Scenario: Registry lists seven frameworks
- **WHEN** `tg init --help` is shown
- **THEN** `--spec` lists `openspec`, `speckit`, `kiro`, `bmad`, `gsd`, `openflow` and `adr`

### Requirement: Framework skill patching
When a framework's stage skill (`<skills>/<name>/SKILL.md`) or command file (`<commands>/<name>.md`, `.prompt.md` or `.agent.md`) exists in a selected agent's folders, `tg init` SHALL append the tg block for that stage, filled with the framework's ids, between `<!-- tg:begin -->` and `<!-- tg:end -->`. On later runs it SHALL replace only that block. It SHALL skip patching when the `specs` part is not selected. The targets are:
- Spec Kit: `speckit-specify`, `speckit-clarify`, `speckit-plan`, `speckit-tasks` and `speckit-implement`.
- cc-sdd: `kiro-spec-requirements`, `kiro-spec-design`, `kiro-spec-tasks` and `kiro-spec-impl`.
- BMAD: `bmad-create-prd`, `bmad-create-story` and `bmad-dev-story`.
- GSD: plan-phase and execute-phase.
- OpenFlow: `openflow-feature`, `openflow-brainstorm`, `openflow-writing-plan`, `openflow-tdd` and `openflow-quality-gate`, and the `openflow-feature` and `openflow-implement` commands. OpenFlow rewrites its global copies on every start, so only project copies are patched and the agent instruction block carries the OpenFlow rules.

#### Scenario: Spec Kit skill patched
- **WHEN** `.claude/skills/speckit-implement/SKILL.md` exists and `tg init --write` runs
- **THEN** it ends with a tg block that tells the agent to annotate code with `implements:: [[speckit:<feature>#FR-001]]`, and its original text is unchanged

#### Scenario: Command file of another agent
- **WHEN** `.opencode/command/speckit.tasks.md` exists and `tg init --agent opencode --write` runs
- **THEN** it ends with the tasks block

#### Scenario: OpenFlow skill patched
- **WHEN** a project has `.openflow/`, `.opencode/skills/openflow-quality-gate/SKILL.md` and `.opencode/commands/openflow-feature.md`, and `tg init --agent opencode --write` runs
- **THEN** the skill ends with the implement block citing `openflow:<capability>#SC-001`, the command ends with the author block, and `AGENTS.md` holds the OpenFlow line

#### Scenario: Re-run is stable
- **WHEN** `tg init --write` runs a second time
- **THEN** each patched file still holds exactly one tg block

### Requirement: Ontology per framework
When the `ontology` part is set up and at least one framework is chosen, `tg init` SHALL write `Types/spec-types.md`. The note SHALL declare the types and edges of the chosen frameworks only, merged so that a type shared by two frameworks is declared once and an edge shared by two has the union of their endpoints, and tg SHALL rewrite it on every run. The types are: `Capability` (OpenSpec, OpenFlow), `BehaviorScenario` (OpenFlow), `Feature`, `UserStory`, `FunctionalRequirement`, `SuccessCriterion` and `Principle` (Spec Kit), `AcceptanceCriterion` (Kiro, BMAD), `Epic` and `Story` (BMAD), `Phase` (GSD) and `ADR`. The edges are: `part_of`, `governs`, `delivered_in` and `amends`. The note SHALL read without diagnostics next to `Types/code-types.md`.

#### Scenario: Spec Kit and Kiro together
- **WHEN** `tg init --spec speckit,kiro --write` runs
- **THEN** `Types/spec-types.md` declares `Feature` once, `UserStory` and `AcceptanceCriterion`, and `tg ontology` reports no duplicate declaration

#### Scenario: Only what is chosen
- **WHEN** `tg init --spec adr --write` runs
- **THEN** `Types/spec-types.md` declares `ADR` and `amends` and no `UserStory`
