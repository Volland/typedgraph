# A slip box that answers back

*How to build a Zettelkasten as a typed graph, connect it to the books and articles you read, compose it with a library ontology, and ask it questions you could not ask a folder of notes.*

---

## The promise Luhmann made

Niklas Luhmann wrote about seventy books and several hundred articles. He credited a wooden cabinet of about ninety thousand index cards for most of it. In 1981 he described the cabinet as a *communication partner*: a system that, once it held enough linked notes, would answer back with connections he had not planned.

That essay is the reason people still build slip boxes. It is also the reason most of them are disappointed. Their notes pile up and the links accumulate, but nothing answers back. A folder of Markdown files with `[[wikilinks]]` is a better index card than paper, but it is still an index card. You can follow a link. You cannot ask the box a question.

The missing piece is not more notes or more links. It is **what kind** of note each one is and **what kind** of link each one makes. "This idea came from that page" is a different statement from "this idea contradicts that one", and a slip box that cannot tell them apart can only show you a hairball.

This article builds a Zettelkasten in which notes and links have types. We will use the Zettelkasten ontology from the [Typed Graph ontology gallery](ontologies.html), and connect it to the books and articles you read. We will then compose it with a second ontology, a library for your reading life, without either one breaking the other. At the end we will ask it a dozen questions, from "what have I not processed?" to "which of my ideas came from fiction?", and show the real answers it gives.

Everything here is plain Markdown. Every query and validator message below was run against the real engine on the vault described in this article.

## A Zettelkasten is already a graph with types

The method has types even when the tool does not. As Sönke Ahrens describes it in *How to Take Smart Notes*, and as Christian Tietze and Sascha Fast extend it on zettelkasten.de, a note moves through stages:

- **Fleeting notes** are quick captures. You process them within a day or two or throw them away.
- **Literature notes** say what a source says, *in your own words*, so they make sense without the source.
- **Permanent notes** hold one idea each, written to stand alone and linked to other permanent notes.
- **Structure notes** are hubs: an ordered entry point into a line of thought.
- **Project notes** are where you use the box: a chapter, a talk, a thesis.

Around them sit the things you read (books and articles), the people who wrote them, the passages you marked, and a few topics that let you find your way in.

In a folder of files these are conventions. A note is "permanent" because it lives in `Permanent/` or carries a `#permanent` tag. Nothing stops a permanent note from citing nothing, a literature note from losing its source, or a fleeting note from sitting in the inbox for a year.

In a typed graph the conventions become data. A permanent note is a node with the label `PermanentNote`. "It was derived from this literature note" is an edge with the type `derived_from`, and "it supports that other idea" is an edge with the type `supports` and a property saying *how*. Once the stage of a note and the meaning of a link are data, they can be checked and queried, and the box can start answering.

## The ontology in one note

The whole Zettelkasten ontology is one Markdown file, `Types/Zettelkasten.md`. Its frontmatter is a schema in the open [Typed Graph Schema](spec/tgs/v0.2/) format. Here is the heart of it, trimmed:

```yaml
---
tgs: "0.2"
schemas:
  FleetingNote:
    id: {kind: uuid7, property: uid}
    template: "[[Templates/Fleeting Note]]"
    properties:
      status: {values: [inbox, processed, discarded], default: inbox}
      context: text
    edges:
      processed_into: [LiteratureNote, PermanentNote]
  LiteratureNote:
    edges:
      cites: {target: [BookSource, ArticleSource], required: true}
      based_on: Highlight
  PermanentNote:
    id:
      - {kind: uuid7, property: uid}
      - {kind: luhmann, property: luhmann, auto: false}
    properties:
      confidence: {values: [low, medium, high]}
    edges:
      derived_from: [FleetingNote, LiteratureNote, Highlight]
      extends: PermanentNote
      supports: PermanentNote
      contradicts: [PermanentNote, FleetingNote]
      example_of: PermanentNote
      follows: PermanentNote
  StructureNote:
    edges:
      indexes: [PermanentNote, StructureNote]
  Highlight:
    edges:
      highlighted_in: {target: [BookSource, ArticleSource], required: true}
edgeTypes:
  supports: {from: PermanentNote, to: PermanentNote, properties: {how: text}}
  cites: {from: [LiteratureNote, PermanentNote], to: [BookSource, ArticleSource], properties: {page: text}}
  indexes: {from: StructureNote, to: [PermanentNote, StructureNote], properties: {order: number}}
  draws_on: {from: ProjectNote, to: [PermanentNote, LiteratureNote, StructureNote], properties: {chapter: text}}
---
```

