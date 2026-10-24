---
type: Scenario
lat:
  require-code-mention: true
---
# Graph UI Tests

Test specifications for the shared renderer package described in [[visualization#Surfaces]] that the Obsidian plugin and the VS Code extension both use.

## Theme supplied by host

The style sheet takes its text and background colors from the theme the host passes in and reads no host global.

## Negative edge looks the same

A negative edge always gets a tee arrow in the shared style sheet, whichever host draws it; its dashed red default comes from the shared styler.

## Graph UI has no host imports

The shared renderer sources import neither `obsidian` nor `vscode`.

## Edge note drawn as an edge

The neighborhood of an edge note's path is its declared edge and both endpoint nodes, and the edge also appears in each endpoint's neighborhood.

## Layout options parsed

The `forces:` and `display:` header values are validated per setting with a range or boolean check and a named error, and valid entries survive next to invalid ones.

## Pin and controls options

`pin:` accepts `self`, `none` or note names with optional wikilink brackets, and `controls:` accepts `show`, `open` and `hide` in any case.

## Settings defaults and round trip

The default forces and display settings are the documented values, and the header lines the panel copies parse back into the same settings.

## Pins hold and centre at origin

A pinned node never moves while the others settle, the first auto-pinned node sits at the origin and the rest stay within reach of it.

## Auto pins applied once

Extra pins go on a ring around the centre, an unchanged pin list is not applied again after the user unpins, and ids that are not in the graph are ignored.

## Relayout keeps positions

When the graph grows, existing nodes keep position and pin and new ones appear next to a neighbour; a mostly different graph is reported as fresh.

## Node lying on an edge is pushed off

With node-edge repulsion on, a node placed on an edge ends up clear of the edge line; with it off it stays on the line.

## Labels pushed apart

With label repulsion on, a dense graph ends with fewer overlapping node and edge label boxes than with it off.

## Hidden types and label sizes

Labels of hidden edge types, and all edge labels when they are off, are not counted as boxes, and the display settings produce the hidden-type, pinned and size rules in the style sheet.

## Fit centres on origin

The fit puts the origin at the centre of the canvas, zooms to the farthest node and returns nothing for an empty graph or a zero-size canvas.

## Previous pin released

When another node takes the centre as the auto-pinned one, the node pinned before is released and nudged off the origin, and nodes the user pinned stay pinned.

## Collapse neighbors

Collapsing a node picks the neighbors that have no other neighbor in the view; neighbors that also reach other nodes stay.

## Remove from view

Removing a node takes out the node and the nodes joined only to it, together with every edge at them.

## Hidden node types

A hidden type removes its nodes and the edges that lose an end, and unhiding it brings them back; nodes without a label count as the type `(no type)`.

## Property value filters

Checked values of a property are alternatives, a list value passes on any accepted item, empty and missing values are one choice, every filtered property of a type has to pass, and other types are unaffected.

## Offered filter values

A type's properties are listed with their values and counts, a node without the property counting as empty, and properties with only empty values are left out.

## Editor chosen by schema

A property the schema declares with allowed values is an enum dropdown, or checkboxes for a list property; the schema kind picks number, date, boolean and list inputs.

## Link suggestions by type and text

While a link property is edited, notes of the edge type's allowed target types whose name contains the typed text are offered, names starting with it first.


## Schema info of a type

The info view of a type lists each property with its data type and cardinality, the edge types the type may have with their target types, and which types may point at it.

## Editor chosen by value

Without a declaration the current value's type picks the input: number, boolean, list, short or long text.

## Edited values written back

Entries become frontmatter values: numbers parsed with a named error for bad ones, lists split on commas, enum members keeping their schema type, empty entries stored as empty.

