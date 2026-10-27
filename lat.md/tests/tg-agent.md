---
type: Scenario
lat:
  require-code-mention: true
---
# TG Agent Integration Tests

Test specifications for `tg init`, `gen`, `hook`, `mcp` and the bundled skills in `packages/cli`, one section per scenario of the tg-agent-integration spec. See [[cli#Agent integration]].

## Safe init

Nothing is written without consent.

### Dry run

`tg init --dry-run` prints a diff for every file it would create and leaves the project untouched.

### Own folder, not a parent

`tg init` in a subfolder of a folder with `lat.md/` sets up the subfolder and leaves the parent untouched.

### Writes by default

`tg init` writes its files and lists each as created, with no diff; `--write` is still accepted and changes nothing.

### Idempotent write

Running `tg init` twice changes nothing the second time, and the hook entries are not duplicated.

## Migration from lat

Moving an existing lat.md setup.

### Existing block detected

A `lat:begin` block in `CLAUDE.md` is reported with the flag to migrate it, and stays untouched without `--migrate`.

### Migration applied

`--migrate` replaces the lat block with the tg block, swaps lat hooks and the lat MCP entry for tg ones, and leaves everything outside the markers byte-identical.

## Instruction generation

Printing agent instructions.

### Generate

`tg gen claude.md` prints instructions that say to run `tg search` first and `tg check` last, and an unknown target exits 2.

## Agent hooks

Behavior of `tg hook`.

### Prompt hook

The prompt hook emits the search-first reminder, expands `[[refs]]` in the user's prompt and appends the top lexical hits.

### Internal failure

Outside a project, or with unreadable input, a hook exits 0 and never blocks the agent.

### Cursor init

`tg init --agent cursor --write` writes `.cursor/rules/tg.mdc` and the tg skills under `.cursor/skills/`, and no Cursor hook configuration; `tg hook cursor stop` is for manual hook setup.

## MCP server

The stdio server wraps the CLI.

### Cypher over docs and code

The server lists the eight tools and `tg_cypher` returns the same `_type`-tagged result contract as the sidecar for a query over `Section` nodes.

## Bundled skills

Skills shipped with the package.

### Skills installed

`tg init --write` for Claude Code creates the five skills (`tg-docs`, `tg-graph`, `tg-trace`, `tg-impact`, `tg-audit`) under `.claude/skills/`.

## OpenSpec skill patching

How `tg init` makes OpenSpec's own skills and commands tg-aware.

### Skills patched

OpenSpec's apply skill and `/opsx:apply` command end with a `<!-- tg:begin -->` block naming `implements` and `verifies`, their original text is a prefix of the result, and an unrelated OpenSpec skill is untouched.

### Re-run is stable

A second `tg init --write` reports nothing to change and each file keeps exactly one block.

### Regenerated skill

After OpenSpec rewrites a skill without the block, the next run appends it again and keeps the new upstream text.

### Opt out

`--no-openspec` leaves OpenSpec files byte-identical.

### Skills only

`--skills-only` changes only files under `.claude/skills/` and `.claude/commands/`, leaving a lat.md instruction block, hooks and the ontology alone.

### Other agent's skill

An OpenSpec skill in Cursor's `.cursor/skills/` gets the tg block when Cursor is set up, keeping its original text as a prefix.

### Patch text printed

`tg gen openspec-apply.md` prints the apply block and `tg gen impact-skill.md` the impact skill.

## Code ontology

The shared vocabulary that `tg init` installs.

### Ontology installed

`tg init --write` creates `lat.md/code-ontology.md`, the schema `Types/code-types.md` with a `template` link per type and six notes in `Templates/`, and `tg check` still passes.

The note is listed in the lat.md index, and the schema exports to SHACL from the default schema folder with six types, eleven edge types and no diagnostics.

### Ontology kept on re-run

An ontology note that already exists is never overwritten, so a project can edit its vocabulary and run `tg init` again.

### Ontology opt-out

`--no-ontology` writes neither the note, `Types/` nor `Templates/`.

### Old ontology folder noted

An `ontology/code-types.md` from an older `tg init` is left alone and reported in a note pointing to `Types/`.

## Agent selection

Which coding agents `tg init` sets up, and where their skills go.

### Several agents

`--agent claude,codex` writes both `CLAUDE.md` and `AGENTS.md` blocks and the five skills under both `.claude/skills/` and `.agents/skills/`.

### Checklist in a terminal

In a terminal the agent checklist has the detected agents ticked (Cursor, from a `.cursor` folder), and the agents left ticked are set up.

### No terminal

With `--json` nothing is asked and a project with no agent files gets Claude Code.

### Unknown agent

An unknown `--agent` id exits 2 with the accepted ids and writes nothing.

### Detected from OpenSpec

OpenSpec skills under `.agents/skills/` make Codex and generic agents detected; their shared skills folder and `AGENTS.md` are planned once, and the OpenSpec skill there is patched.

### Codex skills

`--agent codex` writes the five skills under `.agents/skills/` and an `AGENTS.md` block, and nothing for Claude Code.

### Pi detected

A `.pi` folder makes Pi the detected agent, with skills planned under `.pi/skills/`.

### Kilo Code and Oh My Pi skills

`--agent kilocode,oh-my-pi` writes the five skills under `.kilocode/skills/` and `.omp/skills/` and an `AGENTS.md` block.

## Setup parts

Choosing which parts `tg init` sets up or updates.

### Only the OpenSpec config

`--only openspec` changes only `openspec/config.yaml` and creates no instruction file.

### Skip instructions

`--skip instructions` installs skills without `CLAUDE.md`; an unknown part name exits 2.

### Parts checklist

In a terminal the parts checklist lists all five parts (the spec frameworks part named `specs`) with every part ticked, and only the ticked parts are written.

## Interactive setup

The confirmation step of `tg init` in a terminal.

### Confirmed

After the checklists a terminal run writes the files and lists each as created or updated, asking nothing more.

### Declined

Unticking every agent writes nothing; `--yes` skips the checklists and writes with the defaults.

### Dry run in a terminal

With `--dry-run` a terminal run still shows the checklists, then prints the diff and writes nothing.

## OpenSpec config rules

The tg rules `tg init` adds to `openspec/config.yaml`.

### Rules added

The project's schema, comment and own task rule survive, `tg:` rules for proposal, specs, design and tasks follow the project's rules, and the task rules ask for `implements`, `verifies` and `openspec:` frontmatter.

### Rules re-run is stable

A second run leaves the config untouched, and a stale `tg:` rule is replaced by the current wording.

### No OpenSpec

A project without `openspec/config.yaml` gets no `openspec/` files.

## Docs folder choice

How `tg init` picks the docs folder it creates.

### Asked in a terminal

With neither folder present, a terminal run asks once; picking `tg.md` creates `tg.md/tg.md` and writes instructions and skills that name `tg.md/`, and `tg check` passes.

### Flag for scripts

`--docs tg.md --write` creates `tg.md/tg.md` and `tg.md/code-ontology.md` and no `lat.md/`; an unknown folder name exits 2.

### Existing lat.md kept

With `lat.md/` present, `--docs tg.md` creates no `tg.md/` and notes that `lat.md/` is used; an existing folder is never asked about.

### Default without a terminal

Outside a terminal init asks nothing and plans `lat.md/lat.md`.
