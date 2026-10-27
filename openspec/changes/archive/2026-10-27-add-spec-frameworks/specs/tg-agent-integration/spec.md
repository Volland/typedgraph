## MODIFIED Requirements

### Requirement: Setup parts
`tg init` SHALL set up any of five parts:
- `instructions`: the tg block in `CLAUDE.md` or `AGENTS.md`, or Cursor's rules file.
- `hooks`: Claude Code hooks and the `tg` MCP server.
- `skills`.
- `specs`: the spec framework step, framework skill patches, OpenSpec config rules and framework scaffolds; `openspec` is accepted as an older name for it.
- `ontology`.

`--only` and `--skip` SHALL take comma-separated part names. `--no-ontology` and `--no-openspec` SHALL skip the `ontology` and `specs` parts. `--skills-only` SHALL mean `skills` and `specs`. Without any of these flags, an interactive setup SHALL show a checklist of the parts with all ticked; otherwise every part SHALL be set up. An unknown part name SHALL be an error.

#### Scenario: Only the OpenSpec config
- **WHEN** a project has `openspec/config.yaml` and `tg init --only openspec --write` runs
- **THEN** only OpenSpec files change and `CLAUDE.md` and `AGENTS.md` are not created

#### Scenario: Skip instructions
- **WHEN** `tg init --skip instructions --write` runs
- **THEN** no `CLAUDE.md` or `AGENTS.md` is created and the skills are installed

#### Scenario: Parts checklist
- **WHEN** an interactive `tg init` runs in a project without `openspec/`
- **THEN** the parts checklist shows every part ticked, including `specs`
