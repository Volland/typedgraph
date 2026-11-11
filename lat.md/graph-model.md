---
type: Concept
openspec: [graph-model, schema-notes, typed-note-creation]
---
# Graph Model

The in-memory property graph built from the vault: notes become labeled nodes, parsed lines become typed edges with properties.

## Nodes

One note is one node; headings and blocks are not nodes in v1. The `tg` graph goes further: sections are nodes, and so are document elements with an id or a declared type ([[elements#Element nodes]]).

Links to notes that do not exist become stub nodes, keyed by link text, so the graph has no dangling edges. Stubs are reference-counted and vanish with their last edge. Implemented by [[packages/core/src/graph/graph.ts#Graph]], which stores parsed edges per file so re-resolution after add, delete or rename needs no re-parse. A note is a Markdown file or an `.adoc` file ([[asciidoc]]); an AsciiDoc note keeps its extension in its id and takes its title from `= Title`.

## Node types

A node's labels come from frontmatter `type: Person` or `type: [Person, Employee]`, which maps to multiple openCypher labels.

Configurable fallbacks map folder or tag to type when frontmatter is absent.

A non-empty frontmatter `title` becomes the node's `title` property; otherwise it is the file name.

A `types` list adds labels after those from `type`, deduplicated; the [[okf]] export writes it because OKF's `type` is a single string.

## Schema notes

A schema note such as `Types/Person.md` declares a type's properties, defaults, allowed edge types and visualization, in the spirit of typed templates.

Schema notes are optional; the graph works without them. Creating a note from a type applies its template.

A note directly in the schema folder (setting, default `Types/`) declares types in its frontmatter. `schema:` declares the type named by the note title, with the body as its template; `schemas:` declares any number of types by name, so one note can describe a whole subsystem; `edgeTypes:` declares edge types; `prefixes:` adds CURIE prefixes. All may appear together. From TGS 0.4 every declaration may carry a `description`, and a type may declare the `elements` and `sections` its documents hold ([[elements]]). The format is published as the open [[shacl#Typed Graph Schema]] specification.

A type has `properties` (map, kind shorthand or list; kinds text, number, boolean, date, datetime, link, list; `default`, `required`, `many`, `values`, `uri`), `edges` (absent means unrestricted; a list of types, or a map to target types or `{target, many, required}`), `template` (a link to a template note), `uri` and `visualization` (alias `style`, consumed by visualization config). An edge type has `from`, `to`, `properties`, `uri` and `visualization`. Read by [[packages/core/src/schema/schema.ts#readSchemaNote]] and collected by [[packages/core/src/schema/schema.ts#schemasFromGraph]], where the first declaration by path wins and duplicates are reported.

Validation is advisory and never removes anything from the graph ([[packages/core/src/schema/schema.ts#validateSchemas]]): required and enum properties, lists in single-valued properties, allowed, required and single edges, edge endpoint types (stubs and untyped notes are skipped) and edge properties. Multi-label notes merge schemas in label order: first property declaration wins, allowed edge rules are unioned. Identifiers are IRIs or CURIEs, with built-in prefixes and a base IRI (`urn:tgs:`) for the rest.

A type's `id` key (TGS 0.2) lists the identifiers a new note gets: `uuid`, a time-ordered `uuid7` that sorts as a string, a local `timestamp` (`YYYYMMDDHHmm`) or a branching `luhmann` id (`1`, `1a`, `1a1`, `2`), each stored in its own property, optionally also as a file name prefix, and automatic except Luhmann ids, which are placed under a parent note as a child or sibling or taken as the next top-level number ([[packages/core/src/schema/ids.ts#generateId]], [[packages/core/src/schema/newnote.ts#planNewNote]]).

Templates come from the note a type's `template` links to, else the body of a `schema:` note, else one generated from the schema ([[packages/core/src/schema/schema.ts#chooseTemplate]], [[packages/core/src/schema/schema.ts#renderNoteFromType]]); generated edge lines are empty `- type::` placeholders that create no edges. Template text may use `{{title}}`, `{{date}}`, `{{time}}`, `{{id}}`, `{{<id property>}}` and, under a parent, `{{parent}}`, `{{parent-id}}` and `{{parent-link}}`; a line that names the parent disappears when there is none, and other braces such as edge embeds are untouched. The Obsidian plugin offers all of this through a type menu (ribbon, folder context menu and command), and Luhmann child, sibling and top-level commands; VS Code has the same creation commands ([[vscode#Creating notes]]). Schemas are exchanged with RDF tools through [[shacl]].

## Edges

Edges carry a type, optional label, sign, properties, a derived or pinned ID and the heading they were written under.

Syntax is defined in [[edge-syntax]]. An [[edge-syntax#Edge notes|edge note]] contributes an edge and no node; its edge's `file` names the note that declares it, and [[packages/core/src/graph/graph.ts#Graph#declaredEdges]] lists the edges a file wrote.

## Plain link edges

With the `linkEdges` graph option, every plain wikilink or markdown link to a note in prose becomes an untyped `links_to` edge (sign +1), as OKF consumers read links.

The option is off by default so existing vaults keep their graphs and queries; it is the third argument of [[packages/core/src/graph/graph.ts#Graph]] and is passed to the parser. Lines that already produce typed edges, fenced and inline code, frontmatter and image embeds (`![..](..)`, `![[..]]`) never yield link edges; missing targets become stubs as usual. The sidecar turns it on with `OBSIGRAPH_LINK_EDGES=1`.

In the Obsidian plugin both options are settings, "Plain links as links_to edges" and "Frontmatter links as edges", off by default; changing either re-indexes the vault. See [[tests/edge-settings]].

## Indexed folders

The Obsidian plugin indexes the whole vault unless its settings narrow it: "Indexed folders" (one per line, empty means all), "Excluded folders", and "Follow Obsidian's excluded files", off by default.

A note outside the scope is not a node and its edges are not read. The plugin's link resolver treats it as missing, so links into an excluded folder end at stubs; stubs skip schema checks, so excluding a folder adds no diagnostics. Notes in the schema folder are always indexed, so a broad exclusion never drops the types. The scope is the predicate from [[packages/plugin/src/note-scope.ts#noteScope]]; Obsidian's "Excluded files" are read through [[packages/plugin/src/note-scope.ts#obsidianIgnored]]. Changing a folder setting re-indexes the vault once typing pauses, and re-indexing removes notes that left the scope. Obsidian sends no event when its own exclusions change, so the "Re-index vault" command applies them. The VS Code extension's `typegraph.roots` and `typegraph.ignore` are the same idea ([[vscode]]). See [[tests/vault-indexing]].

## Indexing a large vault

Building the graph takes time linear in notes and links, so a vault of thousands of long notes with plain links as edges indexes in seconds, not minutes.

A stub is indexed by the file name a note needs to satisfy it (last path segment, without fragment or note extension, case-folded). A new note re-resolves only the links to stubs with its name, in [[packages/core/src/graph/graph.ts#Graph]]; see [[architecture#Stub re-resolution by name]]. The plugin reads files a few at a time ahead of indexing and yields to the UI whenever a slice of work passes about 12 ms, at startup and on re-index ([[packages/plugin/src/vault-index.ts#VaultIndex]]). The status bar shows node and edge counts on every change but counts whole-vault diagnostics only once changes settle ([[packages/plugin/src/status-count.ts#statusCount]]). Parsed notes are not cached between sessions; see [[architecture#No parse cache yet]].
