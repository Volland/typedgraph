## Purpose

Keeps a project's tg setup current: tells a person when a newer `tg` exists, installs it with consent, and refreshes the instructions, skills and ontology an earlier `tg init` wrote without touching what the project owns.

## ADDED Requirements

### Requirement: Update check
`tg init` and `tg upgrade` SHALL, when a person is at a terminal, ask the npm registry for the newest `@typedgraph/cli` with a timeout of three seconds and compare it with the running version, release versions only. They SHALL NOT reach the network for runs without a terminal, with `--yes`, `--json`, `--dry-run` or `--no-update-check`, with `TG_NO_UPDATE_CHECK=1`, in CI, or from a development build.

#### Scenario: Scripts never wait
- **WHEN** `tg init --yes` runs, or `tg init` runs outside a terminal or in CI
- **THEN** the registry is not asked

#### Scenario: Nothing newer
- **WHEN** the registry names the running version, or does not answer
- **THEN** nothing is asked and the command carries on

### Requirement: Install with consent
When a newer version exists, the command SHALL offer to install it (`npm install -g @typedgraph/cli@<version>`) or, when started by `npx`, to run it through `npx`, and then run the same command with the same arguments and `--no-update-check` with that version, returning its exit code; or to continue with the running version. A failed install SHALL be reported and the running version SHALL continue.

#### Scenario: Continue
- **WHEN** the person picks the running version
- **THEN** nothing is installed and the command carries on

#### Scenario: Install and run again
- **WHEN** the person picks the newer version of `tg init --agent claude`
- **THEN** it is installed, `tg init --agent claude --no-update-check` runs, its exit code is returned and the older version writes nothing

### Requirement: Project refresh
`tg upgrade` SHALL detect what an earlier `tg init` set up (agents whose instruction file holds the tg block or whose skills folder holds tg skills, hooks and MCP entry, spec frameworks, ontology) and plan with init's planner, keeping changes to existing files, the tg skills of those agents (also skills added since) and the spec ontology, and nothing else.

#### Scenario: Refreshed files listed
- **WHEN** a project has an outdated skill, a deleted tg skill and an ontology without descriptions
- **THEN** `tg upgrade --yes` lists and writes the skill update, the restored skill and the enriched ontology, creates no instruction file the project did not have, and a second run changes nothing

### Requirement: Ontology enrichment
The project's `Types/code-types.md` SHALL never be overwritten: each type and edge type it shares with the bundled ontology SHALL gain the `description`, `elements` and `sections` it lacks and its properties their descriptions (a kind shorthand becoming a mapping), comments and the project's own values, types and edges SHALL stay, removed declarations SHALL NOT come back, and `tgs` SHALL move to the bundled version when anything is added.

#### Scenario: Edits kept
- **WHEN** the project changed Decision's status values, added a Risk type and removed Concept
- **THEN** enrichment adds Decision's description, elements and property descriptions, keeps the values, the comment and Risk, adds no Concept, and a second enrichment adds nothing

### Requirement: Upgrade command
`tg upgrade` SHALL list the files it would change, ask before writing in a terminal (with the diff on request), write without asking with `--yes` or outside a terminal, print the diff and write nothing with `--dry-run`, print one JSON document with `--json`, and say so when there is no tg setup or nothing to change.

#### Scenario: Asked before writing
- **WHEN** `tg upgrade --dry-run` runs and then `tg upgrade` runs in a terminal
- **THEN** the dry run prints the diff and changes nothing, and the second run asks before it writes