The full file declares ten types and thirteen edge types. Read it as a description of the method rather than a data model:

| Type | What it is | Its links |
|---|---|---|
| `FleetingNote` | a capture, with a status: `inbox`, `processed`, `discarded` | `processed_into` the note it became |
| `LiteratureNote` | a source in your own words | `cites` a book or article (required), `based_on` a highlight |
| `PermanentNote` | one idea that stands alone | `derived_from`, `extends`, `supports`, `contradicts`, `example_of`, `follows` |
| `StructureNote` | an ordered hub | `indexes` with an `order` |
| `ProjectNote` | a piece of work | `draws_on` with the `chapter` it feeds |
| `BookSource`, `ArticleSource` | what you read | `authored_by` a writer (required) |
| `Highlight` | raw text you marked | `highlighted_in` its source (required) |
| `Writer` | a person who wrote a source | |
| `Topic` | an entry point | `related_to` other topics; everything can be `about` one |

Three design choices in this file do most of the work.

**The type of a note is its stage.** You do not "promote" a fleeting note by editing it into a permanent one. You write a new note and link back with `processed_into`, `based_on` or `derived_from`. The trail from capture to idea stays in the graph, which matters later when you ask where an idea came from.

**Links between ideas say how they relate.** Luhmann's cards had numbers and arrows, and the arrows carried meaning he kept in his head. Here the meaning is the edge type. `extends` is "takes this further", `supports` is "is evidence for", `example_of` is "is an instance of", and `contradicts` is "cannot both be true". The edges carry properties too: a `supports` edge has a `how`, a `cites` edge has a `page`, and an `indexes` edge has an `order`.

**Sources are required where the method requires them.** A literature note that cites nothing is not a literature note, so `cites` is `required: true`. A highlight with no source is a quote you can no longer check. The validator turns both into warnings on the note. Validation is advisory: it never blocks you and never deletes anything.

## Writing it, one note at a time

The ontology folder ships with a small worked example: a student who reads Ahrens, Luhmann and the zettelkasten.de introduction while writing a thesis chapter. Here is how its notes are written, in the order you would write them.

### Capture

You have half a thought after a meeting. You write it down without judging it:

```markdown
---
type: FleetingNote
created: 2026-01-18
status: inbox
context: after the supervisor meeting
---
Start the thesis notes in one place and see whether chapters write themselves.

## Links

about:: [[Writing]]
```

In Obsidian you would run **Typed Graph: New typed note** and pick `FleetingNote`. The plugin writes the frontmatter with the type and its defaults (`status: inbox`), fills in the template, and gives the note a time-ordered `uid` (a UUIDv7), so the note keeps one identity when you rename the file.

### Read and mark

Reading *How to Take Smart Notes*, you mark a sentence on page 12. A highlight is raw material, and it must say where it came from:

```markdown
---
type: Highlight
page: "12"
color: yellow
saved: 2026-01-13
---
Writing is not the outcome of thinking; it is the medium in which thinking takes place.

## Links

highlighted_in:: [[How to Take Smart Notes]]
about:: [[Writing]]
```

### Say it in your own words

The literature note is where reading becomes understanding. It cites the source with a page and points at the highlight it interprets:

