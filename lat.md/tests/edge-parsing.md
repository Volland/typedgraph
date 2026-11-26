---
type: Scenario
lat:
  require-code-mention: true
---
# Edge Parsing Tests

Test specifications for the [[edge-syntax]] parser in the core package, one section per behavior in the edge-parsing spec.

## Plain Graph Link Types line

A bare `knows:: [[Bob]]` line yields one `knows` edge to `Bob` with no properties, so existing Graph Link Types notes keep working.

## Line with properties

A trailing `{since: 2020, label: "met at conf"}` block yields typed properties: numbers stay numbers and quoted strings stay strings.

## Negative sign prefix

`-distrusts:: [[Eve]]` yields type `distrusts` with sign -1, proving the prefix is stripped from the type name.

## Default positive sign

An edge with no prefix has sign +1, and a `+` prefix also yields +1.

## Weight independent of sign

`{weight: -0.8}` on an unprefixed edge keeps sign +1 and stores `weight` as an ordinary number.

## Source heading recorded

An edge under `## Colleagues` records `Colleagues` as its heading; edges before any heading record null.

## Malformed property block

An unclosed `{since: 2020` keeps the edge with no properties and reports a diagnostic with the note path and line.

## Code fences ignored

Edge syntax inside fenced code blocks, and inside YAML frontmatter, creates no edges.

## List items and multiple links

List-item edges and comma-separated links are recognized, with the shared props copied to every link and aliases and subpaths split out.

## Unquoted link in a property

`{location: [[Location B]]}` reads as the string `"[[Location B]]"`, as does a list of links with subpaths and aliases, and a quoted link stays the same string (see [[edge-syntax#Links in property values]]).

## Nested lists that are not links

`[[X],]`, `[ [X] ]`, `[[X] ]`, `[[[X],]]` and `[[1, 2], [3]]` stay nested lists, because Obsidian does not highlight them as links either.

## Core has no host imports

The core package source never imports `obsidian` and never touches DOM globals, so the sidecar can reuse it unchanged.
