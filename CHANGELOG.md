# Changelog

All notable changes to the Typed Graph plugin, the `tg` CLI, the core library and the sidecar. The VS Code extension keeps its own [changelog](packages/vscode/CHANGELOG.md).

## Unreleased

### Added
- Graph view: the note's `type` is always the first property, schema info sections fold and have accent-coloured headings, and the mouse wheel over the controls panel scrolls it instead of the graph.
- Graph view details: one-line `type` field with the info icon inside, schema info as read-only fields (note properties with allowed values and default, outgoing and incoming edges from rules and `edgeTypes`), tags without `#`, a dimmed border on editable fields, and the pane keeps showing the followed note when the selected one is filtered out. Controls: visible scrollbars, filled funnel for filtered properties, Clear links only while property filters are set, links shown without brackets.
- Graph view: schema info behind an info icon on `type`, a button beside the gear that shows or hides the details pane, resizable text boxes, tag and dimmed missing-link styling, dropdown suggestions for links, tags and enum values, dotted read-only fields, a scrollable controls panel.
- Graph view details pane: compact form fields as wide as the pane, read-only look-alike in read mode, pen and link icons next to the note title, dropdown chevrons, clickable link chips with note suggestions in edit mode, locked `type`; `aliases`, `tags` and `path` are note properties.
- Graph view: Option/Alt-click on a node expands or collapses its neighbors; opening a note switches to its tab when it is already open.

- **Hiding an edge type hides orphaned nodes.** In the graph controls, unchecking an edge type now also hides the nodes that were connected only by hidden types. Nodes without edges and pinned nodes stay; the layout is unchanged.
- **Forces, pinning and controls for graphs.** Inline blocks and the Graph view now use a live force simulation with Obsidian's forces (centre, repel, link force, link distance) plus node-edge repulsion (a node lying across an edge is pushed off it) and label repulsion. Drag a node to pin it, shift-click toggles a pin, and the note holding a block (or followed by the Graph view) is pinned at the canvas centre. A gear button opens Display, Edge types (show or hide each type), Forces and Pins controls, and right-click opens a menu with pin, unpin, open, expand and re-center. Block headers take `forces:`, `display:`, `pin:` and `controls:` for initial values; "Copy as block options" turns the panel into those lines.
- Graph UI: `Simulation`, `parseForces`, `parseDisplay`, `parsePin`, `formatLayoutOptions` and the default settings are exported; `GraphRenderer` gains `layout`, `onContextMenu` and `onSettingsChange` options and pin, settings and edge-type methods; `buildStylesheet` takes optional display settings.
- **Graph view: remove and collapse.** The node menu has "Collapse neighbors", which drops the neighbors that hang off the node alone, and "Remove from view", which drops the node and those same neighbors. They stay out across refreshes until the followed note or query changes; expanding a node, or Restore removed in the controls, brings them back.
- **Graph view: filters.** A Node types section in the controls hides node types and, per type, keeps only nodes with checked property values: values of one property are alternatives, every filtered property has to match. A filter button next to a property in the details pane opens the same values as a menu.
- **Details pane.** An "Open note" button opens the note in a background tab without leaving the graph, "Only with values" hides empty properties, and "Edit" makes the properties editable in place (written to the frontmatter), with a dropdown for properties that list allowed values in the type's schema.

### Changed

- Graphs are no longer laid out once with `cose`: nodes keep moving until the layout cools, and default node size, link thickness and label fade are smaller. Right-click in the plugin opens the menu instead of expanding a node (use the menu or long-press); the VS Code webview still expands on right-click.

## 0.20.0 — 2026-10-16

### Added

- **Node subtitles.** A note's frontmatter `subtitle` is drawn after its title, as `spec — billing`, in the Graph view, inline graph blocks and the details panel, so many `spec.md` or `design.md` notes no longer show up as identical `spec` nodes. Unlike `title`, which replaces the file name everywhere including queries, `subtitle` only changes what the graph shows. A type's `visualization.label` property still wins.

## 0.19.1 — 2026-10-14

### Fixed

- The exported graph page opens its details panel with a CSS class instead of assigning styles, which the Obsidian community review reported as an error; an unused import was removed.

## 0.19.0 — 2026-10-14

### Added

