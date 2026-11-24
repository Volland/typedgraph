## Why

OpenFlow (`@fastknife/openflow`) is an OpenCode plugin that adds governance to AI-driven development: behaviour scenarios per capability, a quality gate that wants evidence, and an archive step that promotes a change into the current facts. Its requirements live in `docs/current/<capability>/` and `docs/changes/<change>/`, and none of `tg`'s readers recognise them. A project that runs OpenFlow gets nothing from `tg trace`, and OpenFlow's skills never ask the agent to annotate code or tests.

## What Changes

- **OpenFlow reader.** `tg` reads `docs/current/<capability>/spec.md`. Each scenario in its frontmatter list (JSON as OpenFlow writes it, or YAML) becomes a `BehaviorScenario` requirement `openflow:<capability>#SC-001`, carrying its name, criticality and given/when/then. It also reads `requirements.md`: table rows whose first cell is an id (`R1`, `US-001`, `FR-001`) and `**FR-001**` items, with priority and acceptance as properties. Template rows that still hold `{{placeholders}}` are skipped. Folders under `docs/changes/` are pending, and `docs/archive/` is never read. OpenFlow's `docs/decisions/ADR-NNN-*.md` files were already read as ADRs.
- **Registry, detection and install.** The `openflow` id joins `--spec`. A project uses OpenFlow when it has `.openflow/`, `openflow.jsonc` or `openflow.json`. `tg init` offers `npm install --save-dev @fastknife/openflow` and explains how to enable the plugin in `opencode.json`.
- **tg steps in OpenFlow's skills.** The author block goes into `openflow-feature` and `openflow-brainstorm`, the plan block into `openflow-writing-plan`, and the implement block into `openflow-tdd` and `openflow-quality-gate`. The `openflow-feature` and `openflow-implement` commands get blocks too. OpenFlow rewrites its global skill copies on every start, so only project copies are patched. The instruction block in `AGENTS.md` carries the rules for each phase, including treating `tg trace --gaps` as quality-gate evidence and re-pointing links when a change is archived.
- **Ontology.** OpenFlow brings `BehaviorScenario` and shares `Capability` (now described for both OpenSpec and OpenFlow), `UserStory`, `FunctionalRequirement`, `NonFunctionalRequirement` and `part_of`.

## Capabilities

### Modified Capabilities
- `spec-frameworks`: a seventh framework with its reader, detection, install option, skill patching targets and ontology types.

## Impact

- `packages/core/src/openspec/frameworks.ts`: `parseOpenFlow`, scheme and locator.
- `packages/cli/src/specs.mts`, `packages/cli/templates/specs/openflow.md`: setup, detection, files, installer, ontology fragment and skill section.
- Site: the spec-frameworks page and the home page's framework tabs.
