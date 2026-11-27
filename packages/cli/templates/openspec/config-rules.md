# tg rules for openspec/config.yaml

`tg init` adds each list item below to the `rules` of the artifact named by its heading, prefixed `tg:` so later runs replace only these.

## proposal

- Run `tg ontology` and use its type and edge names throughout. Under Impact, list the lat.md sections this change touches (find them with `tg search`), the decisions and constraints that bind the area (`tg cypher` over `motivated_by`, `constrains` and `contradicts` edges), and the requirements it adds or modifies as `[[openspec:<capability>#<Requirement>]]`.

## specs

- Give every requirement a stable, unique name: code, tests and docs cite it as `[[openspec:<capability>#<Requirement>]]`, and a renamed requirement breaks those links.
- Give every scenario a unique name within its requirement; tests cite it as `[[openspec:<capability>#<Requirement>#<Scenario>]]`.

## design

- Write each decision so it can become a lat.md `Decision` section: the choice, the alternatives rejected, and its reasons as named relations from `tg ontology` (`motivated_by` a constraint or concept, `supersedes` an earlier decision), linking the sections with `[[section]]` references.
- Name the external rules the design must respect as constraints, with what each binds, so they can become `Constraint` sections with `constrains` edges.

## tasks

- For each requirement, include a task to annotate the code that implements it with a comment `@tg: implements:: [[openspec:<capability>#<Requirement>]]` on the line above the function, class or file, with properties such as `{confidence: partial}` when they apply.
- For each scenario, include a task to annotate the test that proves it with a comment `@tg: verifies:: [[openspec:<capability>#<Requirement>#<Scenario>]]` directly above the test call.
- Include a task to record the design's decisions and constraints in lat.md as typed sections (`type: Decision`, `type: Constraint`) with typed edge lines such as `- motivated_by:: [[constraints#<Constraint>]]` and `- constrains:: [[openspec:<capability>#<Requirement>]] {strength: must}`, using only edge names `tg ontology` lists.
- Include a task to update the lat.md section that explains each capability and list the capability in that file's `openspec:` frontmatter.
- End with a task to run `tg check`, {{if:lat-integration}}`lat check`, {{end}}`tg ontology check` and `tg trace <capability> --gaps` and close every gap they report.

<!-- Write annotation examples without a comment marker in front of the at-sign: tg check scans openspec/config.yaml as code and would read them as real annotations. -->
