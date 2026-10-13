---
lat:
  require-code-mention: true
---
# Edge Settings Tests

Test specifications for the plugin settings that switch on [[graph-model#Plain link edges]] and [[edge-syntax#Frontmatter edges]]; the settings tab itself is verified manually.

## Both off by default

With neither setting on, plain prose links and frontmatter links produce no edges, so existing vaults read as before.

## Each setting adds its own edges

`linkEdges` adds untyped `links_to` edges for prose links and `frontmatterEdges` adds edges typed by the property name; the two work independently and together.

## Changes apply on re-index

The options are read when a note is indexed, so a changed setting takes effect for notes indexed afterwards and the settings tab re-indexes the vault.

## Toggles in the settings tab

Both options appear as toggles, off by default, in the declarative settings that Obsidian 1.13+ renders; the legacy `display()` tab lists them too and is verified manually.

## Changing a toggle re-indexes

Changing either edge option re-indexes the vault so existing notes pick it up; changing any other setting does not.

## Declarative settings match the legacy tab

Every setting the legacy tab offers, including the code layer mode and folder and the schema base IRI, is also in the declarative settings, and each keeps its side effects: the code layer refreshes, empty values fall back to defaults.
