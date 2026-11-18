# Ontology gallery

Ready-made Typed Graph ontologies. Each one is a folder of plain Markdown (and, for `manuscript`, AsciiDoc chapters): schema notes in `Types/` that declare node types, edge types and their properties in the open [Typed Graph Schema](https://typedgraph.org/spec/tgs/v0.1/) format, and a few example notes so the graph is not empty on first open.

| Folder | For |
|---|---|
| `zettelkasten/` | atomic notes, sources and topics |
| `library/` | book management: books, authors, series, genres, quotes |
| `manuscript/` | writing a book in AsciiDoc: manuscript, parts, chapters, ideas, outlines, sources, research notes and editorial reviews |
| `code/` | what code is meant to do and why: decisions, requirements, scenarios, constraints, concepts, changes (the file `tg init` installs) |
| `requirements/` | product work on top of `code/`: stakeholders, releases, risks |
| `team/` | the team map on top of `code/`: members, teams and agents, who owns, knows and decided what |
| `agents/` | a catalogue of prompts, agents, tools, skills, knowledge and evals |
| `okf/` | a data catalog (tables, metrics, dashboards, terms, runbooks) that exports as an Open Knowledge Format bundle |
| `core/` | edge types shared by several ontologies, declared once so they can be combined (the same `core-types.md` `tg init` writes) |

## Use one

Open its folder as an Obsidian vault with the Typed Graph plugin, or copy its `Types/` notes into your own vault's schema folder (default `Types/`). Give a note `type: Book` in its frontmatter and write edges as `written_by:: [[Frank Herbert]]`.

## Combine several

Put the `Types/` notes of every ontology you want into one schema folder, together with `core/Types/core-types.md`. Every ontology here composes with every other with no diagnostic, and a test keeps it that way. The rules:

- **One owner per name.** Each type and edge type is declared in one note only. If two ontologies need the same edge name, its declaration moves into `core`.
- **Build on, don't copy.** An ontology that needs another's types lists it in `requires.json` and its download includes it: `requirements` and `team` build on `code`.
- **Open where others build.** A type that other ontologies build on declares no `edges` list, so their edge types can start at it; each edge type's `from` and `to` still say where it may start and end.
- **Specific names, two labels.** Domain names are chosen not to collide (`Member`, not `Person`; `TeamAgent`, not `Agent`; `Writer`, not `Author`), and one note carries both when it belongs to both: `type: [Person, Member]`, `type: [Book, BookSource]`.
- **Same files as tg.** `core-types.md`, `code-types.md` and `team-types.md` are byte-identical to what `tg init` and `tg gen team-types.md` write, so copying a download into a tg project replaces a file instead of declaring a name twice.

## Take it elsewhere

`tg schema export shapes.ttl --vault <folder>` writes any of them as SHACL, and `tg schema import` turns SHACL shapes back into schema notes.