```markdown
---
type: LiteratureNote
created: 2026-01-13
---
In my own words: you do not first think and then write. You think by
writing, so take notes as part of the thinking and not as storage for
it afterwards.

## Links

cites:: [[How to Take Smart Notes]] {page: "12"}
based_on:: [[Writing is the medium of thinking (highlight)]]
about:: [[Writing]]
```

### Make it yours

A permanent note is not a summary of a source. It is your claim, and it says which notes it grew out of and where it sits among your other ideas:

```markdown
---
type: PermanentNote
created: 2026-01-15
confidence: high
luhmann: "2"
---
Thinking that stays in your head is vague; writing it down forces you
to find out what you actually mean.

## Links

derived_from:: [[Ahrens: write to think]]
derived_from:: [[Luhmann: the slip box answers back]]
about:: [[Writing]]
example_of:: [[Notes are only useful when linked]]
```

The `luhmann` property is a Luhmann id. Luhmann numbered his cards so that a new thought could branch off an existing one: `1`, then `1a` as a continuation, `1a1` as a branch of that, then `2` for a new line. The plugin has three commands for it: **New child note**, **New sibling note** and **New top-level note**. Each computes the next free id, and the child and sibling commands fill a `follows` link to the parent through the template:

```markdown
## Idea

One idea, in my own words.

## Links

follows:: {{parent-link}} {luhmann: "{{luhmann}}"}
- derived_from::
- extends::
- supports::
- contradicts::
```

The empty edge lines in the template are prompts. They remind you, at the moment of writing, to ask "what does this build on, and what does it disagree with?" That is the question the method is built around.

### Disagree on the record

The example's first fleeting note was a belief the student later dropped: "A folder tree is all the structure a note system needs." Instead of deleting it, the permanent note that replaced it records the disagreement:

```markdown
derived_from:: [[Folders are enough]] {transform: "rejected: structure from place, not from links"}
-contradicts:: [[Folders are enough]] {why: "structure from place, not from links"}
```

The leading `-` makes the edge negative, and the `why` says what the disagreement is. Most note systems lose the ideas you changed your mind about. Here they stay, marked as contradicted, with the reason attached.

### Give it a way in, and put it to work

A structure note orders a line of thought. The `order` on each edge is the reading order:

```markdown
indexes:: [[Notes are only useful when linked]] {order: 1}
indexes:: [[Write for your future self]] {order: 2}
indexes:: [[One idea per note]] {order: 3}
indexes:: [[Writing is how thinking happens]] {order: 4}
```

A project note says which notes feed which part of the work:

```markdown
draws_on:: [[Note-taking index]] {chapter: "2"}
draws_on:: [[Writing is how thinking happens]] {chapter: "2"}
draws_on:: [[Tietze and Fast: note types]] {chapter: "3"}
```

Nothing here is exotic. Each note is a page of prose with a few typed lines at the bottom. The discipline the method asks for is the same as on paper. The difference is that the discipline is now visible to a machine.

## Your books and articles are part of the graph

Most note systems treat sources as attachments: a citation at the bottom of a note, or a PDF in a folder. In this ontology a book is a node like any other, with the edges `authored_by`, `about`, and incoming `cites` and `highlighted_in`.

That turns the whole provenance of an idea into a path you can walk. Take a permanent note and follow `derived_from`, `based_on` and `highlighted_in` outward:

```cypher
MATCH path = (p:PermanentNote {title: 'Naming a fear widens attention'})
             -[:derived_from|based_on|highlighted_in*1..3]->(src)
RETURN nodes(path) AS trail, length(path) AS hops ORDER BY hops
```

The longest result is the full chain:

```
Naming a fear widens attention   (PermanentNote)
  ← Herbert: fear narrows the mind (LiteratureNote)
    ← Fear is the mind-killer        (Highlight)
      ← Dune                          (Book, BookSource)
```

That idea came from a novel, which brings us to the second ontology.

## Two ontologies, one life

