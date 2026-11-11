---
type: Decision
openspec: [document-elements]
---
# Document Elements

How the inside of a document joins the typed graph: descriptions in the schema, declared XML elements and headings, element nodes with `#^id` addresses, and checks of a document's shape.

## Descriptions

A type, property, edge of a type, edge type, element and section may carry a `description`, so `tg ontology` explains the vocabulary to people and agents instead of listing bare names.

Read by [[packages/core/src/schema/schema.ts#readSchemaNote]] from TGS 0.4 on. A declaration without one reads exactly as in 0.3, because the key is left out rather than set to null. `tg ontology` prints each description under its name and `--json` includes it; the SHACL export writes `sh:description` ([[shacl#Export]]). The bundled code ontology describes every name it declares ([[code-ontology#Parts inside a section]]).

- motivated_by:: [[code-ontology#Rules of use]] {weight: primary}

## Element and section declarations

`elements` and `sections` sit in a type declaration next to `properties`, so the meaning of `<option>` in a Decision is written where Decision is declared.

`elements` maps a tag to a declaration (or a description string, or null): `description`, `type`, `required`, `many` (default true), `node`, `attributes` in the form of `properties`, and nested `elements`. `sections` maps a heading to `description` and `required`. [[packages/core/src/schema/schema.ts#readElementDeclarations]] and [[packages/core/src/schema/schema.ts#readSectionDeclarations]] read them, also from SHACL; [[packages/core/src/schema/schema.ts#mergeSchemas]] merges them across labels in order, which lets an ADR (`Decision` and `ADR`) take Decision's elements and add MADR's headings. Strict notes (0.3 or later) report unknown keys inside element declarations.

<option id="document-types" outcome="deferred">

A separate `documentTypes` key matched by path globs, for untyped files such as `SKILL.md` or `CLAUDE.md`. Deferred: lat.md files and spec nodes are already typed, and a third way to assign a type would need its own rules.

</option>

## Reading elements

A lenient line scanner finds block-level tags: an opening tag at the start of a line, a closing tag at the end of one, outside fences and frontmatter.

[[packages/core/src/elements/scan.ts#scanElements]] returns a tree with attributes, 1-based lines and inner text. Tags indented more than three spaces count only inside another element, text that is not attribute syntax (`<insert a summary>`) is not a tag, and a tag that is never closed becomes an empty element whose would-be content stays with its parent, so one stray `<br>` cannot swallow a document. Writers leave blank lines inside an element so CommonMark, and `tg check` with it, reads the Markdown and links between the tags. [[packages/core/src/elements/scan.ts#scanHeadings]] lists headings the same way.

## Element nodes

Only an element with an `id`, or one whose declaration gives it a `type` or `node: true`, becomes a node; every other element stays text in its section.

An `id` is an author asking for an address, and a declared `type` says the part is an ontology thing in its own right, such as a `<rule>` that is a Requirement. [[packages/core/src/elements/nodes.ts#isElementNode]] decides, [[packages/core/src/elements/nodes.ts#latElementNodes]] builds the nodes and [[packages/core/src/latmd/graph.ts#buildLatGraph]] adds them: label `Element` plus the declared types, properties `tag`, `element` (the id), `file`, `line`, `endLine`, `text` (at most 500 characters), `owner`, `title`, `description` and the attributes (an attribute that clashes with one of these is stored as `attr_<name>`). The innermost section, requirement, scenario or element node around it `contains` it. Typed edge lines and links written inside an element node start at the element, so a reason belongs to the option it explains. A node without an `id` gets `<file>#^<tag>-<n>`, never one of the file's explicit ids.

<option id="every-element" outcome="rejected">

Every declared element a node. Anonymous examples and given, when and then parts would fill queries with nodes that no question asks for.

- motivated_by:: [[code-ontology#Rules of use]]

</option>

## Addressing by id

An element with an `id` is addressed as `file#^id`, from docs and from `@lat:` and `@tg:` comments; `tg check` resolves the link and suggests the nearest id when it misses.

[[packages/core/src/latmd/index.ts#LatIndex#element]] looks ids up per file, ignoring case; the file is a full path or a unique short name, as for sections. The `#^` form follows Obsidian block references and survives moving the element to another section. Ids are unique per file: [[packages/core/src/latmd/check.ts#checkLattice]] reports a repeat, and links reach the first. lat.md does not know `#^`, so only projects that write element links can differ from `lat check`, and only on those links.

## Elements in spec files

Elements in OpenSpec, Spec Kit, Kiro, BMAD, GSD and ADR files belong to the requirement or scenario above them, or to the record for an ADR, and take their declarations from its labels.

[[packages/core/src/openspec/index.ts#SpecIndex]] scans each spec file once and keeps its text. A spec element is addressed through its document: `adr:0003#^redis` (any alias of the record) or `openspec:auth#^lockout` (any spelling of the group), resolved by [[packages/core/src/openspec/index.ts#SpecIndex#element]]. [[packages/core/src/elements/nodes.ts#specElementNodes]] makes the nodes. In a spec file only the typed edge lines inside an element node are read, because the rest of a spec belongs to its framework's format.

## Document shape validation

Each typed part of a document is checked against its type's merged `elements` and `sections`: required or single elements, required headings, attribute values and unclosed declared tags.

A part is an outermost typed section of a lat.md file (with its subsections), a spec requirement or ADR, or a whole typed note in a vault. [[packages/core/src/elements/validate.ts#checkDocuments]] serves `tg ontology check`; [[packages/core/src/elements/validate.ts#noteDocumentDiagnostics]] joins [[packages/core/src/validate/validate.ts#vaultDiagnostics]], so `tg validate` and the Obsidian plugin report the same findings. Codes: `missing-element`, `too-many-elements`, `missing-attribute`, `attribute-value-not-allowed`, `unclosed-element`, `missing-section`, all warnings. [[packages/core/src/graph/graph.ts#Graph#outline]] keeps each Markdown note's headings and elements for this, found in the same pass that indexes the note.

## Code ontology elements

The bundled code ontology describes every type, property and edge type and declares the parts its sections commonly hold; none is required, so existing docs stay clean.

Decision has `<option id outcome>` and `<consequence kind>`, Requirement `<rule>` (typed Requirement, so code can implement one rule), `<example>` with `<input>` and `<output>`, and `<non-goal>`, Scenario `<given>`, `<when>` and `<then>`, Constraint `<exception id until approved_by>`, and Concept `<example>` and `<counterexample>`. The spec framework ontology describes each framework label and gives ADR MADR's headings and `<option>`. The ADR template, the spec authoring guidance and the `tg-docs` and `tg-graph` skills teach when to use prose, an element, a heading or a separate section.

## Editors

The Obsidian plugin and the VS Code extension read the new keys and report document findings, but still draw one node per note; element nodes there are a follow-up.

The vault graph keeps the rule of [[graph-model#Nodes]]: a note is one node, and headings and blocks are not nodes. Element nodes exist in the `tg` graph that `tg cypher`, `tg ontology check` and the MCP tools query.
