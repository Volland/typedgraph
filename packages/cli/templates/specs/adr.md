### Architecture decision records

`tg` reads numbered records in `docs/adr/`, `doc/adr/`, `docs/decisions/` and the other usual folders, or the folder `.adr-dir` names. MADR, Nygard (adr-tools) and log4brains formats all work.

```
adr:0003       a record by its number (also adr:3, adr:ADR-0003, its file slug or title)
```

- A record is a `Decision` node with the label `ADR` and its `adrStatus`, `date` and `title`. Code realizing it gets `// @tg: implements:: [[adr:0003]]`; code that knowingly departs from it gets `-contradicts::` with `{ticket, until}`.
- `Supersedes [...](0002-....md)` and `Amends [...]` lines in a record become `supersedes` and `amends` edges between records.
- Decisions need no test. Proposed records are pending; superseded, deprecated and rejected ones are retired and never reported as gaps.
- To record a new decision, copy `docs/adr/template.md` to the next number, fill it in and link it from the lat.md section it explains with `- motivated_by::` or `- supersedes::` edges.
- Docs name the records they explain as `specs: ["adr:0003"]` in frontmatter.
