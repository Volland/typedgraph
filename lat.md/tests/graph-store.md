---
type: Scenario
lat:
  require-code-mention: true
---
# Graph Store Tests

Test specifications for the [[graph-model]] store in the core package, covering every scenario in the graph-model spec.

## One node per note

A note with several headings and edges contributes exactly one non-stub node; headings never become nodes.

## Stub for unresolved link

An edge to a link that matches no note creates a stub node keyed by the link text, so no edge dangles.

## Stub promoted when note created

Creating the missing note replaces the stub with the real node, re-points existing edges and notifies listeners of every touched file.

## Labels from frontmatter type

Frontmatter `type` as a string or list yields one label per entry; a note without `type` has no labels.

## Frontmatter path and title properties

Frontmatter fields plus `path` and `title` (file name without extension) are exposed as node properties.

## Derived edge ids with ordinals

Two identical edges from one note get IDs `source#type#target#n` that differ only in the ordinal.

## Pinned edge id

An `id` property overrides the derived ID; a second edge reusing that pinned ID is dropped with a diagnostic.

## Incremental edit

Editing one note replaces only its own edges; edges contributed by other notes are left untouched.

## Deleted target becomes stub

Deleting a note that others link to re-points those edges to a stub node named by the link text.

## Stubs released when unreferenced

A stub disappears once its last referencing edge is gone, including after a rename or deletion of the source.

## New note re-resolves only its name

Creating `Beta.md` re-resolves the notes linking to `Beta` or `sub/Beta` and no note linking to another missing name; their edges then point to the new note.

## Build is linear in links

Adding notes whose links are mostly unresolved resolves each written link a bounded number of times, and links between the notes end at real nodes.
