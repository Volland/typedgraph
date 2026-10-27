## 1. Core readers and index

- [x] 1.1 Add `packages/core/src/openspec/frameworks.ts` with the framework registry, `locateSpecFile` and readers for Spec Kit, Kiro, BMAD, GSD and ADRs; annotate each reader with `@tg: implements:: [[openspec:spec-frameworks#<Reader>]]`
- [x] 1.2 Generalize `SpecIndex` to many schemes, aliases, flat records, `entries()` and `frameworks()`; annotate with `@tg: implements:: [[openspec:spec-frameworks#Framework ids]]`
- [x] 1.3 Read `specs:` frontmatter, treat decision records as verified in `traceRequirements`, add framework labels, properties and relations in `buildLatGraph`, and check `specs:` entries in `checkLattice`

## 2. CLI registry, detection and trace

- [x] 2.1 Add `packages/cli/src/specs.mts`: detection, file discovery, install options, ontology fragments, `forSpecs` and `forStage`
- [x] 2.2 Read every detected framework in `Project.specIndex()`; group, filter and retire rows across frameworks in `tg trace`
- [x] 2.3 Give agents their command folders and Spec Kit integration keys

## 3. Init wizard

- [x] 3.1 Rename the `openspec` part to `specs` with an alias; tick every part in the checklist
- [x] 3.2 Add the spec framework checklist with detection and recommendation (`--spec`)
- [x] 3.3 Run installers through `Io.exec` with consent (`--install-spec`), before planning
- [x] 3.4 Patch framework stage skills and commands; write Kiro steering and the ADR scaffold
- [x] 3.5 Write the composed `Types/spec-types.md`

## 4. Templates and skills

- [x] 4.1 Add framework sections, stage blocks, Kiro steering and ADR templates under `packages/cli/templates/specs/`
- [x] 4.2 Fill `tg-trace`, `tg-audit`, `tg-graph`, `tg-impact`, `tg-docs`, the instruction block and the Cursor rules per framework; expose the new texts through `tg gen`

## 5. Tests

- [x] 5.1 Annotate a test for every scenario of `spec-frameworks` with `@tg: verifies:: [[openspec:spec-frameworks#<Requirement>#<Scenario>]]`, and update the tests of the modified `tg-agent-integration#Setup parts`
- [x] 5.2 Update existing tests whose messages or defaults changed

## 6. Docs and checks

- [x] 6.1 Record the decisions in `lat.md/cli.md` (Requirement trace, Agent integration, Code ontology) with typed edges, add the `spec-frameworks` capability to the `openspec:` frontmatter, and add `lat.md/tests/spec-frameworks.md` with a section per test
- [x] 6.2 Run `tg check`, `tg ontology check`, `tg trace spec-frameworks --gaps`, `openspec validate add-spec-frameworks --strict` and the full test suite