- **AsciiDoc notes.** `.adoc` files are typed notes in every host. Properties come from a leading `////` comment block (YAML, as frontmatter) and `:tg-*:` header attributes, with the block winning; typed edges are written only in comments, as `// @tg: cites:: [[Source]] {page: 12}` lines or in `////` blocks that start with `@tg`, so Asciidoctor renders each file exactly as before. A comment above a heading belongs to that section and the edge records it as `section`. `xref:` and `<<…>>` become `links_to` edges when link edges are on, `include::` becomes an ordered `includes` edge (with `leveloffset`, `tags` and `lines`; a source file include ends at its code node), and sections get heading-path ids with the explicit and generated AsciiDoc ids as aliases. A test-only oracle (`@asciidoctor/core`) pins render safety, ids and section trees.
- **Hosts.** Obsidian, the VS Code extension and the sidecar index `.adoc` files by default, with a setting (`typegraph.asciidoc`, the plugin's *AsciiDoc notes*, `OBSIGRAPH_ASCIIDOC=0`) to turn it off; the plugin reads them through the vault and does not register itself as their editor. `tg` reads the files matched by `notes` in the new committed `.tg/config.json`: `tg check` reports broken includes, cross references and source links, ambiguous links and unreadable property blocks, warns about edge syntax that would render and about `.adoc` files in `lat.md/`; `tg locate`, `section`, `search` and `cypher` reach them. `tg init` proposes the globs when it finds `.adoc` files and writes a `.tg/.gitignore` that ignores only the vector cache.
- A bare link now matches `.md` and `.adoc` notes; when both exist it is reported as ambiguous and resolves to neither, and a link with an extension names that file. New typed notes take the format of their type's template, so an `.adoc` template creates an `.adoc` note.
- **TGS 0.3** defines a note as a Markdown or AsciiDoc file and documents the AsciiDoc forms; it adds no schema key. TGS 0.2 is archived unchanged.

### Changed

- `.adoc` files are no longer scanned as source code by `tg`. Only `@tg:` comments in them were read before; with a `notes` glob those comments now make edges with section anchoring, and without one they are ignored.
- The OKF export skips `.adoc` notes, lists each in the report and writes links to them as plain text. Schema notes stay Markdown and `{{edge:}}` embeds are not expanded in `.adoc`.
- The vector cache's `.tg/.gitignore` now ignores `vectors.json` and `vectors.f32` instead of everything, so `.tg/config.json` can be committed.
- `listMarkdown` in `node-vault` is deprecated in favor of `listNotes`, which also lists `.adoc` files.

## 0.18.1 — 2026-10-14

### Fixed

- `tg migrate` read cue words from the whole sentence around a link, so in a long sentence a "because" about something else could turn an unrelated link into `motivated_by`. Cues now count only in the clause that holds the link: its parenthesized group, or the part between colons.
- `tg init --migrate` and `tg migrate` left the lat block in `CLAUDE.md` or `AGENTS.md` when an earlier `tg init` without `--migrate` had already added a tg block next to it. They now remove the stale lat block and keep one tg block.

## 0.18.0 — 2026-10-14

### Added

- **`tg migrate`** turns a lat.md project into an ontology-aware tg project in one pass. It swaps the agent setup like `tg init --migrate`, types docs files whose path names their kind (`decisions.md` → Decision, `constraints.md` → Constraint, `tests/` → Scenario, ...) or whose sections are SHALL statements, and turns each plain link whose sentence names the relation into a typed edge line: the candidates come from the project ontology, the choice from cue words in the sentence (`because` → `motivated_by`, `replaces` → `supersedes`, MUST → `constrains`). Edges get the metadata their type declares: `since` from `git blame`, `strength` from MUST or should, `level` from test paths. `@lat:` comments become `@tg: implements::` or `verifies::` by the target's type (`--keep-lat` keeps them). It never guesses: links it cannot decide are reported with their sentence and candidates (`--infer` applies single candidates without a cue). It writes by default, `--dry-run` previews, files with uncommitted changes are refused unless `--force`, and a second run changes nothing.
- **`tg-migrate` skill**, installed by `tg init` for every agent: runs the deterministic pass, then has the agent type the remaining files and resolve each leftover link by reading its sentence, choosing the relation and its properties from the text, and finishing with `tg check`, `tg ontology check` and `tg trace`.

## 0.17.0 — 2026-10-14

### Added

- **Typed edges in docs.** A line `- motivated_by:: [[constraints#GDPR]] {since: 2}` after a section's leading paragraph is now a named edge with its sign and properties in `tg cypher`, from that section to a section, an OpenSpec requirement or scenario, or code. Before, it was reduced to a plain `references` link. The line is still an ordinary wiki link, so `tg check` and lat.md see no difference.
- **`tg ontology`** lists the project's ontology from `Types/`: types with their properties and allowed edges, edge types with endpoints and properties. **`tg ontology check`** reports typed edges in docs and code with an undeclared name (suggesting the closest one), a disallowed source or target type, or an undeclared or out-of-range property. Both are also the MCP tool `tg_ontology`.
- The bundled code ontology declares properties on every edge type: `since`, `confidence` and `note` on `implements`, `level` on `verifies`, `reason` on `contradicts` and `supersedes`, `weight` on `motivated_by`, `strength` and `source` on `constrains`, `strength` on `depends_on`, `date` on provenance edges. Projects set up earlier keep their own `Types/code-types.md`; copy the new properties from `tg gen ontology-schema.md` if you want them.

### Changed

- **Agents now write the docs as a typed graph.** The instruction block in `CLAUDE.md`/`AGENTS.md`, the Cursor rules, all five skills, the ontology guide and the OpenSpec skill patches teach one loop: run `tg ontology` to learn the project's types and edge names (including ones the project added), type each docs file, write relations as typed edge lines with properties, record decisions and constraints as `Decision` and `Constraint` sections, and finish with `tg check` and `tg ontology check`. The OpenSpec config rules ask for the same in every proposal, design and task list.

## 0.16.2 — 2026-10-14

### Changed

- **The `tg` package has a README on npm.** It explains what `tg` does and why, compares it with lat.md (including where lat.md is stronger), lists the nine coding agents `tg init` sets up and every command, and links to the website and articles. The package now links its homepage, repository and issues.
- The website and articles describe the current `tg init`: it asks which agents to set up and writes the files, with `--dry-run` to print the diff, and they link to the npm package. The tg and lat.md comparison is updated for the agent list and the nine MCP tools.

## 0.16.1 — 2026-10-14

### Changed

- **`tg init` writes by default.** It writes its files and lists each one it created or updated; `--dry-run` prints the diff instead and writes nothing. In a terminal the checklists are the review, so there is no extra "Write N files?" question. `--write` is still accepted and changes nothing, so existing scripts and the VS Code setup button keep working, and `--migrate` no longer needs it.

### Fixed

- **`tg init` wrote into a parent folder.** It looked upward for an existing project and set that one up instead of the folder you ran it in, so a `lat.md/` anywhere above (for example a clone of the lat.md tool's own repository next to your projects) received `CLAUDE.md`, `.claude/`, `Types/` and `Templates/`. `tg init` now always sets up the folder it runs in, or the folder you pass.
- A `lat.md/` or `tg.md/` folder that is its own git repository no longer counts as a project's docs folder for any command.

### Added

- `tg init` sets up three more coding agents: Kilo Code (`--agent kilocode`, skills in `.kilocode/skills`), Pi (`pi`, `.pi/skills`) and Oh My Pi (`oh-my-pi`, `.omp/skills`), each detected from its folder and given the `AGENTS.md` block.

## 0.16.0 — 2026-10-14

### Added

- **`tg init` setup for any coding agent.** In a terminal, `tg init` is now a short setup: tick your coding agents (Claude Code, Codex, Cursor, GitHub Copilot, OpenCode, or any `AGENTS.md` agent; the ones it detects, including those OpenSpec set up, come ticked), tick what to set up or update (agent instructions in `CLAUDE.md`/`AGENTS.md`/Cursor rules, Claude Code hooks and MCP, skills, OpenSpec, code ontology), review the files and confirm. `--agent claude,codex`, `--only`, `--skip` and `--yes` give scripts the same choices; outside a terminal nothing is asked and `--write` is still required.
- **Skills for every agent.** The five tg skills are installed into each selected agent's skills folder (`.claude/skills`, `.agents/skills`, `.cursor/skills`, `.github/skills`, `.opencode/skills`), and OpenSpec skills in those folders get the tg block.
- **`tg.md/` as the docs folder.** Teams that don't use lat.md can keep their docs in `tg.md/`. An existing `lat.md/` always wins, so lat.md projects are unchanged; otherwise every command, hook and the MCP server read `tg.md/` (root index `tg.md/tg.md`, ids like `tg.md/auth#Auth#Login`). `tg init` asks which folder to create when there is none, or takes `--docs lat.md|tg.md`, and writes instructions and skills that name it. The Obsidian plugin reads `tg.md/` folders in place, and the VS Code extension treats either folder as set up.
- **OpenSpec annotates what it generates.** When `openspec/config.yaml` exists, `tg init` adds `tg:` rules for proposals, specs, designs and tasks, so every task list OpenSpec writes includes `implements` annotations on code, `verifies` annotations on tests, the capability in the lat.md docs' `openspec:` frontmatter, and a closing `tg check` and `tg trace`. Your own rules and comments are kept, and re-runs replace only the `tg:` rules.

### Changed

- **Code ontology in `Types/` with templates.** `tg init` writes the code ontology's schema to `Types/code-types.md`, the schema folder the Obsidian plugin, VS Code's New Typed Note and `tg validate` read, instead of `ontology/code-types.md`, and adds a template note per type in `Templates/` (Decision, Requirement, Scenario, Constraint, Concept, Change). An old `ontology/code-types.md` is left alone with a note.

## 0.15.1 — 2026-10-13

### Changed

- The plugin now requires Obsidian 1.8.7 or later. The Graph view details panel remembers its width and toggles with `App.loadLocalStorage` and `saveLocalStorage`, which Obsidian added in 1.8.7, so the declared minimum was too low and the community plugin check flagged it.

## 0.15.0 — 2026-10-13

Thanks again to [@ma-be](https://github.com/ma-be) (Martin Bergner), who contributed both changes in this release: [#5](https://github.com/Volland/typedgraph/pull/5) and [#4](https://github.com/Volland/typedgraph/pull/4).

### Added

- **Frontmatter links as edges.** With the new `frontmatterEdges` graph option, a wikilink or markdown link in a frontmatter property becomes an edge typed by the property name, so `requirement: "[[Login]]"` reads as `requirement:: [[Login]]` and schema `edgeTypes` check it. Text, numbers, `[[]]` placeholders and `tags`, `aliases`, `cssclasses`, `type` and `types` give no edges. Off by default; the plugin has a "Frontmatter links as edges" setting that re-indexes the vault, and `tg validate --frontmatter-edges` applies it to validation. ([#5](https://github.com/Volland/typedgraph/pull/5), by @ma-be)
- Core: `frontmatterEdges()`, `FRONTMATTER_EDGE_SKIP`, `ParseOptions.frontmatterEdges` and `ValidateOptions.frontmatterEdges` are exported.

### Fixed

- **`view: graph` blocks crashed on every render** with "Cannot read properties of undefined" (#3). The block rendered before its container was attached and sized, so Cytoscape ran its default layout on an empty graph in a zero-width container. The renderer now starts with the `null` layout and the block's first render waits one animation frame, cancelled if the block unloads first. ([#4](https://github.com/Volland/typedgraph/pull/4), by @ma-be)

## 0.14.0 — 2026-10-13

Thanks to [@ma-be](https://github.com/ma-be) (Martin Bergner) for the details panel work in [#6](https://github.com/Volland/typedgraph/pull/6), the first outside contribution.

### Added

- **Graph view details panel.** Drag the handle between the graph and the panel to set its width (remembered per device); long values wrap. Rows are split into the note's own properties, listed first, and technical rows (labels, stub, path, style, edge sign, id and heading, and properties the schema does not declare), which a Technical toggle shows. Wikilinks and markdown links in values are clickable and open the note, one list item per line, with a Links toggle for the old plain text. ([#6](https://github.com/Volland/typedgraph/pull/6), by @ma-be)
- Graph UI: `Details` gains `technical`, `values` and `source`, `nodeDetails` and `edgeDetails` accept the declared property names, and `valueLines` splits a value into text and link parts.

## 0.13.0 — 2026-10-11

### Added

- **Edge notes.** A note with frontmatter `type: edge`, `from`, `to` and `edgeType` declares one edge instead of a node, so a relationship can have a body, Properties panel fields and a row in Bases. Its other frontmatter fields are edge properties, a `-` prefix on `edgeType` makes it negative, and its id is the note's path unless `id` pins one. Every graph view draws it as an edge between its endpoints, and opening an edge note shows that edge. Schema findings, edge details and VS Code backlinks point at the edge note. A missing field, or a link to an edge note (which is not a node), gives an `edge-note` finding.
- Core: `GraphEdge.file` names the edge note that declared an edge; `Graph.declaredEdges` and `isEdgeNote` are exported.

## 0.12.0 — 2026-10-11

### Added

- **`tg validate`.** Validates a vault against its schema notes without Obsidian, with the same findings as the plugin's diagnostics list: edge syntax, TGS declaration diagnostics, schema validation, style values and edge embeds. Every finding has a stable code and a severity (declaration problems are errors, the rest warnings); `--strict` fails on warnings, `--only` and `--ignore` filter by code, `--schema-only` checks just the schema notes, and `--json` or `--format sarif` (SARIF 2.1.0) feed scripts and GitHub code scanning.
- Core: `Diagnostic` gains an optional `code`, and `validateVault`, `vaultDiagnostics`, `toFindings` and `severityOf` are exported. The plugin's diagnostics list now comes from the same function.

### Changed

- The Graph view's ribbon button and tab use a custom "TG" icon instead of Lucide's `git-fork`, so they don't look like the core Graph view.

## 0.11.0 — 2026-10-08

### Added

- **Three advanced skills (`tg init`).** `tg-trace` links OpenSpec requirements to code, tests and docs and runs the trace; `tg-impact` finds the requirements, scenarios, tests and docs a code change touches, before and after the edit; `tg-audit` audits specs against code and turns drift into an OpenSpec change and annotations. `tg-graph` now covers `Requirement` and `Scenario` nodes.
- **OpenSpec skills become tg-aware.** When OpenSpec's propose, apply, archive or explore skills (`.claude/skills/openspec-*`) or `/opsx` commands exist, `tg init` appends a `<!-- tg:begin -->` block with the tg steps for that stage: stable requirement names when proposing, `implements` and `verifies` while applying, `tg trace --gaps` and `tg check` around archiving. Re-running after `openspec update` restores the block; `--no-openspec` skips it.
- `tg init --skills-only` writes only the skills and OpenSpec blocks, for projects that keep their own instruction files and hooks. `tg gen` prints every skill and block.

## 0.10.0 — 2026-10-08

### Added

- **OpenSpec traceability (`tg`).** `tg` reads `openspec/specs/` and open changes, and code and tests point at requirements and scenarios with `@tg: implements:: [[openspec:<capability>#<Requirement>]]` and `@tg: verifies:: [[openspec:<capability>#<Requirement>#<Scenario>]]`. A `@tg:` comment above `it(...)` attaches to that test and records its name. lat.md files list the capabilities they explain as `openspec: [...]` in frontmatter.
- **`tg trace [capability...] [--gaps] [--strict] [--json]`** reports, per requirement, the implementing code, the tests that verify each scenario and the explaining docs; `--strict` exits 1 on gaps, for CI. `tg cypher` gains `Requirement` and `Scenario` nodes, and the MCP server a `tg_trace` tool.
- `tg check` rejects `openspec:` targets and frontmatter entries that do not resolve, with a did-you-mean suggestion. Missing traceability is never a check finding.
- Sidecar MCP `vector_search` accepts the `then` follow-up query, `mode` and `backend`, as REST does.
- Specs for typed note creation, the ontology gallery, the plugin install check and the example vault; the requirements of every capability were audited against the code and realigned.

### Fixed

- **Embedding dimension change.** Search and retrieve refuse with a rebuild message when the active model's vector size differs from the index, instead of scoring with NaN; `cosine` throws on vectors of different length. Retrieve flags a stale index like search does.
- **Unresponsive embedding provider.** Requests time out after 30 seconds (`OBSIGRAPH_EMBED_TIMEOUT_MS`), so `tg search` falls back to lexical results instead of hanging. Empty or uneven-length vectors are rejected as a bad response.
- **Key precedence.** `TG_EMBED_KEY`, `TG_EMBED_KEY_FILE` and `TG_EMBED_KEY_HELPER` now win over the `LAT_LLM_KEY*` aliases.
- **SHACL import** warns when a template body cannot be written to an existing note instead of dropping it.
- **Ladybug mirror.** A corrupt database is discarded and rebuilt instead of stopping the sidecar, and a failed sync is reported instead of serving the old snapshot.
- **Cypher.** List and pattern comprehensions, map projections, pattern predicates and `EXISTS`/`COUNT`/`COLLECT {}` subqueries are reported as unsupported by name, not as syntax errors, and pass through to Ladybug. A variable-length relationship variable is a list column.
- `retrieve` caps its total returned text and sets `truncated`; the sidecar MCP server reports its real version.
- `tg section`, `refs` and `expand` print one JSON document under `--json` when nothing matches.

## 0.9.1 — 2026-10-08

### Fixed

- **Community review findings (plugin).** `main.js` no longer contains dynamic code: the build replaces the `Function('return this')()` fallback that cytoscape inlines from lodash, and the Cypher evaluator's `eval` method is renamed `evaluate`. Three lint warnings in the core library are fixed (an unneeded non-null assertion, `globalThis.crypto`, an untyped `Map`).

### Added

- **Install check.** `npm run check:install` (`scripts/check-plugin-install.mjs`) repeats Obsidian's installer downloads against the latest release. It runs as the last release step and every six hours in `.github/workflows/install-check.yml`.
- OpenSpec proposal for AsciiDoc notes (`openspec/changes/asciidoc-notes`).

## 0.9.0 — 2026-10-08

### Added

- **Typed Graph Schema 0.2: ids and template tokens.** A type can declare `id` rules (`uuid`, time-ordered `uuid7`, `timestamp`, `luhmann`), each stored in its own property, with `auto` and `filename` options. Templates may use `{{title}}`, `{{date}}`, `{{time}}`, `{{id}}`, `{{<id property>}}`, `{{parent}}`, `{{parent-id}}` and `{{parent-link}}`. TGS 0.1 stays published; every 0.1 schema note is valid 0.2.
- **New typed note menu (plugin).** The command *New typed note*, a ribbon menu with one entry per type, and *New typed note here* in the folder menu replace *Create note from type*. *New child note*, *New sibling note* and *New top-level note* create Luhmann ids from the active note.
- **Zettelkasten ontology.** Fleeting, literature, permanent, structure and project notes, book and article sources with writers, highlights and topics, a `uid` for every type, optional Luhmann ids on permanent notes, one template per note type and new examples. *Breaking for existing users of the gallery ontology:* `Zettel` and `stage` are replaced by the note types, and `Source` by `BookSource` and `ArticleSource`.
- **Website.** New home page, Agents, Obsidian, Teams, Install and Compare pages, launch articles, demo clips, and on the ontology page a Zettelkasten walkthrough and schema maps of every ontology.

### Changed

- The core library, `tg` and the sidecar read TGS 0.2; `tg` itself has no new commands.

## 0.8.0 — 2026-10-07

### Added

- **Code ontology in `tg init`.** `tg init --write` now also writes `lat.md/code-ontology.md`, a guide to six intent types (Decision, Requirement, Scenario, Constraint, Concept, Change) and eleven edge types (`implements`, `verifies`, `-contradicts`, `supersedes`, `motivated_by`, `constrains`, `refines`, `depends_on`, `defines`, `introduced_by`, `changed_by`), and `ontology/code-types.md`, the same vocabulary as a TGS schema that exports to SHACL (`tg schema export shapes.ttl --schema-folder ontology`). The note is appended to the lat.md index; neither file is overwritten on a later run. `--no-ontology` skips both, and `tg gen ontology.md` / `ontology-schema.md` print them.
- **File types label sections.** A `type:` in a lat.md file's frontmatter (scalar, inline list or block list) labels every section below the title, so `tg cypher` can match `(s:Requirement)` or `(s:Decision)`.
- **Ontology gallery.** `ontologies/` holds four downloadable ontologies as plain Markdown vaults (Zettelkasten, book management, requirements and coding, prompts and agents) plus a shared `core` that declares edge types several of them use, so they can be combined. The website has a gallery page with downloads and usage (`ontologies.html`; zips built by `npm run site:ontologies`) and an article on composing ontologies with a shared core, multi-label notes and mixins.
- Articles: the coding-ontology article is extended and a new one covers using the ontology by role.

### Changed

- The agent instruction block and the `tg-graph` skill mention the ontology vocabulary.
- `.gitignore` skips the rendered `articles/*.html`, whose code samples contain `@tg:` examples that `tg check` read as real annotations.

## 0.7.1 — 2026-10-06

Fixes for the community review of 0.7.0.

### Changed

- Release assets `main.js` and `styles.css` carry GitHub build-provenance attestations.
- Lint cleanups: unnecessary regex escapes, a control character in the SHACL exporter's IRI escaping, redundant type assertions, and an inline style in the VS Code graph webview.

## 0.7.0 — 2026-10-06

Typed Graph Schema (TGS) 0.1 and SHACL interop. See [An ontology you can edit by hand](https://typedgraph.org/blog-typed-graph-schema.html) and the [specification](https://typedgraph.org/spec/tgs/v0.1/).

### Added

- **Several types in one schema note.** `schemas:` declares any number of types, so one note can describe a whole subsystem; `schema:` (the type named by the note title) still works and both can be combined. A type declared twice uses the first by path and reports both notes.
- **Edge types.** `edgeTypes:` declares an edge type with `from`, `to`, its own `properties`, `uri` and `visualization`. Edge properties, required edge properties and edge endpoint types are validated.
- **Richer edges and properties.** `edges` accepts a map (`worksAt: Company`, or `{target, many, required}`); properties gain `many`, `values` and `uri`, and the kinds `datetime` and `list`. IRIs and CURIEs with built-in and declared prefixes, and a `tgs:` version key.
- **Templates.** A type can link a template note with `template:`; a type with no template gets one generated from its schema.
- **SHACL.** `tg schema export <out.ttl>` and `tg schema import <file.ttl>`, and the plugin commands *Export schemas as SHACL* and *Import SHACL shapes*. Export is deterministic and round-trips losslessly; import reports every construct outside the supported subset and never deletes notes. New setting: Schema base IRI.
- **An open specification.** [TGS 0.1](https://typedgraph.org/spec/tgs/v0.1/) with a JSON Schema, conformance examples and the `tgs:` namespace page.

### Changed

- An `edgeTypes` entry's `visualization` styles that edge type and wins per attribute over a type's `visualization.edges`.
- Schema `edges` are now rules internally; code that used `TypeSchema.edges` as a string list should use `edgeNames()`.

## 0.6.0 — 2026-10-06

Open Knowledge Format (OKF v0.2) compatibility. See [Getting your vault OKF-ready](https://typedgraph.org/blog-okf-ready.html).

### Added

- **Markdown link targets in edges.** `knows:: [Bob](/people/bob.md) {since: 2020}` is a typed edge, alone or mixed with wikilinks. Paths from the vault root (`/x.md`) and relative paths (`./x.md`, `../x.md`) resolve, percent escapes are decoded, and links to web pages are never edges. Works in the plugin, the sidecar and the CLI.
- **`tg export <out> --format okf`.** Writes a conformant OKF bundle. Wikilinks become markdown links from the bundle root, and typed edge lines keep their type, sign and properties, so tg reads the bundle back into the same graph. Every concept gets a string `type` (`--default-type`, default `Note`), plus a `title` and `description` when missing. Notes named `index.md` or `log.md` are renamed, embedded attachments are copied, and every folder gets an `index.md` (only the root one declares `okf_version: "0.2"`). The command prints a change report and verifies the output.
- **`tg okf check [dir]`.** Checks any folder against OKF conformance. It exits 1 only on conformance errors; broken links, wikilinks and missing descriptions are warnings. Supports `--json`.
- **Plain link edges (opt-in).** With `OBSIGRAPH_LINK_EDGES=1`, the sidecar turns every plain link in prose into an untyped `links_to` edge, which is how OKF reads links, so third-party bundles load as connected graphs. It is off by default.

### Changed

- A non-empty frontmatter `title` now becomes the node's `title`; before, the file name always overwrote it.
- A frontmatter `types` list adds node labels after those from `type`.
- The CLI bundle now loads bundled CommonJS dependencies through `createRequire`.

## 0.5.0 — 2026-10-04

- The `tg` CLI: a drop-in replacement for lat.md with typed `@tg:` code annotations, openCypher over docs and code, lexical search, agent setup, and `export` / `import`.
- The code layer: annotated source symbols as graph nodes in the plugin and the CLI.
- lat.md folders read in place inside an Obsidian vault.
