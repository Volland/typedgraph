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
