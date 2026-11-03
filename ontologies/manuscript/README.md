# Manuscript ontology

A book written in AsciiDoc, the research behind it and the editorial reviews of it, as one typed graph. Chapters stay plain `.adoc` files that Asciidoctor renders as before: their properties sit in a leading `////` comment block and their edges in `// @tg:` line comments, so nothing new reaches the rendered book. Research notes, outlines and reviews are Markdown notes beside them.

Copy `Types/` and `Templates/` into the root of your book project, add `Types/Core.md` from the `core` ontology, and type your files as below.

## Types

| Type | File | What it is | Standard term |
|---|---|---|---|
| `Manuscript` | `book.adoc` | The master file that `include::`s the parts and chapters. `status` from proposal to published, `deadline`, `target_words`. | `fabio:Manuscript` |
| `Part` | `.adoc` | A part that includes chapters. | `doco:Part` |
| `Chapter` | `.adoc` | A chapter or other book division: `role` (preface, chapter, appendix, glossary, bibliography, ...), `status` (outline → final), `words`, `target_words`, `due`. | `doco:Chapter` |
| `Idea` | `.md` | A concept the book teaches, with `broader` ideas. | `skos:Concept` |
| `Outline` | `.md` | A version of the book's structure that `plans` the manuscript, parts and chapters. | none; `fabio:ProjectPlan` is closest |
| `Source` | `.md` | A paper, article, book, thesis, talk, dataset or web page: `kind`, `authors`, `year`, `venue`, `doi`, `url`, `citekey`, reading `status`. | `dcterms:BibliographicResource` |
| `ResearchNote` | `.md` | One summary, quote, finding or open question from a source that `informs` a chapter, an idea or the outline. | `bibo:Note` |
| `Review` | `.md` | One round of feedback at one `stage` (developmental, technical, line, copyedit, proofread, beta, sensitivity), `reviewed_by` a reviewer. | `fabio:Review` |
| `Reviewer` | `.md` | An editor or reader, with PRO-style roles such as `copy-editor` and `proof-reader`. | `foaf:Person` |

Name each `Source` note by its citekey (`hogan2021.md`). Then `[[hogan2021]]` in a note, `<<hogan2021>>` in a chapter and `[[[hogan2021]]]` in the AsciiDoc bibliography all name the same work.

## Edges

| Edge | From → to | Properties | Standard term |
|---|---|---|---|
| `includes` | Manuscript, Part, Chapter → Part, Chapter | `order`, `leveloffset` | `dcterms:hasPart` |
| `introduces` / `relies_on` | Chapter → Idea | | none |
| `builds_on` | Chapter → Chapter | | none |
| `cites` | Chapter, Source → Source | `intent` (a CiTO property such as `citesAsEvidence` or `usesMethodIn`), `page` | `cito:cites` |
| `plans` | Outline → Manuscript, Part, Chapter | `position` | none |
| `revised_after` | Outline → Review | | none |
| `notes_on` | ResearchNote → Source | `page` | `dcterms:source` |
| `informs` | ResearchNote → Chapter, Idea, Outline | | none |
| `broader` | Idea → Idea | | `skos:broader` |
| `reviewed_by` | Review → Reviewer (required) | | `dcterms:creator` |
| `follows_up` | Review → Review | | none |
| `comments_on` | Review → Manuscript, Part, Chapter, Outline | `kind`, `severity`, `status`, `note`, `quote`, `response` | `schema:itemReviewed` |

You never write `includes` yourself. Each `include::` line in the master file or a part becomes an `includes` edge with its position as `order`, so the graph knows the reading order.

`cites` is declared in `core` because the Zettelkasten ontology uses it too.

## Editorial reviews as a checklist

Write each editor's letter as a `Review` note, and each comment in it as one `comments_on` edge.

- **Pointing at the text.** Point the edge at the chapter, or at a section with `[[ch01-why-graphs#Graphs everywhere]]`. Put the exact words in `quote` when the section is too coarse.
- **Tracking progress.** As you revise, move the edge's `status` from `open` to `accepted`, `rejected` (stet) or `done`, and write your answer in `response`.
- **Kind and severity.**
  - `kind` says what the comment is about: structure, clarity, accuracy, missing, style, consistency, citation, query (an author query) or typo.
  - `severity` ranks it: blocker, major, minor or nit.
  - Severity is a house convention; publishers have no standard scale.

```adoc
// in a chapter: typed edges live in comments
// @tg: introduces:: [[Typed edge]]
// @tg: cites:: [[hogan2021]] {intent: obtainsBackgroundFrom, page: 7}
```

```markdown
- reviewed_by:: [[Maya Chen]]
- comments_on:: [[ch03-asking-the-graph]] {kind: missing, severity: blocker, status: open, note: "Chapter is an outline."}
```

## Questions the graph answers

Reading order of the book:

```cypher
MATCH (m:Manuscript)-[r:includes]->(c:Chapter) RETURN c.title, c.status, c.words, c.target_words ORDER BY r.order
```

Ideas used before the chapter that introduces them, in reading order:

```cypher
MATCH (m:Manuscript)-[a:includes]->(c:Chapter)-[:relies_on]->(i:Idea)<-[:introduces]-(d:Chapter)<-[b:includes]-(m)
WHERE b.order > a.order RETURN c.title, i.title, d.title
```

Open editorial comments that block the next stage:

```cypher
MATCH (r:Review)-[e:comments_on]->(c)
WHERE e.status = 'open' AND e.severity IN ['blocker', 'major']
RETURN r.stage, c.title, e.note
```

Sources cited but never read, and ideas no chapter introduces:

```cypher
MATCH (c:Chapter)-[:cites]->(s:Source) WHERE s.status IN ['to-read', 'reading'] RETURN DISTINCT s.citekey
MATCH (i:Idea) OPTIONAL MATCH (c:Chapter)-[r:introduces]->(i) WITH i, count(r) AS n WHERE n = 0 RETURN i.title
```

`tg cypher` in a terminal reads the `.adoc` chapters that the `notes` globs of `.tg/config.json` match. This folder ships ready for it: `.tg/config.json` matches `Examples/**/*.adoc` and `tg.md/` is the docs folder the CLI needs, so `tg cypher` works from here. In your own book, point the glob at your manuscript folder. Queries that also need the Markdown research and review notes run in the Obsidian plugin and in VS Code, which read both formats. `tg validate --vault .` checks every note against the schema.

## Examples

`Examples/` holds a three-chapter sample book with its research and editorial reviews:

- **`manuscript/`:** the master file `book.adoc` and its chapters.
- **`research/`:** papers, articles, books, notes and the outline.
- **`ideas/`:** the ideas the chapters teach.
- **`reviews/`:** a developmental edit, a technical review and copyedit queries, plus the reviewers.

Chapter 1 relies on an idea that chapter 2 introduces, which is what the developmental editor flagged, so the second query above has an answer. Delete the examples when you start.
