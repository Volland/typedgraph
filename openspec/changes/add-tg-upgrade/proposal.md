## Why

`tg init` copies instructions, skills, hooks and an ontology into a project, but nothing brings later improvements there: a project set up with 0.20 keeps the 0.20 skills and a code ontology without descriptions or elements, and its owner learns about a new `tg` only by chance. Running `tg init` again works only if the person remembers to update the CLI first and repeats the choices made the first time.

## What Changes

- `tg init` and the new `tg upgrade` ask npm for the newest `@typedgraph/cli` when a person is at a terminal. When it is newer they offer to install it (or, under `npx`, to run it) and run the same command again with it, or to continue with the running version. Scripts, `--yes`, `--json`, CI and `--no-update-check` never reach the network.
- New command `tg upgrade [dir] [--dry-run] [--yes] [--no-update-check]` refreshes what an earlier `tg init` set up, judged by the files it left: the tg block in the instruction files, the tg skills (including skills added since), the hooks and MCP entry, the steps in spec framework skills and the spec ontology. It lists every file it would change, asks before writing in a terminal, prints the diff with `--dry-run`, and adds nothing the project never chose.
- The project's own `Types/code-types.md` is never overwritten: a declaration both it and the bundled ontology have gains the `description`, `elements` and `sections` it lacks, its properties gain their descriptions, and `tgs` moves to the bundled version. The docs' `code-ontology.md` guide is only compared, with a note when it differs.

## Capabilities

### New Capabilities
- `tg-upgrade`: the update check shared by `init` and `upgrade`, consent to install, project refresh and ontology enrichment.

### Modified Capabilities

None.

## Impact

- `packages/cli`: `update.mts` (registry lookup, version comparison, consent and relaunch), `commands/upgrade.mts`, `init` calls the update check, `Io` gains `latestVersion` and `version` so tests never touch the registry.
- `lat.md/cli.md` and a test spec; the changelog.