You read for more reasons than your Zettelkasten. You keep a reading list with what you want to read, what you are reading and what you gave up on. You rate books, track series, and keep quotes you love but will never turn into an idea. That is a different ontology with different concerns, and the gallery has one: **Library**, with `Book`, `Author`, `Series`, `Genre` and `Quote`.

```yaml
schemas:
  Book:
    properties:
      status: {values: [wishlist, to-read, reading, finished, abandoned], default: to-read}
      format: {values: [paper, ebook, audio]}
      rating: number
      started: date
      finished: date
    edges:
      written_by: {target: Author, required: true}
      in_series: Series
      has_genre: Genre
      sequel_of: Book
edgeTypes:
  in_series: {from: Book, to: Series, properties: {volume: number}}
```

You could merge the two ontologies into one big schema, and you would regret it. The Zettelkasten would grow fields about shelves and formats it does not care about. The library would learn about literature notes it does not need. Every update to either would become a manual merge.

Instead, keep both as they are and compose them. Composition in Typed Graph is deliberately simple: put the schema notes in the same schema folder. Three notes make up the vault in this article:

```
Types/
  core-types.md     edge types shared by several ontologies
  Zettelkasten.md
  Library.md
```

### Why the names do not collide

Look at the Zettelkasten's source types: `BookSource` and `Writer`, not `Book` and `Author`. That is on purpose. The two ontologies were designed to meet, so the Zettelkasten avoids the library's names. Its README says: *"Writers are `Writer` here so the ontology composes with the library's `Author`."*

The shared words live in `core-types.md`. `contradicts` and `derived_from` are used by more than one ontology in the gallery, so they are declared once there, without restricting their ends. Each ontology then says which of its own types may use them. (The [composable ontologies](blog-composable-ontologies.html) article tells the story of how that rule was found: by putting five ontologies in one folder and reading the clashes.)

### One book, two roles

*Dune* is a book on your shelf and a source for your slip box. Do not make two notes. Give one note both labels:

```markdown
---
type: [Book, BookSource]
status: finished
format: paper
rating: 5
pages: 612
year: 1965
started: 2026-02-01
finished: 2026-02-20
---
The desert planet, spice and a young duke's son.

## Links

written_by:: [[Frank Herbert]] {role: "author"}
authored_by:: [[Frank Herbert]] {role: "author"}
in_series:: [[Dune Chronicles]] {volume: 1}
has_genre:: [[Science fiction]]
```

The note now has the properties and edges of both types. Your reading log sees a finished five-star paperback in a series, and your literature notes can `cite` it, because it is a `BookSource`.

The same move works for the author (`type: [Author, Writer]`) and for the quote you saved, which is also the highlight your literature note is based on:

```markdown
---
type: [Quote, Highlight]
page: 8
saved: 2026-02-03
---
I must not fear. Fear is the mind-killer.

## Links

quoted_from:: [[Dune]]
highlighted_in:: [[Dune]]
about:: [[Attention]]
```

You may notice that the author is linked twice, with `written_by` for the library and `authored_by` for the Zettelkasten. Each ontology requires its own edge, so a note with both labels carries both. This is the honest cost of composing two ontologies you did not write together: a line of duplication instead of a merged schema. If it starts to bother you, move one author edge into `core-types.md` and have both types allow it. That is exactly the rule for shared words.

### The composed vault checks clean

The vault for this article has the Zettelkasten and Library examples, plus a few notes connecting them: *Dune*, *Frank Herbert* and *How to Take Smart Notes* with two labels each, the quote as a highlight, a literature note on the litany against fear, a permanent note that grew out of it, and an `Attention` topic. With all three schema notes loaded:

```
notes=37 schemas=15 edgeTypes=22 diagnostics=0
```

That is 34 data notes and 3 schema notes, 15 types and 22 edge types across two ontologies and the core, and no clashes.

To see that the checks are real, add two mistakes. A literature note that cites *Dune Messiah*, which is only labeled `Book`, and a highlight with no source:

