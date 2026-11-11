# Declaring document elements: one shape, one reading

*Typed Graph 0.26 let a type describe the XML blocks inside its documents. It also left the same declaration readable three ways and some of its rules unwritten. TGS 0.5 adds no key. It fixes how elements are declared, nested, counted and shown, so that a person and an agent read the same thing. This is the guide to writing them.*

---

## Three notations for one thing

[Explainable blocks](explainable-blocks.md) introduced `elements`: a type can say that its sections hold an `<option>`, a `<rule>` or a `<rollback>`, and what each one means. A runbook type declared its steps like this, in YAML:

```yaml
step:
  description: One action, in order, that an engineer or an agent can run.
  attributes:
    id: {description: Give one when an alert or a script points at the step.}
    risk: {values: [safe, disruptive], required: true, description: Whether the step can hurt users.}
  elements:
    check: {required: true, description: How to tell that the step worked.}
```

Then `tg ontology` 0.26.0, the listing an agent reads before it writes, showed it in a third notation:

```
      <step id risk=safe|disruptive!> — One action, in order, that an engineer or an agent can run.
        <check>  (required) — How to tell that the step worked.
```

`!` meant required, `(required, one)` meant something else, and the descriptions of `id` and `risk` were gone. A reader had to translate between YAML, XML and a private shorthand. The rules had gaps too. Nothing said where a nested tag counts, which attribute keys mean anything, or what a string or a list stands for. One gap gave a wrong answer: a required `<rollback>` wrapped in `<details>` was reported as missing.

TGS 0.5 settles all of it. Every 0.4 note is still valid.

## Rule 1: YAML declares, XML occurs

Each notation has one job. A schema note in `Types/` **declares** an element in YAML. A document **contains** it as XML. A declaration never uses XML, and a document never uses YAML for an element.

```yaml
# Types/Runbook.md, the declaration
rollback:
  description: How to undo the steps if they make things worse.
  required: true
  many: false
```

```markdown
<!-- lat.md/runbooks.md, the occurrence -->
<rollback>

Roll back to the previous release: `kubectl rollout undo deploy/token`.

</rollback>
```

The tool's listing is a reading of the YAML, so it now keeps the YAML's structure: the element, then its `attributes:`, then its nested `elements:`. Attributes are shown exactly as properties are shown. Here is the same runbook type in `tg ontology` today:

```
  Runbook  (Types/Runbook.md)
    How to operate one part of the system when something goes wrong.
    sections:
      ## Symptoms  (required) — What an on-call engineer sees first.
    elements:
      <step> — One action, in order, that an engineer or an agent can run.
        attributes:
          id (text) — Give one when an alert or a script points at the step.
          risk (text, safe|disruptive, required) — Whether the step can hurt users.
        elements:
          <check>  (required) — How to tell that the step worked.
      <rollback>  (exactly one) — How to undo the steps if they make things worse.
```

The listing introduces no syntax of its own. It uses words (`required`, `at most one`, `exactly one`, `type Requirement`) and the property format you already read for frontmatter.

## The element declaration

An element declaration is a mapping, and every key is optional:

| Key | Default | Meaning |
| --- | --- | --- |
| `description` | none | what the element means and when to write one |
| `attributes` | none | the attributes of the tag |
| `elements` | none | elements that have a meaning inside this one |
| `required` | `false` | each container holds at least one |
| `many` | `true` | a container may hold more than one |
| `type` | none | types the element node gets, such as `Requirement` |
| `node` | from `type` | whether an element without an `id` becomes a node |

`required` and `many` together say how often the element occurs:

| `required` | `many` | Occurrences | Listing |
| --- | --- | --- | --- |
| `false` | `true` | any number | nothing |
| `true` | `true` | one or more | `required` |
| `false` | `false` | none or one | `at most one` |
| `true` | `false` | exactly one | `exactly one` |

One trap is worth naming. On an element, `many` counts occurrences, and it defaults to `true`. On a property, `many` makes the value a list, and it defaults to `false`. The word is the same, but the question it answers is different.

## Attributes: four keys and a reserved `id`

An attribute value is a single string in the document, so an attribute declaration has four keys that mean something: `kind`, `required`, `values` and `description`. `many`, `default` and `uri` are accepted, because 0.4 wrote attributes exactly like properties, but they do nothing. Don't write them.

Attributes are open. A tag may carry attributes its declaration does not list. They are not reported, and an element node keeps them as properties.

**`id` is reserved on every element, declared or not.** An `id` is a stable address, unique in the file and compared without case, and it makes the element a node you link to as `[[runbooks#^restart]]`. You don't have to declare it. Declare it only to tell writers *when* to give one, as the runbook does, or with `required: true` to demand one. Give it no `values` and no `kind`. A good id starts with a letter or a digit and uses only letters, digits, `-`, `_` and `.`.

## Nesting and scope

Elements nest, and 0.5 states what that means. A declaration says where a tag *means* something, not where it may stand.

The declarations in scope at any point form a chain. It starts with the nested `elements` of each declared element around the point, innermost first, and ends with the type's own `elements`. A tag resolves to the first declaration of its name along that chain. Three consequences follow:

- **A type's own elements count at any depth**, including inside other elements.
- **A nested declaration is local.** `<check>` means something only inside a `<step>`, and there it hides any outer `<check>`. A `<check>` outside a step is undeclared text.
- **Undeclared elements are transparent.** A `<details>` wrapper adds nothing to the chain, so the `<rollback>` inside it is still the runbook's rollback.

