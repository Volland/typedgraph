---
tgs: "0.2"
schemas:
  FleetingNote:
    id: {kind: uuid7, property: uid}
    template: "[[Templates/Fleeting Note]]"
    properties:
      created: date
      status: {values: [inbox, processed, discarded], default: inbox}
      context: text
    edges:
      about: Topic
      processed_into: [LiteratureNote, PermanentNote]
    visualization: {color: "#fcd34d", shape: round-rectangle, icon: zap}
  LiteratureNote:
    id: {kind: uuid7, property: uid}
    template: "[[Templates/Literature Note]]"
    properties:
      created: date
    edges:
      cites: {target: [BookSource, ArticleSource, PaperSource], required: true}
      based_on: Highlight
      about: Topic
    visualization: {color: "#38bdf8", shape: round-rectangle, icon: book-marked}
  PermanentNote:
    id:
      - {kind: uuid7, property: uid}
      - {kind: luhmann, property: luhmann, auto: false}
    template: "[[Templates/Permanent Note]]"
    properties:
      created: date
      confidence: {values: [low, medium, high]}
      luhmann: text
    edges:
      derived_from: [FleetingNote, LiteratureNote, Highlight]
      cites: [BookSource, ArticleSource, PaperSource]
      about: Topic
      extends: PermanentNote
      supports: PermanentNote
      contradicts: [PermanentNote, FleetingNote]
      example_of: PermanentNote
      follows: PermanentNote
    visualization:
      color: "#f59e0b"
      shape: round-rectangle
      icon: sticky-note
      edges:
        contradicts: {color: "#e5484d", line: dashed}
  StructureNote:
    id: {kind: uuid7, property: uid}
    template: "[[Templates/Structure Note]]"
    properties:
      scope: text
    edges:
      indexes: [PermanentNote, StructureNote]
      about: Topic
    visualization: {color: "#8b5cf6", shape: hexagon, icon: network}
  ProjectNote:
    id: {kind: uuid7, property: uid}
    template: "[[Templates/Project Note]]"
    properties:
      status: {values: [active, done, archived], default: active}
      due: date
    edges:
      draws_on: [PermanentNote, LiteratureNote, StructureNote]
      about: Topic
    visualization: {color: "#22c55e", shape: diamond, icon: folder-kanban}
  BookSource:
    id: {kind: uuid7, property: uid}
    properties:
      year: number
      publisher: text
      edition: text
      pages: number
      status: {values: [to-read, reading, finished], default: to-read}
    edges:
      authored_by: {target: Writer, required: true}
      about: Topic
    visualization: {color: "#64748b", shape: rectangle, icon: book-open}
  ArticleSource:
    id: {kind: uuid7, property: uid}
    properties:
      year: number
      publication: text
      url: link
      status: {values: [to-read, reading, finished], default: to-read}
    edges:
      authored_by: {target: Writer, required: true}
      about: Topic
    visualization: {color: "#94a3b8", shape: rectangle, icon: file-text}
  PaperSource:
    id: {kind: uuid7, property: uid}
    properties:
      year: number
      kind: {values: [journal, conference, preprint, thesis, report]}
      venue: text
      doi: text
      url: link
      status: {values: [to-read, reading, finished], default: to-read}
    edges:
      authored_by: {target: Writer, required: true}
      cites: [BookSource, ArticleSource, PaperSource]
      about: Topic
    visualization: {color: "#0ea5e9", shape: rectangle, icon: graduation-cap}
  Highlight:
    id: {kind: uuid7, property: uid}
    template: "[[Templates/Highlight]]"
    properties:
      page: text
      color: {values: [yellow, blue, green, red]}
      saved: date
    edges:
      highlighted_in: {target: [BookSource, ArticleSource, PaperSource], required: true}
      about: Topic
    visualization: {color: "#facc15", shape: rectangle, icon: highlighter}
  Writer:
    id: {kind: uuid7, property: uid}
    properties:
      born: number
    edges:
      about: Topic
    visualization: {color: "#a855f7", shape: ellipse, icon: user}
  Topic:
    id: {kind: uuid7, property: uid}
    properties:
      status: {values: [seed, growing, mature], default: seed}
    edges:
      related_to: Topic
    visualization: {color: "#7c5cff", shape: ellipse, icon: folder}
edgeTypes:
  extends: {from: PermanentNote, to: PermanentNote}
  supports: {from: PermanentNote, to: PermanentNote, properties: {how: text}}
  example_of: {from: PermanentNote, to: PermanentNote}
  follows:
    from: PermanentNote
    to: PermanentNote
    properties: {luhmann: text}
    visualization: {color: "#f59e0b", line: dotted}
  based_on: {from: LiteratureNote, to: Highlight}
  processed_into: {from: FleetingNote, to: [LiteratureNote, PermanentNote]}
  indexes: {from: StructureNote, to: [PermanentNote, StructureNote], properties: {order: number}}
  draws_on: {from: ProjectNote, to: [PermanentNote, LiteratureNote, StructureNote], properties: {chapter: text}}
  authored_by: {from: [BookSource, ArticleSource, PaperSource], to: Writer, properties: {role: {values: [author, editor, translator]}}}
  highlighted_in: {from: Highlight, to: [BookSource, ArticleSource, PaperSource]}
  about: {to: Topic}
  related_to: {from: Topic, to: Topic}
---
The Zettelkasten ontology: the note types of the method (fleeting, literature, permanent, structure and project notes), the sources they come from (books, articles and papers with their writers), the highlights you take from them and the topics that index it all.

The note type is the stage. A `FleetingNote` is a quick capture that you process within a day or two, a `LiteratureNote` is a source rewritten in your own words, and a `PermanentNote` is one idea that stands alone and links to other permanent notes. Moving a note forward means writing a new note and linking back with `derived_from`, `based_on` or `processed_into`, so the trail from capture to idea stays in the graph.

Every type gets a time-ordered `uid` when a note is created from it, and permanent notes can also take a Luhmann id (`1`, `1a`, `1a1`, `2`) through the child and sibling commands, so the slip box can branch the way Luhmann's did. The templates in `Templates/` fill in the title, date, ids and a link to the parent note.

A `Highlight` is raw text from a source and cites it with `highlighted_in`; a literature note says what it means with `based_on`.

A `PaperSource` is a research paper with a `venue`, a `doi` and a `kind` (journal, conference, preprint, thesis or report). It is a source like a book or an article, so literature notes, permanent notes and highlights can point at it, and it can also `cites` the books, articles and papers in its own bibliography, so the citation graph of what you read sits next to your notes.

`StructureNote` and `ProjectNote` are the hub and the working note. Writers are `Writer` here so the ontology composes with the library's `Author`; label one person `[Author, Writer]` to share it.

`contradicts` and `derived_from` are declared once in the shared `core` ontology; this note only says which note types may use them and how to draw them.