```
Zettelkasten/Herbert: power and prophecy.md:8  Edge 'cites' expects target type BookSource or ArticleSource, found Book
Zettelkasten/The spice must flow.md:0          Missing required edge 'highlighted_in' for type Highlight
```

The first message is the useful one. It is not a typo check. It is the composition telling you that a book from your reading list has not become a source in your slip box yet. Adding `BookSource` to its labels is the fix, and also a small decision: *this book is now something I think with.*

## Asking the box questions

This is where the slip box starts to answer back. Every query below is openCypher, which the Obsidian plugin runs live inside a `graph-query` code block:

````markdown
```graph-query
view: table

MATCH (f:FleetingNote {status: 'inbox'})
RETURN f.title, f.created, f.context ORDER BY f.created
```
````

The block re-runs when your notes change. Put a handful of them on a dashboard note and you have a cockpit for your thinking. Here are the questions, with the answers from the composed vault.

### What have I not processed yet?

```cypher
MATCH (f:FleetingNote {status: 'inbox'})
RETURN f.title, f.created, f.context ORDER BY f.created
```

```
Try a slip box for the thesis      2026-01-18  after the supervisor meeting
Do novels belong in the slip box   2026-02-23  after finishing Dune
```

The method says fleeting notes live for a day or two. The first one has been in the inbox since January.

### Which ideas have no home?

A permanent note that no structure note indexes can only be found by accident. Ask for permanent notes with no incoming `indexes`:

```cypher
MATCH (p:PermanentNote)
OPTIONAL MATCH (s:StructureNote)-[:indexes]->(p)
WITH p, s WHERE s IS NULL
RETURN p.title AS unindexed
```

```
Naming a fear widens attention
```

That is the idea from *Dune*. It was written after the structure note, and nobody went back to place it.

### Which ideas are barely connected?

An idea that nothing else builds on is either new or forgotten. Count incoming links from other permanent notes:

```cypher
MATCH (p:PermanentNote)
OPTIONAL MATCH (p)<-[r]-(:PermanentNote)
WITH p, count(r) AS incoming
RETURN p.title, p.confidence, incoming ORDER BY incoming
```

```
Naming a fear widens attention     medium  0
One idea per note                  medium  0
Write for your future self         medium  1
Writing is how thinking happens    high    2
Notes are only useful when linked  high    4
```

The two ideas held with `high` confidence are also the two most built upon. Whether that is because they are right or because you wrote them first is a question worth asking yourself.

### How do my ideas hang together?

```cypher
MATCH (a:PermanentNote)-[r:supports|extends|example_of|follows]->(b:PermanentNote)
RETURN a.title, type(r), b.title
```

```
Naming a fear widens attention     follows     Writing is how thinking happens
Naming a fear widens attention     extends     Writing is how thinking happens
Notes are only useful when linked  supports    Write for your future self
One idea per note                  supports    Notes are only useful when linked
Write for your future self         extends     Notes are only useful when linked
Write for your future self         follows     Notes are only useful when linked
Writing is how thinking happens    example_of  Notes are only useful when linked
```

This is the argument structure of your slip box, not just its link structure. Return the nodes and edges instead of their titles (`RETURN a, r, b`) and the block draws them as a graph, styled by the schema: permanent notes in amber, `follows` dotted, `contradicts` dashed red.

### Where did I change my mind?

```cypher
MATCH (a)-[r:contradicts]->(b)
RETURN a.title, r.sign, r.why, b.title
```

```
Notes are only useful when linked  -1  structure from place, not from links  Folders are enough
```

In a large box this list is the most interesting page you own. It is the record of what you used to believe, and why you stopped.

### Read the Luhmann sequence

```cypher
MATCH (p:PermanentNote) RETURN p.luhmann, p.title ORDER BY p.luhmann
```

```
1   Notes are only useful when linked
1a  Write for your future self
2   Writing is how thinking happens
2a  Naming a fear widens attention
3   One idea per note
```

