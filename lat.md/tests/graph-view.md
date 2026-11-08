---
type: Scenario
lat:
  require-code-mention: true
---
# Graph View Tests

Test specifications for the full-pane Graph view described in [[visualization#Surfaces]], covering pure view-state logic and the active-note query lifecycle with a stubbed Obsidian shell.

## Neighborhood of active note

The default content is the active note plus its incident edges in both directions and its direct neighbors; an unknown note yields an empty graph.

## Active file query parameter

A query anchored to `$activeFile` draws A to B to C without unrelated D to E, follows a switch to B, and keeps B when focus leaves Markdown.

## Active file before a note is opened

Before any note is active, `$activeFile` is bound to null and a path query returns an empty graph instead of a missing-parameter error.

## Expansion keeps existing elements

Expanding a node merges its neighborhood into the current elements without discarding anything already shown.

## Edge selection details

A selected edge shows its type, sign, ID, source heading and user properties, with negative edges marked.

## Node selection details

A selected node shows its title, labels, stub flag and properties.

## Subtitle after the title

A note with frontmatter `subtitle` is drawn and headed as `<title> — <subtitle>`, an edge names it the same way, and a blank subtitle leaves the title alone.

## Same element same style

A node produces identical element data, classes and style rules whether it comes from an inline block result or from the Graph view.

## Stubs visible in neighborhood

Stub neighbors appear in the view with no note path, so unresolved links stay visible but cannot be opened.

## Business and technical rows

With a known schema, a node's labels, stub flag, path, style rows and undeclared properties are technical and the declared ones are note properties; an edge's sign and id are technical, and without a schema every property is a note property.

## Links in values

A property value splits into text and link parts: one line per list item, aliases and subpaths kept, markdown links resolved against the note, and empty or non-note links left as text.

