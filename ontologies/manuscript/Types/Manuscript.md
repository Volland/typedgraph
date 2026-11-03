---
tgs: "0.2"
prefixes:
  fabio: "http://purl.org/spar/fabio/"
  doco: "http://purl.org/spar/doco/"
  bibo: "http://purl.org/ontology/bibo/"
  dcterms: "http://purl.org/dc/terms/"
  skos: "http://www.w3.org/2004/02/skos/core#"
schemas:
  Manuscript:
    uri: fabio:Manuscript
    template: "[[Templates/Manuscript.adoc]]"
    properties:
      subtitle: text
      status: {values: [proposal, drafting, revising, submitted, in-review, copy-edited, proof, published], default: drafting}
      publisher: text
      edition: text
      deadline: date
      target_words: number
    edges:
      includes: [Part, Chapter]
    visualization: {color: "#0f766e", shape: star, icon: book}
  Part:
    uri: doco:Part
    template: "[[Templates/Part.adoc]]"
    properties:
      number: number
    edges:
      includes: Chapter
    visualization: {color: "#14b8a6", shape: hexagon, icon: layers}
  Chapter:
    uri: doco:Chapter
    template: "[[Templates/Chapter.adoc]]"
    properties:
      role: {values: [dedication, foreword, preface, acknowledgments, introduction, chapter, afterword, appendix, glossary, bibliography, index, colophon], default: chapter}
      number: number
      status: {values: [outline, drafting, draft, revising, in-review, final], default: outline}
      words: number
      target_words: number
      due: date
    edges:
      includes:
      introduces: Idea
      relies_on: Idea
      builds_on: Chapter
      cites: Source
    visualization: {color: "#2dd4bf", shape: round-rectangle, icon: file-text}
  Idea:
    uri: skos:Concept
    template: "[[Templates/Idea]]"
    properties:
      aliases: list
    edges:
      broader: Idea
    visualization: {color: "#f59e0b", shape: ellipse, icon: lightbulb}
  Outline:
    template: "[[Templates/Outline]]"
    properties:
      version: number
      status: {values: [working, proposed, approved, superseded], default: working}
    edges:
      plans: [Manuscript, Part, Chapter]
      revised_after: Review
    visualization: {color: "#a78bfa", shape: diamond, icon: list-tree}
  Source:
    uri: dcterms:BibliographicResource
    template: "[[Templates/Source]]"
    properties:
      kind: {values: [paper, article, book, book-chapter, thesis, report, web, talk, dataset, standard], required: true}
      authors: list
      year: number
      venue: text
      publisher: text
      edition: text
      doi: text
      url: link
      citekey: text
      file: link
      status: {values: [to-read, reading, read, cited, dropped], default: to-read}
    edges:
      cites: Source
    visualization: {color: "#64748b", shape: rectangle, icon: library}
  ResearchNote:
    uri: bibo:Note
    template: "[[Templates/Research Note]]"
    properties:
      kind: {values: [summary, quote, finding, question, data], default: finding}
    edges:
      notes_on: Source
      informs: [Chapter, Idea, Outline]
    visualization: {color: "#38bdf8", shape: round-rectangle, icon: notebook-pen}
  Review:
    uri: fabio:Review
    template: "[[Templates/Review]]"
    properties:
      stage: {values: [acquisition, developmental, technical, line, copyedit, proofread, beta, sensitivity], required: true}
      round: number
      received: date
      due: date
      status: {values: [open, in-progress, answered, closed], default: open}
    edges:
      reviewed_by: {target: Reviewer, required: true}
      comments_on: [Manuscript, Part, Chapter, Outline]
      follows_up: Review
    visualization: {color: "#e11d48", shape: triangle, icon: message-square-warning}
  Reviewer:
    uri: foaf:Person
    template: "[[Templates/Reviewer]]"
    properties:
      role: {values: [commissioning-editor, developmental-editor, technical-reviewer, line-editor, copy-editor, proof-reader, beta-reader, sensitivity-reader], many: true}
      organization: text
      email: text
    visualization: {color: "#fb7185", shape: ellipse, icon: user-pen}
edgeTypes:
  includes:
    uri: dcterms:hasPart
    from: [Manuscript, Part, Chapter]
    properties: {order: number, leveloffset: text, tags: text, lines: text}
  introduces: {from: Chapter, to: Idea}
  relies_on: {from: Chapter, to: Idea}
  builds_on: {from: Chapter, to: Chapter}
  broader: {uri: skos:broader, from: Idea, to: Idea}
  plans: {from: Outline, to: [Manuscript, Part, Chapter], properties: {position: number}}
  revised_after: {from: Outline, to: Review}
  notes_on: {uri: dcterms:source, from: ResearchNote, to: Source, properties: {page: text}}
  informs: {from: ResearchNote, to: [Chapter, Idea, Outline]}
  reviewed_by: {uri: dcterms:creator, from: Review, to: Reviewer}
  follows_up: {from: Review, to: Review}
  comments_on:
    uri: schema:itemReviewed
    from: Review
    to: [Manuscript, Part, Chapter, Outline]
    properties:
      kind: {values: [structure, clarity, accuracy, missing, style, consistency, citation, query, typo, permission]}
      severity: {values: [blocker, major, minor, nit]}
      status: {values: [open, accepted, rejected, done], default: open}
      note: text
      quote: text
      response: text
    visualization: {color: "#e11d48", line: dashed}
---
The manuscript ontology: a book written in AsciiDoc, the research behind it and the editorial reviews of it.
