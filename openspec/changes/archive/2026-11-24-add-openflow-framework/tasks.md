## 1. Core

- [x] 1.1 Add `openflow` to the framework registry and `locateSpecFile` (`docs/current/<capability>/`, `docs/changes/<change>/`)
- [x] 1.2 Add `parseOpenFlow` for frontmatter scenarios and requirement table rows; annotate it with `@tg: implements:: [[openspec:spec-frameworks#OpenFlow reader]]`

## 2. CLI

- [x] 2.1 Add the `SPEC_SETUPS` entry with ids and stage patch targets for OpenFlow skills and commands
- [x] 2.2 Detect `.openflow/` and `openflow.jsonc`; list spec files; offer the npm install with the `opencode.json` note
- [x] 2.3 Add the `BehaviorScenario` ontology fragment and share one `Capability` declaration
- [x] 2.4 Write the OpenFlow skill section `packages/cli/templates/specs/openflow.md` with per-phase guidance

## 3. Tests and docs

- [x] 3.1 Core tests for scenarios, requirement rows and pending changes; CLI test for detection, patching, `AGENTS.md` and trace
- [x] 3.2 Update `lat.md/tests/spec-frameworks.md`, `lat.md/cli.md`, the site's spec-frameworks page and home tabs
- [x] 3.3 `npm test`, `tg check`, `tg ontology check` and `tg trace spec-frameworks --gaps` pass
