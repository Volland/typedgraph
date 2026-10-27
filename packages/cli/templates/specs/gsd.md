### Get Shit Done

`tg` reads `.planning/REQUIREMENTS.md`.

```
gsd:requirements#AUTH-01       a requirement by its CATEGORY-NN id
```

- Each node carries its `category`, its `scope` heading and `done` (the checkbox); requirements under an "Out of Scope" heading are retired.
- There are no scenarios: put `verifies::` on the test that proves the requirement itself.
- Docs name what they explain as `specs: ["gsd:requirements"]` in frontmatter.
