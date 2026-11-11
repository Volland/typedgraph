## Context

`buildLatGraph` turns lat.md sections, spec requirements and annotated code into one property graph; a section is the smallest node. Schema notes (TGS 0.3) declare types, properties and edges but nothing about the text of a document. Spec readers parse requirement headings and ignore everything else. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Name and explain the parts of a document in the same schema notes that name its type.
- Make a part addressable and linkable without turning every paragraph into a node.
- Check that documents have the parts their type requires.

**Non-Goals:**
- A general XML or HTML parser, inline elements, or ordering rules (no DTD content models).
- Element nodes in the Obsidian plugin and VS Code graphs; they read the keys but keep one node per note.
- Changing `tg check` parity with lat.md for projects that use no element links.

## Decisions

**1. Elements are declared per type, inside the type.** `elements` and `sections` sit next to `properties` in a type declaration, so the meaning of `<option>` in a Decision is written where Decision is. A multi-label node merges declarations in label order, as properties do, which lets an ADR (labels `Decision`, `ADR`) inherit Decision's elements and add MADR's headings. Alternative: a separate `documentTypes:` key matched by path globs. Rejected for now: lat.md files and spec nodes are already typed, and a third way to assign types adds confusion; globs can come later for untyped files such as `SKILL.md`.

**2. An id or a type makes a node; everything else stays text.** An `id` is an author asking for an address, and a declared `type` says the part is an ontology thing in its own right (a `rule` that is a Requirement). Anonymous, untyped elements are checked and described but add no node, which keeps queries readable. `node: true` forces nodes for a tag, `node: false` keeps an untyped tag in the text even when it is declared.

**3. Address by document and id: `file#^id`.** The `#^` form follows Obsidian block references, does not collide with heading paths, and survives moving the element to another section. Spec documents are addressed by their group or record (`openspec:auth#^lockout`, `adr:3#^redis`). Ids are unique per document; a repeat is a `tg check` finding and links reach the first.

**4. A lenient line scanner.** Opening tags count at the start of a line, closing tags at the end, outside fences and frontmatter; text that is not attribute syntax (`<insert summary here>`) is not a tag, and an unclosed tag becomes empty instead of swallowing the document. Writers are told to put blank lines inside an element so CommonMark (and `tg check`, which follows lat.md) reads the Markdown and links inside it.

**5. Typed edges inside an element start at it.** In lat.md files every typed edge line is already parsed; its owner becomes the innermost element node around it. In spec files, only typed edge lines inside element nodes are read, because the rest of a spec belongs to its framework's format.

**6. Descriptions are optional and invisible to old readers.** A declaration without a description reads exactly as before (the key is absent, not null), the SHACL export writes `sh:description`, and elements and sections travel as `tgs:elements` and `tgs:sections` JSON annotations so a round trip is lossless.

## Risks / Trade-offs

- [lat.md does not know `#^id`] → only projects that write element links diverge from `lat check`, and only on those links.
- [HTML in docs looks like elements] → only elements with an `id` or a declaration become nodes; undeclared tags without an id are ignored.
- [Element nodes grow the graph] → bounded by ids and declared types, both written on purpose.
