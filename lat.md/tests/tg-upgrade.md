---
type: Scenario
openspec: [tg-upgrade]
lat:
  require-code-mention: true
---
# TG Upgrade Tests

Test specifications for [[cli#Updates and upgrade]]: the update check of `tg init` and `tg upgrade`, and refreshing an existing project.

## Update check

How `tg` learns about and offers a newer version.

### Newer versions only

Only a higher release version counts; prereleases and a development build never do.

### Continue with the running version

In a terminal a newer version is offered; picking the running one installs nothing and init carries on and writes.

### Install and run again

Picking the newer version installs it with npm, runs the same command with `--no-update-check`, returns its exit code and writes nothing itself.

### Under npx

When tg was started by `npx`, the newer version runs through `npx -y @typedgraph/cli@<version>` instead of being installed.

### No check for scripts

Outside a terminal, with `--yes`, `--no-update-check`, in CI, with `TG_NO_UPDATE_CHECK=1` or from a development build the registry is never asked.

### Up to date or offline

When the registry names the running version or does not answer, nothing is asked.

## Upgrade

How `tg upgrade` refreshes a project.

### Refreshes what was set up

An outdated skill is updated, a deleted tg skill comes back and the ontology is enriched; no `AGENTS.md` appears, a second run changes nothing and `tg ontology check` passes.

### Dry run and confirmation

`--dry-run` prints the diff and leaves the files alone; in a terminal the command asks before writing.

### No setup

A project without any tg setup is told to run `tg init`.

### Ontology edits kept

Enrichment adds the missing descriptions, elements and property descriptions, keeps the project's values, comments, own types and body, adds no removed type, sets `tgs` to the bundled version, and a second pass adds nothing.