Counts follow the same chain. Each declaration counts in its **container**. For a type's own elements that is the whole document, and for nested ones it is each occurrence of the parent. Here is a runbook that tests the rule:

```markdown
## Token service down

Logins fail and the gateway returns 503.

### Symptoms

The `auth_token_errors` alert fires and the login page shows "try again later".

<step id="restart" risk="safe">

Restart the token service: `kubectl rollout restart deploy/token`.

<check>

`curl -f https://auth.internal/health` answers 200 within a minute.

</check>

</step>

<step id="drain-cache" risk="reboot">

Flush the signing-key cache.

</step>

<details>

<rollback>

Roll back to the previous release: `kubectl rollout undo deploy/token`.

</rollback>

</details>
```

`tg ontology check` with tg 0.26.0 reported three findings, and the first one was wrong:

```
- lat.md/runbooks.md:8: 'Token service down' (Runbook) has no <rollback>: How to undo the steps if they make things worse.
- lat.md/runbooks.md:28: <step> attribute 'risk' is 'reboot'; allowed: safe, disruptive
- lat.md/runbooks.md:28: <step> has no <check>: How to tell that the step worked.
```

With the scope rule, only the two real problems remain:

```
- lat.md/runbooks.md:28: <step> attribute 'risk' is 'reboot'; allowed: safe, disruptive
- lat.md/runbooks.md:28: <step> has no <check>: How to tell that the step worked.

2 findings. Run tg ontology to see the declared types and edges.
```

The graph uses the same resolution, so a typed tag declared inside a parent gets its type anywhere inside that parent. Both steps have an id, so both are nodes:

```
$ tg cypher 'MATCH (s:Element {tag: "step"}) RETURN s.element, s.risk, s.owner'
s.element                    | s.risk | s.owner
-----------------------------+--------+-----------------------------------------------------
lat.md/runbooks#^restart     | safe   | lat.md/runbooks#Runbooks#Token service down#Symptoms
lat.md/runbooks#^drain-cache | reboot | lat.md/runbooks#Runbooks#Token service down#Symptoms
```

Declarations do not point at one another. If a tag means something at two levels, declare it at both levels, or once at the top.

## Sections

`sections` declares the headings a document has: a heading text, a `description` and `required`. A heading matches at any level inside the document, ignoring case. That is all a section declaration says.

## What you cannot describe, and why

- **Order.** Nothing says that `<check>` comes after the step's text, or that `## Symptoms` comes first. Order rules turn every edit into a fight with the validator.
- **Content models.** There are no "exactly these children", no exclusions and no allowed parents. DTD-style schemas are why DocBook and DITA feel heavy. The design record lists this as rejected.
- **Placement under a heading.** You cannot yet say that `<rollback>` must sit under `## Rollback`. This is a deferred option, not a refusal. If your team needs it, tell us, and the scope chain would gain a heading level.

What remains is enough for the checks that pay off: is the required part there, is a single part single, are the values ones we know, is every tag closed.

## One normal form

Every shorthand stands for exactly one full form, and two declarations with the same full form mean the same thing:

| You write | It means |
| --- | --- |
| `elements: [option, consequence]` | `elements: {option: {}, consequence: {}}` |
| `option:` (empty) | `option: {}` |
| `consequence: What becomes harder.` | `consequence: {description: What becomes harder.}` |
| `type: Requirement` | `type: [Requirement]` |
| `attributes: [id, kind]` | `attributes: {id: {}, kind: {}}` |
| `risk: number` | `risk: {kind: number}` |
| `sections: [Context]` | `sections: {Context: {}}` |
| `Context: The forces at play.` | `Context: {description: The forces at play.}` |

A list under `elements` or `sections` holds names only. tg 0.26 quietly accepted `- tag: option` mappings in such a list. `tg validate` now reports them as `invalid-declaration`, because a second way to write the same mapping helps nobody.

## How to write them: a checklist

1. **Describe every element and every attribute that has `values`.** The description is how the next writer, human or agent, learns what the tag is for, and `tg ontology check` repeats it in its findings.
2. **Use the mapping form** for any element with more than a description. Write a plain string only for a tag that has nothing else, such as `non-goal: Something this requirement deliberately does not cover.` Use a list only in a first draft.
3. **Don't declare `id` by default.** Declare it only to say when to give one.
4. **Add `required` or `many: false` only when a document is wrong without them.** The bundled code ontology requires nothing, so existing docs stay clean.
5. **Nest a declaration only for a part that means nothing outside its parent**, like `<input>` and `<output>` inside `<example>`.
6. **Give a tag a `type` only when the part is an ontology thing in its own right**, like a `<rule>` that code implements on its own.
7. **Keep `tgs: "0.5"`** in notes you write now. A note that says `"0.4"` reads the same.

For agents, the instructions don't change: run `tg ontology` before writing, use only tags it lists, put the tags on their own lines with blank lines inside, and give an `id` only when something will point at it. The `tg-docs` skill that `tg init` and `tg upgrade` install now also teaches the nesting rule and how to declare a new tag.

## Read the spec

The full text is [Typed Graph Schema 0.5](https://typedgraph.org/spec/tgs/v0.5/), sections 4.2 to 4.9: elements, attributes, nesting and scope, sections, reading, element nodes, validation and the normal form. [0.4](https://typedgraph.org/spec/tgs/v0.4/) stays published as it was. Conformance example `08-element-scope` in the repository holds the runbook above as a test any implementation can run.

---

*The 0.26.0 listing and findings come from the released tg 0.26.0. The others come from tg 0.27.0, which implements TGS 0.5, run on a fresh project set up with `tg init --yes` on 11 November 2026.*