This is Luhmann's reading order: a line of thought, its continuations, then the next line. `2a` is the idea from *Dune*, filed as a continuation of "writing is how thinking happens", which is exactly where it belongs.

### Which books actually changed my thinking?

Here the two ontologies start to pay off. A book changed your thinking if a permanent note derives from a literature note that cites it:

```cypher
MATCH (b:Book)<-[:cites]-(l:LiteratureNote)<-[:derived_from]-(p:PermanentNote)
RETURN b.title AS book, count(DISTINCT p) AS ideas ORDER BY ideas DESC
```

```
How to Take Smart Notes  2
Dune                     1
```

Set that against your reading log. Every finished book, its rating, and how many literature notes it produced:

```cypher
MATCH (b:Book {status: 'finished'})
OPTIONAL MATCH (l:LiteratureNote)-[:cites]->(b)
WITH b, count(l) AS notes
RETURN b.title, b.rating, notes ORDER BY notes
```

```
Dune                     5  1
How to Take Smart Notes  5  1
```

In a real library this list is long, and its top rows, the finished books with zero notes, are the books you enjoyed and did not digest. The rating comes from the library ontology and the notes from the Zettelkasten. Neither ontology could answer this alone.

### Which of my ideas came from fiction?

```cypher
MATCH (p:PermanentNote)-[:derived_from]->(:LiteratureNote)-[:cites]->(b:Book)-[:has_genre]->(g:Genre)
RETURN p.title AS idea, b.title AS book, g.title AS genre
```

```
Naming a fear widens attention   Dune                     Science fiction
Write for your future self       How to Take Smart Notes  Non-fiction
Writing is how thinking happens  How to Take Smart Notes  Non-fiction
```

Genre is a library concept and "idea" is a Zettelkasten concept. The query walks from one ontology into the other across the book that has both labels. This is the kind of question that makes composition worth the effort: it was never designed into either schema, and it still has a precise answer.

### What should I re-read before I continue?

You are halfway through *Dune Messiah*. What did you think about the book before it?

```cypher
MATCH (b:Book {status: 'reading'})
MATCH (b)-[:sequel_of]->(prev)<-[:cites]-(l:LiteratureNote)
RETURN b.title AS reading, prev.title AS previous, collect(l.title) AS my_notes
```

```
Dune Messiah  Dune  ["Herbert: fear narrows the mind"]
```

`sequel_of` comes from the library and `cites` from the Zettelkasten. The answer is your own notes, served when they are relevant.

### Who do I actually think with?

```cypher
MATCH (w:Writer)<-[:authored_by]-(s)<-[:cites]-(n)
RETURN w.title, collect(DISTINCT s.title) AS sources, count(n) AS citations
ORDER BY citations DESC
```

```
Sönke Ahrens      ["How to Take Smart Notes"]                 3
Frank Herbert     ["Dune"]                                    1
Christian Tietze  ["Introduction to the Zettelkasten Method"] 1
Niklas Luhmann    ["Communicating with Slip Boxes"]           1
Sascha Fast       ["Introduction to the Zettelkasten Method"] 1
```

### Where could two ideas meet?

This is the question Luhmann meant when he said the box would surprise him. Find pairs of permanent notes about related topics that do not link to each other yet:

```cypher
MATCH (a:PermanentNote)-[:about]->(t1:Topic)-[:related_to]-(t2:Topic)<-[:about]-(b:PermanentNote)
WHERE t1 <> t2 AND id(a) < id(b)
OPTIONAL MATCH (a)-[x]-(b)
WITH a, b, t1, t2, x WHERE x IS NULL
RETURN DISTINCT a.title, b.title
```

```
One idea per note           Write for your future self
Write for your future self  Writing is how thinking happens
```

The query does not decide whether the pairs belong together. It proposes. Is "one idea per note" a way of "writing for your future self"? Probably: a small note is easier to understand six months later. If so, you now have a new `supports` edge to write, and a sentence explaining *how*. The machine found the gap, and you supply the judgment.

