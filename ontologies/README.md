# Ontology gallery

Ready-made Typed Graph ontologies. Each one is a folder of plain Markdown (and, for `manuscript`, AsciiDoc chapters): schema notes in `Types/` that declare node types, edge types and their properties in the open [Typed Graph Schema](https://typedgraph.org/spec/tgs/v0.1/) format, and a few example notes so the graph is not empty on first open.

| Folder | For |
|---|---|
| `zettelkasten/` | atomic notes, sources and topics |
| `library/` | book management: books, authors, series, genres, quotes |
| `manuscript/` | writing a book in AsciiDoc: manuscript, parts, chapters, ideas, outlines, sources, research notes and editorial reviews |
| `requirements/` | coding and requirement management: requirements, decisions, constraints, releases, risks |
| `agents/` | a catalogue of prompts, agents, tools, skills, knowledge and evals |
| `okf/` | a data catalog (tables, metrics, dashboards, terms, runbooks) that exports as an Open Knowledge Format bundle |
| `core/` | edge types shared by several ontologies, declared once so they can be combined |

## Use one

Open its folder as an Obsidian vault with the Typed Graph plugin, or copy its `Types/` notes into your own vault's schema folder (default `Types/`). Give a note `type: Book` in its frontmatter and write edges as `written_by:: [[Frank Herbert]]`.

## Combine several

Put the `Types/` notes of every ontology you want into one schema folder, together with `core/Types/Core.md`. Each type and edge type must be declared in one note only; if two ontologies need the same edge name, move its declaration into `core`. A note can carry labels from two ontologies: `type: [Book, Source]`.

## Take it elsewhere

`tg schema export shapes.ttl --vault <folder>` writes any of them as SHACL, and `tg schema import` turns SHACL shapes back into schema notes.
