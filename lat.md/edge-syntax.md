---
type: Concept
openspec: [edge-embeds, edge-parsing, graph-model]
---
# Edge Syntax

How authors write typed, signed edges with properties inside markdown, and how edges are identified and embedded elsewhere.

## Inline edge form

An edge is a single line `type:: [[Target]] {props}` where the property block is optional, so plain Graph Link Types lines stay valid unchanged.

Implemented by [[packages/core/src/edges/parse.ts#parseEdges]], with property blocks parsed by [[packages/core/src/edges/props.ts#parseProps]]. Example: `knows:: [[Bob]] {since: 2020, label: "met at conf"}`. List items and comma-separated links are accepted; YAML frontmatter and fenced code are skipped. Source heading is recorded as edge metadata so sub-note nodes can be added later without breaking edges.

## Links in property values

An unquoted `[[X]]` in a property block is the string `"[[X]]"`, as Obsidian's highlighting suggests, so a nested list holding one item is written `[[X],]` or `[ [X] ]`.

A value counts as a link when [[packages/core/src/edges/props.ts#PROPERTY_LINK]] matches it, the same shape Obsidian highlights: `[[`, then no bracket or line break, then `]]`, so subpaths and aliases count. [[packages/core/src/edges/props.ts#parseProps]] tries it before reading a list, so `[[[A]], [[B]]]` is a list of two links, while `[[X],]`, `[[X] ]` and `[[1, 2], [3]]` are nested lists. The value is only text: nothing resolves it or makes it an edge.

Up to 0.31 the parser read `[[X]]` as the nested list `[["X"]]`. One release warned about it with an `edge-property-link` finding; that warning is gone because the value now means what it looks like.

## Markdown link targets

A standard markdown link to a note works as an edge target, alone or mixed with wikilinks: `knows:: [Bob](/people/bob.md) {since: 2020}`.

Parsed by [[packages/core/src/edges/parse.ts#markdownTarget]], which normalizes the destination to a vault path: percent escapes decoded, `#anchor` kept as the subpath, `./` and `../` resolved against the source note's folder, a leading `/` meaning the vault root, `.md` added when there is no extension. Links with a URL scheme, pure anchors, directory links and links to non-note files are not edges. This is what makes [[okf]] bundles and exports readable as typed graphs.

## Sign

An edge's sign comes from a `+` or `-` prefix on its type, defaults to +1, and is exposed to queries and styling.

Example: `-distrusts:: [[Eve]]`. v0.1 assumes sign is a +1/-1 polarity from the prefix only, default +1; `weight` is an ordinary property. This assumption is open for revision.

## Edge identity

Each edge gets a derived ID `source#type#target#n`, where `n` is its ordinal among duplicates, and an author may pin it with an `id` property.

Derived IDs shift when duplicate edges are reordered, so anything that references an edge long-term should use a pinned `id`. [[packages/core/src/embeds/embeds.ts#EmbedIndex]] warns about edges referenced by endpoint embeds that are not pinned, suggesting an id such as `alice-knows-bob`, and about ambiguous endpoint embeds; pinned or unreferenced edges never warn.

## Frontmatter edges

With the `frontmatterEdges` graph option, a wikilink or markdown link in a frontmatter property is an edge typed by the property name, so `requirement: "[[Login]]"` reads as `requirement:: [[Login]]`.

[[packages/core/src/edges/parse.ts#frontmatterEdges]] scans each property value, or each item of a list, with the inline link scanner, so aliases, `#subpaths` and markdown links work as they do after `::`. Edges are +1, carry no properties and sit at line 0 with no heading. Text, numbers, empty `[[]]` placeholders and the Obsidian-owned `tags`, `aliases`, `cssclasses`, `type` and `types` give nothing; an unquoted `[[X]]` is a nested YAML list in Obsidian, so quote links. The option is off by default so existing graphs and queries do not change; the plugin exposes it as a setting and `tg validate --frontmatter-edges` applies it to validation. Schema `edgeTypes` (`from`, `to`) and per-type `edges` check these edges like any other. Writing a relation both in frontmatter and in the body yields two edges. An [[edge-syntax#Edge notes|edge note]] is exempt: its links stay edge properties and it declares only its one edge.

## Property embeds

Edge properties are shown in prose with `{{edge: Alice -knows-> Bob . since}}` or `{{edge: met-2020 . since}}`, both resolved through the same lookup.

Without a trailing property the embed renders the whole property block as a small table. Inside queries, `r.since` is ordinary Cypher property access.

A sign goes inside the arrow before the type: `-knows->` matches either sign, `--knows->` only negative, `-+knows->` only positive. Endpoints may be wrapped in `[[ ]]`. Parsed by [[packages/core/src/embeds/embeds.ts#parseEmbed]] and resolved by [[packages/core/src/embeds/embeds.ts#resolveEmbed]]; duplicates resolve to the lowest ordinal. Embeds in code are ignored. They render in reading view through a post-processor and in live preview through a CodeMirror widget that reveals the raw text under the cursor; both re-resolve on vault changes. Unresolved embeds show a marker, never an error.

## Edge notes

A note with frontmatter `type: edge` declares one edge instead of a node, so a relationship can have a body, Properties panel fields and a row in Bases.

```yaml
---
type: edge
from: "[[Alice]]"
to: "[[Bob]]"
edgeType: knows
since: 2020
---
```

`from` and `to` are wikilinks, markdown links or bare link text, resolved like written links, with stubs for missing notes; YAML's reading of unquoted `[[Bob]]` as a nested list is accepted. `edgeType` may carry a `-` or `+` sign prefix, `id` pins the id, and every other field except `type` and `types` is an edge property. Read by [[packages/core/src/graph/graph.ts#Graph#upsertEdgeNote]] and recognized by [[packages/core/src/graph/graph.ts#isEdgeNote]].

The note is not a node, so every graph surface draws it as an ordinary edge between its endpoints. Its id is the note's path unless pinned, which keeps it stable for embeds, and the edge records the note as its declaring `file`, so schema findings, edge details and VS Code backlinks point at the edge note. Opening an edge note in a graph view shows its edge and both endpoints. The body contributes no edges.

A missing `from`, `to` or `edgeType` gives an `edge-note` finding and no edge. An edge or edge note whose endpoint is an edge note is refused with an `edge-note` finding at the link, because edge notes are not nodes; links are accepted again once the note stops being an edge note.

Both forms feed the same [[graph-model|graph model]].