That division of labor is the whole design. The ontology makes your judgments explicit (this extends that, this contradicts that), and queries look for the places where a judgment is missing.

## Letting an agent think with you

Queries are questions you know how to ask. Sometimes you want to ask in plain language: *what do I think about attention, and where did it come from?*

The Typed Graph sidecar is a small headless service that reads the same vault. It exposes it to agents over MCP with three read-only tools:

- **`cypher_query`** runs the same openCypher as the queries above.
- **`vector_search`** finds notes, and edges, by meaning.
- **`graphrag_retrieve`** combines the two: it finds the closest notes and edges, expands their graph neighborhood a hop or two, and returns the best passages, each cited with the note path and heading.

Edges are searchable by meaning because each one is turned into a sentence before it is embedded, built from its two ends, their types and its properties. `contradicts` with a `why` becomes a sentence about the contradiction and the reason for it, so a question like "what did I stop believing about folders?" can land on the edge itself, not only on the notes at either end.

Connect it to Claude Code or any MCP client:

```
claude mcp add obsigraph -e OBSIGRAPH_VAULT=/path/to/vault -e OBSIGRAPH_DATA=/path/to/data -- node server.mjs --stdio
```

Then the questions get looser. "Which ideas in my box came from novels, and do any of them disagree with what I took from non-fiction?" An agent can translate that into the genre query above, follow the `contradicts` edges, and answer with citations to your own notes.

Keep the roles straight, though. An agent is good at finding: paths, gaps, neighbors and passages you forgot. It is a poor author of permanent notes, because a permanent note is a claim *you* hold, in *your* words. Let it propose `supports` edges and draft literature notes for you to rewrite. Do not let it write your ideas. A slip box full of an agent's opinions answers back in someone else's voice.

## What it does not do

- **It does not think for you.** Every answer above is a consequence of links you wrote. A box with sloppy links gives sloppy answers. The types make sloppiness visible, but they do not prevent it.
- **Validation is advisory.** A literature note without a source is a warning, not an error. You can ignore the warnings, and your box will slowly become a folder again.
- **The query engine is a subset of openCypher.** It has matching, optional matches, variable-length paths and aggregation. It does not have pattern predicates in `WHERE`, so "has no such edge" is written as `OPTIONAL MATCH … WITH … WHERE x IS NULL`, as in the queries above. Anything unsupported fails by name, with a line and column.
- **Composition has rules, and they are yours to apply.** A type or edge type is declared once. If two ontologies you add need the same word, move it into the core. A note with two labels carries the required edges of both.
- **The ontologies are starting points.** You will rename things. You may decide `confidence` should be a number, or that you want a `Question` type for open problems. The schema is a note, so changing it is an edit.

## Build your own

1. Download [zettelkasten.zip](ontologies/zettelkasten.zip) and [library.zip](ontologies/library.zip) from the [ontology gallery](ontologies.html), or [all.zip](ontologies/all.zip) for every ontology composed. Each one includes the shared `core-types.md`.
2. Put the `Types/` notes in one schema folder of your vault (the plugin's default is `Types/`), and install the Typed Graph plugin in Obsidian.
3. For every book you think with, add `BookSource` to its labels and `authored_by` next to `written_by`. Do the same for its author with `Writer`.
4. Write one literature note in your own words, then one permanent note that `derived_from` it.
5. Make a dashboard note with the inbox, unindexed and "where could two ideas meet" queries in `graph-query` blocks, and open it every morning.

Luhmann's cabinet took him decades to fill before it started answering back. Yours will start answering as soon as two of your ideas are linked by an edge that says what the link means, and it will tell you, in plain queries, where the next link should go.

---

*Typed Graph, the `tg` CLI and the sidecar are open source (MIT). The ontologies are plain Markdown in the [ontology gallery](ontologies.html), and the Typed Graph Schema is an open specification. Docs and other articles are at [typedgraph.org/](https://typedgraph.org/).*
