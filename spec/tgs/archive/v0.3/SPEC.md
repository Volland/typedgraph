# Typed Graph Schema (TGS) 0.3

| | |
|---|---|
| **Version** | 0.3 (published 2026-10-14; immutable) |
| **Previous** | [0.2](../v0.2/) |
| **This version** | `https://volland.github.io/obsigraph/spec/tgs/v0.3/` |
| **JSON Schema** | `https://volland.github.io/obsigraph/spec/tgs/v0.3/tgs.schema.json` |
| **Namespace** | `https://volland.github.io/obsigraph/ns/tgs#` (prefix `tgs:`) |
| **Editor** | Volodymyr Pavlyshyn |
| **Source** | `spec/tgs/` in [github.com/Volland/typedgraph](https://github.com/Volland/typedgraph) |
| **License** | Text: CC BY 4.0. JSON Schema and examples: MIT. |

TGS describes the types of a knowledge graph kept as markdown or AsciiDoc notes: what properties a note of a type has, which typed links it may have to which other types, and what properties those links carry. A schema is ordinary YAML frontmatter in ordinary notes, so people can write and review it by hand, and it maps to and from W3C SHACL so the same ontology can be exchanged with RDF tools.

TGS is independent of any one application. Typed Graph (an Obsidian plugin and CLI) is the reference implementation.

## 1. Conventions

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as described in RFC 2119 when they appear in capitals.

- A **vault** is a folder of notes. Paths are vault-relative and use `/`.
- A **note** is a Markdown (`.md`) or an AsciiDoc (`.adoc`) file. Its **title** is its file name without the extension; the document title of an AsciiDoc note takes its place when it has one (section 2.1).
- **Frontmatter** is a YAML 1.2 mapping between a first line `---` and the next line `---` or `...`. An AsciiDoc note has no frontmatter; section 2.1 says where its properties come from.
- A **data note** is any note that is described by a schema. A **schema note** is a note that declares schemas.
- A **reader** is a program that reads schema notes. Section 14 defines conformance levels.

## 2. Data model

TGS types a labelled property graph built from notes:

- Each note is a **node**. Its **labels** are the type names in its frontmatter `type` (a string or a list of strings), followed by those in `types`, without duplicates. Its **properties** are its frontmatter keys.
- An **edge** has a source note, a target note, an **edge type** (a name) and properties (a mapping of scalars or lists). How edges are written in markdown is up to the host. In the reference implementation an edge is one line, `worksAt:: [[Acme]] {since: 2020}`.
- A link to a note that does not exist creates a **stub** node with no labels.

### 2.1 AsciiDoc notes

A reader MAY read `.adoc` files as notes. An AsciiDoc note is ordinary AsciiDoc: every form below hides in a comment or a header attribute, so a standard AsciiDoc processor renders the file exactly as it would without the graph metadata.

- **Properties.** If the first block of the file, before the document title, is a `////` comment block, its content is read as YAML with the same meaning as frontmatter, including `type` and `types`. The content MAY be wrapped in `---` lines. Content that is not a YAML mapping yields no properties and one error, as for broken frontmatter. A later `////` block never holds properties. Header attributes named `:tg-<key>: <value>` set property `<key>`, the value read as one-line YAML; attributes without the `tg-` prefix are not properties. When both set a key, the comment block wins and a validator SHOULD report the conflict.
- **Title.** The title of the note is its document title (`= Title`), else its file name without `.adoc`.
- **Edges.** Edges are read only from line comments `// @tg: <edge line>` and from `////` blocks whose first content line is `@tg` and whose other non-blank lines are edge lines, in the syntax of section 2. Edge syntax outside a comment is not an edge, and a comment inside a verbatim block (listing, literal, passthrough, table) is not read.
- **Anchoring.** An edge written in a comment records the canonical id of its section as property `section`. A comment followed, before the next heading, only by blank lines, block attribute lines, anchors or other comments belongs to that heading's section; any other comment belongs to the section containing it; a comment before the first section heading belongs to the note and has no `section`.
- **Sections.** Headings `==` to `======` form sections with heading-path ids, `<path>#<Heading>#<Sub>`. Explicit ids and the ids a processor generates (honouring `:idprefix:` and `:idseparator:`) resolve to the same section. `[discrete]` headings and heading-like lines inside delimited blocks are not sections.
- **Links.** `xref:` and `<<...>>` references MAY be read as plain link edges, resolved relative to the file, with a `#id` fragment naming a section. `include::` directives are edges of type `includes` with an `order` property and the `leveloffset`, `tags` and `lines` attributes when present; included text is not merged into the including note.
- **Resolution across formats.** A link without an extension matches notes of both formats. When it matches both `X.md` and `X.adoc` it is ambiguous: a reader MUST report it and MUST NOT resolve it. A link with an extension matches that file only.
- **Limits.** Schema notes are Markdown. A template that is an `.adoc` file creates `.adoc` notes, with the leading block and the `:tg-*:` attributes filled in.

A chapter with properties and comment edges:

```asciidoc
////
type: Chapter
status: draft
////
= Metagraphs
:tg-pages: 12

// @tg: cites:: [[Pavlyshyn 2024]] {page: 12}
[#definition]
== Definition

A metagraph generalizes a hypergraph.

// @tg: defines:: [[Metagraph]]
```

reads as a node `book/ch03.adoc` with label `Chapter`, title `Metagraphs` and properties `status: draft` and `pages: 12`, and two edges:

| Type | Target | Properties |
|---|---|---|
| `cites` | `Pavlyshyn 2024` | `page: 12`, `section: book/ch03.adoc#Definition` |
| `defines` | `Metagraph` | `section: book/ch03.adoc#Definition` |

The id `definition` resolves to the section `book/ch03.adoc#Definition`.

## 3. Schema notes

A schema note is a markdown note located directly in the **schema folder**. The schema folder is a reader setting whose default is `Types/`. Notes in subfolders of the schema folder, and notes elsewhere in the vault, MUST NOT be read as schema notes.

A schema note's frontmatter MAY contain these keys, in any combination:

| Key | Value | Declares |
|---|---|---|
| `schema` | type declaration (section 4) | the type named by the note's title |
| `schemas` | mapping: type name → type declaration | any number of types |
| `edgeTypes` | mapping: edge type name → edge type declaration (section 6) | edge types |
| `prefixes` | mapping: prefix → IRI | CURIE prefixes for the whole vault (section 7) |
| `tgs` | version string, e.g. `"0.1"` | the TGS version the note is written for (section 12) |

A schema note with none of `schema`, `schemas`, `edgeTypes` and `prefixes` declares an empty type named by its title. All other frontmatter keys belong to the note itself and readers MUST ignore them. The body of a schema note is free text, except that the body of a note with `schema` is the template of that type (section 8).

One note can therefore describe a single type:

```yaml
# Types/Person.md
---
schema:
  properties:
    name: text
    email: {kind: text, required: true}
  edges: {worksAt: Company, knows: Person}
---
## Notes
```

or a whole subsystem:

```yaml
# Types/People and Orgs.md
---
schemas:
  Person:
    properties: {name: text, email: {kind: text, required: true}}
    edges: {worksAt: Company, knows: Person}
  Company:
    uri: schema:Organization
    properties: {name: text, founded: date}
edgeTypes:
  worksAt:
    from: Person
    to: Company
    properties: {since: date, role: {kind: text, values: [engineer, manager]}}
---
How people and organisations relate.
```

### 3.1 Duplicates

When the same type name, edge type name or prefix is declared more than once, readers MUST use the declaration from the schema note whose path sorts first (by code point) and MUST report a `duplicate-declaration` naming both notes. A prefix declared twice with the same IRI is not a duplicate.

## 4. Type declarations

A type declaration is a mapping with these optional keys:

| Key | Value | Meaning |
|---|---|---|
| `uri` | IRI or CURIE | identifier of the type; default: base IRI + type name |
| `properties` | section 5 | frontmatter properties of notes of this type |
| `edges` | section 5.3 | allowed outgoing edges; absent means any edge is allowed |
| `template` | link | template note for new notes of this type (section 8) |
| `id` | section 8.1 | identifiers generated for new notes of this type (0.2) |
| `visualization` | mapping | display hints (section 11); `style` is an alias |

An empty mapping (`{}`) or a null value declares a type with no constraints.

## 5. Properties and edges

### 5.1 Property declarations

`properties` is either a mapping from property name to a property declaration, or a list whose items are a property name (a text property) or a mapping with a `name` key. A property declaration is either a **kind shorthand** (`born: date`) or a mapping:

| Key | Value | Default | Meaning |
|---|---|---|---|
| `kind` | one of the kinds below | `text` | value type |
| `required` | boolean | `false` | the note must have a non-empty value |
| `many` | boolean | `false` | the value is a list (always true for kind `list`) |
| `values` | list of scalars | none | allowed values (an enumeration) |
| `default` | any YAML value | none | value written into new notes |
| `uri` | IRI or CURIE | base IRI + name | identifier of the property |

A null declaration (`name:`) is a text property. Within one type, the first declaration of a property name wins.

### 5.2 Kinds

| Kind | Values | Obsidian property type | XSD datatype |
|---|---|---|---|
| `text` | string | Text | `xsd:string` |
| `number` | number | Number | `xsd:decimal` |
| `boolean` | `true` / `false` | Checkbox | `xsd:boolean` |
| `date` | `YYYY-MM-DD` | Date | `xsd:date` |
| `datetime` | ISO 8601 date and time | Date & time | `xsd:dateTime` |
| `link` | a link to a note or a URL | Text (link) | none; an IRI |
| `list` | list of strings | List | `xsd:string`, many |

An unknown kind MUST be read as `text` and reported as `unknown-kind`. TGS 0.1 does not require readers to check that values match their kind.

### 5.3 Edges of a type

`edges` lists the edge types a note of this type may have as outgoing edges. Two forms are allowed.

The **list form** names edge types, each accepting any target: `edges: [knows, worksAt]`.

The **map form** maps each edge type to its target type, or to a list of target types, or to null (any target), or to a mapping:

| Key | Value | Default | Meaning |
|---|---|---|---|
| `target` | type name or list | any | allowed target types |
| `many` | boolean | `true` | more than one edge of this type is allowed |
| `required` | boolean | `false` | at least one edge of this type is required |

```yaml
edges:
  worksAt: Company                          # one target type, many, optional
  knows: [Person, Bot]                      # several target types
  mentor: {target: Person, many: false, required: true}
  likes:                                    # any target
```

Properties default to a single value and edges default to many, because repeated edges of one type are normal (`knows`) and frontmatter values usually are not. An empty list or mapping (`edges: []`) allows no outgoing edges.

## 6. Edge type declarations

An edge type declaration describes an edge type everywhere it is used:

| Key | Value | Meaning |
|---|---|---|
| `from` | type name or list | allowed source types; absent means any |
| `to` | type name or list | allowed target types; absent means any |
| `properties` | as in 5.1 | properties written on the edge |
| `uri` | IRI or CURIE | identifier of the edge type (an RDF predicate); default: base IRI + name |
| `visualization` | mapping | display hints for edges of this type (section 11); `style` is an alias |

Undeclared edge properties are allowed. When both a type's `edges` entry and the edge type declare targets, the type's entry wins for sources of that type.

## 7. Identifiers

Every type, property and edge type has an IRI, so that schemas can be exchanged.

- `uri` holds a full IRI (`https://schema.org/Person`, `urn:isbn:0451450523`) or a CURIE (`schema:Person`).
- A value whose part after the first colon starts with `//` is a full IRI. Otherwise `p:local` expands to the IRI of prefix `p` followed by `local` when `p` is a known prefix, and is a full IRI when `p` is one of the schemes `http`, `https`, `urn`, `mailto`, `tag`, `did` and `file`.
- Built-in prefixes: `rdf`, `rdfs`, `xsd`, `sh` (SHACL), `schema` (`https://schema.org/`), `foaf` and `tgs`. A `prefixes` key in any schema note adds prefixes for the whole vault and MAY override a built-in one.
- A CURIE with an unknown prefix MUST be reported as `unknown-prefix`.
- A declaration without `uri` is named by the **base IRI** followed by its percent-encoded name. The base IRI is a reader setting whose default is `urn:tgs:`.

## 8. Templates

A reader that creates notes from types MUST build the new note's frontmatter from `type: <name>` and every declared `default`, and MUST take the body from the first of:

1. the note that the type's `template` link points to, without its frontmatter;
2. the body of the schema note, when the type is declared with `schema`, if that body is not empty;
3. a template **generated** from the schema.

A `template` link is a wikilink (`[[Templates/Person]]`, resolved as the host resolves links), a markdown link (`[Person](../Templates/Person.md)`, relative to the schema note), or a vault-relative path (`Templates/Person`, `.md` optional).

A generated template SHOULD write a key for every declared property (its default, `[]` for many, empty otherwise) and one placeholder per declared edge that does not itself create an edge, so that a new note is complete but creates no links until it is filled in. The reference implementation writes `## Notes` followed by `## Relations` with one `- <edgeType>::` line per edge.

### 8.1 Note identifiers

The `id` key (added in 0.2) names the identifiers a reader generates when it creates a note of the type. It is one **id rule**, or a list of rules. A rule is a kind (`id: uuid7`) or a mapping:

| Key | Value | Default | Meaning |
|---|---|---|---|
| `kind` | `uuid`, `uuid7`, `timestamp` or `luhmann` | required | how the id is made |
| `property` | property name | `id` | frontmatter property that holds the id; required for each rule of a list |
| `auto` | boolean | `true`, except `false` for `luhmann` | generate on every new note; otherwise only when the user asks (for `luhmann`, by placing the note under another) |
| `filename` | boolean | `false` | prefix the file name with the id and a space |

The kinds are:

- `uuid`: a random UUID (RFC 9562 version 4).
- `uuid7`: a time-ordered UUID (RFC 9562 version 7), whose first 48 bits are the Unix time in milliseconds, so ids made later sort later as strings.
- `timestamp`: `YYYYMMDDHHmm` in local time; if the id is in use, the next minute is tried until one is free.
- `luhmann`: a branching id in Luhmann's style: numbers and letters alternate, as in `1`, `1a`, `1a1`, `1a2`, `1b`, `2`. A new root is one more than the largest top-level number. A child of an id ending in a digit appends `a`, and a child of an id ending in a letter appends `1`. A sibling increments the last segment (numbers by one, letters as `a` to `z`, then `aa`). Any id already in use is skipped.

A reader MUST generate ids that are not in use for the same `property` in the vault, MUST write each generated id as a text property of the new note, and SHOULD treat a property named by a rule but not declared in `properties` as a declared text property. A reader MUST report an unknown kind, an unknown key, a list entry without `property` and a repeated `property` as `invalid-declaration` and MUST ignore that rule.

A template (section 8) MAY use these tokens, which a reader that supports them replaces: `{{title}}`, `{{date}}` (`YYYY-MM-DD`), `{{time}}` (`HH:mm`), `{{id}}` (the first generated id), `{{<property>}}` for each generated id, and for a note placed under a parent, `{{parent}}` (its title), `{{parent-id}}` and `{{parent-link}}` (a wikilink to it). Other double-brace text MUST be left unchanged. A template line that contains a parent token is removed when the note has no parent.

## 9. Validation

Validation is advisory. A validator MUST report diagnostics and MUST NOT remove notes or edges from the graph. Stub targets and targets without labels are never reported as having the wrong type.

For a node with labels L1, L2, …, the **effective schema** merges the schemas of its labels in order: the first declaration of a property wins; edge rules are unioned per edge type, with targets unioned (any target if one rule allows any), `many` if any rule allows many and `required` if any rule requires it; `edges` is unrestricted only if no label declares it.

| Diagnostic | Reported when |
|---|---|
| `invalid-declaration` | a key has a value of the wrong shape (e.g. `edges: 5`) |
| `unknown-kind` | a property declares an unsupported kind |
| `duplicate-declaration` | section 3.1 |
| `unknown-prefix` | section 7 |
| `unsupported-version` | section 12 |
| `unknown-key` | section 12 |
| `missing-property` | a `required` property is absent, null or empty |
| `value-not-allowed` | a property value, or an item of a list value, is not in `values` |
| `unexpected-list` | a property that is not `many` holds a list |
| `edge-not-allowed` | an outgoing edge type is not in the effective `edges` |
| `missing-edge` | a `required` edge has no edge of its type |
| `too-many-edges` | an edge that is not `many` has more than one edge of its type |
| `wrong-target-type` | the target has labels and none is an allowed target type |
| `wrong-source-type` | the source has labels and none is in the edge type's `from` |
| `missing-edge-property` | a `required` edge property is absent from the edge |
| `edge-value-not-allowed` | an edge property value is not in its `values` |

Readers SHOULD report each diagnostic with the note path and, for edges, the line of the edge. Message text is not specified.

## 10. Multiple labels

A note with `type: [Person, Employee]` is checked against the merged schema of section 9. The style of a node is taken attribute by attribute from the first label that supplies it.

## 11. Visualization (informative)

`visualization` is a hint for graph displays and does not affect validation. The reference implementation reads `color` (CSS color), `shape`, `icon` (a Lucide icon name) and `label` (a property shown as the node label) for types, `color` and `line` (`solid`, `dashed`, `dotted`) for edge types, and an `edges` mapping inside a type's `visualization` that styles edge types. An edge type's own `visualization` wins over a type's `visualization.edges`. Other readers MAY ignore `visualization` or read further keys.

## 12. Versioning

A schema note MAY declare `tgs: "<major>.<minor>"`. A reader implementing version M.N:

- MUST read a note that declares the same major version and a higher minor version, and MUST report each key inside a type or edge type declaration that it does not know as `unknown-key`;
- MUST report a note that declares another major version as `unsupported-version` and MUST NOT use its declarations;
- MUST read notes without `tgs` as version 0.1.

TGS 0.2 adds the `id` key (section 8.1) and the template tokens. TGS 0.3 adds AsciiDoc notes (section 2.1) and adds no schema key. Every 0.1 note is a valid 0.2 note, and every 0.2 note is a valid 0.3 note.

Minor versions only add optional keys. A published version never changes.

## 13. SHACL mapping

TGS maps to the W3C Shapes Constraint Language (SHACL) so that schemas can be exchanged with RDF tools. An **exporter** writes a schema set as SHACL in Turtle. An **importer** reads SHACL into TGS declarations.

### 13.1 Types and properties

Each type becomes a `sh:NodeShape` named base IRI + type name + `Shape`:

| TGS | SHACL |
|---|---|
| type `Person` | `sh:targetClass` = the type's IRI; `sh:name "Person"` |
| property | a property shape with `sh:path` = the property's IRI and `sh:name` = its name |
| kind `text`, `number`, `boolean`, `date`, `datetime` | `sh:datatype` per section 5.2 |
| kind `link` | `sh:nodeKind sh:IRI` |
| kind `list` | `sh:datatype xsd:string` and `tgs:kind "list"`, no `sh:maxCount` |
| `required: true` | `sh:minCount 1` |
| not `many` | `sh:maxCount 1` |
| scalar `default` | `sh:defaultValue` |
| list `default` | `tgs:default` with the value as a JSON literal |
| `values` | `sh:in ( … )` |
| declaration order | `sh:order 0, 1, …` |

### 13.2 Edges of a type

Each entry of a type's `edges` becomes a property shape on the type's shape:

| TGS | SHACL |
|---|---|
| edge type | `sh:path` = the edge type's IRI; `sh:name` = its name |
| one target | `sh:class` = the target type's IRI |
| several targets | `sh:or ( [ sh:class A ] [ sh:class B ] )` |
| any target | `sh:nodeKind sh:IRI` and `tgs:edge true` |
| `required: true` | `sh:minCount 1` |
| `many: false` | `sh:maxCount 1` |
| `edges` declared | `tgs:edgesClosed true` on the node shape |

`sh:closed` is not used, because it would also close frontmatter properties, which are open in TGS. `tgs:edgesClosed` records the allow-list without changing what SHACL engines validate.

### 13.3 Edge types

Each edge type becomes a `sh:NodeShape` named base IRI + name + `EdgeShape` that describes the edge as an RDF reification (`rdf:Statement`):

```turtle
:worksAtEdgeShape
    a sh:NodeShape ;
    sh:name "worksAt" ;
    sh:property [ sh:path rdf:predicate ; sh:hasValue schema:worksFor ] ;
    sh:property [ sh:path rdf:subject ; sh:class :Person ] ;
    sh:property [ sh:path rdf:object ; sh:class schema:Organization ] ;
    sh:property [ sh:path :since ; sh:name "since" ; sh:datatype xsd:date ; sh:maxCount 1 ; sh:order 0 ] .
```

The `rdf:predicate` constraint identifies the edge type; `rdf:subject` carries `from` and `rdf:object` carries `to` (with `sh:or` for several types); the remaining property shapes are the edge's properties. The shape declares no target, so validators apply it to reified statements on request. This uses only SHACL 1.0 and the RDF reification vocabulary; a later TGS version may add RDF 1.2 reifiers.

### 13.4 Annotations

What SHACL cannot express is kept as annotations, which SHACL engines ignore:

| Term | On | Value |
|---|---|---|
| `tgs:note` | node shape | path of the schema note that declared it |
| `tgs:template` | node shape | the `template` link |
| `tgs:templateBody` | node shape | the schema note body of a `schema` type |
| `tgs:visualization` | node shape | the `visualization` mapping as a JSON literal |
| `tgs:edgesClosed` | node shape | `true` when the type declares `edges` |
| `tgs:edge` | property shape | `true` for an edge entry without target types |
| `tgs:kind` | property shape | `"list"` for kind `list` |
| `tgs:default` | property shape | a non-scalar default as a JSON literal |

### 13.5 Import

An importer MUST read:

- a node shape with `sh:targetClass` as a type named by `sh:name`, else by the local name of the class IRI;
- a property shape with `sh:datatype` (mapped back per section 5.2; integer, double and similar numeric types are `number`) or `sh:nodeKind sh:IRI` as a property;
- a property shape with `sh:class`, `sh:node` (a shape with a target class), an `sh:or` of single `sh:class` alternatives, or `tgs:edge true`, as an edge of the type; its name is `sh:name`, else the name of the edge type with that predicate, else the local name of the path;
- a node shape whose property shape on `rdf:predicate` has `sh:hasValue` as an edge type, named by `sh:name`, else by the local name of the predicate;
- `sh:minCount` ≥ 1 as `required`, the absence of `sh:maxCount 1` as `many`, and the annotations of 13.4;
- a `uri` whenever an IRI differs from the base IRI + name, written as a CURIE when a prefix matches.

An importer MUST report, and otherwise skip, every construct outside this subset, including `sh:closed`, `sh:pattern`, `sh:minLength`, `sh:qualifiedValueShape`, `sh:sparql`, `sh:and`, `sh:xone`, `sh:not`, property paths other than a single IRI, unknown datatypes (read as `text`), `sh:maxCount` greater than 1 (read as many) and node shapes without a target class. It MUST import the rest of each shape.

An importer that writes notes SHOULD write one note per type by default (or group types by `tgs:note`), MUST replace only the `schema`, `schemas`, `edgeTypes` and `prefixes` keys of an existing note, MUST NOT delete notes, and SHOULD refuse to rewrite a note that declares types missing from the import unless the user asks. A note that declares several types has no template body, so an importer that groups types into one note SHOULD report each `tgs:templateBody` it cannot keep.

### 13.6 Round trip

For schemas written in TGS, export followed by import MUST reproduce the same types, edge types, properties, edges, identifiers, templates and visualization. Exporting the result again yields the same RDF graph; the reference implementation produces byte-identical Turtle.

## 14. Conformance

| Level | Requirements |
|---|---|
| **Reader** | sections 3 to 8 and 12: reads every key, applies defaults, expands identifiers, reports declaration diagnostics; a reader that reads `.adoc` notes also implements section 2.1 |
| **Validator** | Reader, plus section 9 |
| **SHACL exchanger** | Validator, plus section 13 |

The `examples/` folder next to this document contains conformance cases. Each case has a `vault/` folder (schema folder `Types/`, base IRI `urn:tgs:`) and an `expected.json` with:

- `types` and `edgeTypes`: the declarations a reader must produce, with defaults applied and identifiers expanded to IRIs;
- `diagnostics`: what a validator must report, each as `path`, `line` (the 1-based line of the edge, or null for a note-level diagnostic) and `diagnostic` (a name from section 9), in any order;
- `invalidAgainstJsonSchema`: the schema notes that must fail the JSON Schema of section 15.

SHACL cases also have a `shapes.ttl` that an exporter's output must be isomorphic to.

## 15. JSON Schema

`tgs.schema.json` (JSON Schema draft 2020-12) validates the TGS keys of a schema note's frontmatter. It is strict about TGS 0.3 keys and leaves `visualization` and all non-TGS keys open. Notes declaring a newer minor version may not validate against it.

## 16. References

- W3C, *Shapes Constraint Language (SHACL)*, https://www.w3.org/TR/shacl/
- W3C, *RDF 1.1 Turtle*, https://www.w3.org/TR/turtle/
- W3C, *RDF 1.1 Concepts*, reification vocabulary, https://www.w3.org/TR/rdf11-mt/#reification
- *Schema.org*, https://schema.org/
- JSON Schema 2020-12, https://json-schema.org/draft/2020-12
- RFC 2119, *Key words for use in RFCs to Indicate Requirement Levels*
