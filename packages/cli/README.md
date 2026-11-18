# tg — your docs, specs and code as one typed graph

[![npm](https://img.shields.io/npm/v/@typedgraph/cli)](https://www.npmjs.com/package/@typedgraph/cli)
[![license](https://img.shields.io/npm/l/@typedgraph/cli)](https://github.com/Volland/typedgraph/blob/main/LICENSE)

**`tg` keeps the design docs of a codebase linked to the code, checked in CI, and queryable by you and by your coding agents.** It is a drop-in replacement for [lat.md](https://www.npmjs.com/package/lat.md): it reads the same `lat.md/` folder and gives the same `check` verdicts, and it adds typed links from code, an openCypher query language, requirement tracing for OpenSpec and a one-command setup for nine coding agents.

```bash
npm i -g @typedgraph/cli
cd your-project
tg init          # pick your coding agents, it writes the setup
tg check         # links, code references, index files, section structure
```

One bundled file, no runtime dependencies, Node 20 or newer. Website: **[typedgraph.org](https://typedgraph.org/)** · Docs: **[typedgraph.org/docs](https://typedgraph.org/docs.html)**

---

## Why: the three places the truth lives

A codebase built with coding agents grows three kinds of text. **Requirements** say what the system must do. **Design docs** say why and how. **Code** says what actually happens. Each is useful on its own; the trouble is the gaps between them. A requirement says one thing while the code does another. A design doc describes a feature that changed a month ago. An agent, asked to change the login flow, greps for "login", finds six files and a stale paragraph, and guesses.

lat.md closed the first gap: design docs live in a `lat.md/` folder of cross-linked Markdown sections, code points at them with `// @lat: [[auth#Login]]`, and `lat check` fails the build when a link rots. That alone makes a repository far easier for an agent to read.

`tg` keeps all of that and makes the links mean something. A comment no longer just says "this function relates to that section". It says how:

```ts
// @tg: implements:: [[openspec:auth#Token expiry]]
export function refreshToken() { … }

// @tg: verifies:: [[openspec:auth#Token expiry#Expired token rejected]]
it('rejects an expired token', () => { … });
```

Once links have types, the repository becomes a graph you can ask questions of. Which requirements have no implementation? Which have code but no test? Which design sections does nothing point at? What does this function touch, and which tests prove it still works? Each of those used to be an afternoon of grepping. Now each is one command, and your coding agent can run the same commands itself, through hooks and an MCP server that `tg init` sets up.

We used it on this repository: [239 OpenSpec requirements traced to the code that implements them, the tests that verify them and the docs that explain them](https://typedgraph.org/blog-specs-that-know-their-code.html), including what an honest audit found on the way.

## What you get

**Docs that stay true.** `tg check` validates every `[[wiki link]]`, every `@lat:` and `@tg:` reference from code (down to the function or class), the index file of each folder and the structure of each section. Run it in CI, in a pre-commit hook, or let the agent's stop hook run it before it says "done".

**Typed, signed links — in code and in docs.** `@tg: implements::`, `verifies::`, `-contradicts::` (negative), `depends_on::` with properties such as `{since: 2}` above a declaration; and the same line in a doc section, so decisions, constraints and requirements link to each other with names:

```markdown
## Short-lived access tokens

Access tokens expire after 15 minutes and refresh tokens rotate on every use.

- motivated_by:: [[constraints#Session limit]] {weight: primary}
- supersedes:: [[decisions#Long-lived sessions]] {since: "2.3", reason: "audit finding"}
```

Each line is still an ordinary wiki link for lat.md, and a named edge with properties for `tg cypher`. Plain `@lat:` comments keep working unchanged.

**A query language over docs and code.** Sections, files and code symbols are graph nodes, so questions become openCypher:

```bash
tg cypher "MATCH (c:CodeSymbol)-[:implements]->(s:Section)
           RETURN s.title, count(c) AS functions ORDER BY functions DESC"
```

**Requirement tracing for OpenSpec.** `tg trace --gaps` lists every requirement that has no implementing code, no verifying test or no explaining doc. `tg init` teaches OpenSpec to keep it that way: it adds rules to `openspec/config.yaml` so every task list OpenSpec generates includes the `implements` and `verifies` annotations and a final `tg check` and `tg trace`.

**Setup for the agent you actually use.** `tg init` asks which coding agents you use (the ones it detects come ticked) and what to set up, then writes it:

| Agent | Instructions | Skills folder |
| --- | --- | --- |
| Claude Code | `CLAUDE.md`, hooks, MCP server | `.claude/skills` |
| Codex | `AGENTS.md` | `.agents/skills` |
| Cursor | `.cursor/rules/tg.mdc` | `.cursor/skills` |
| GitHub Copilot | `AGENTS.md` | `.github/skills` |
| OpenCode | `AGENTS.md` | `.opencode/skills` |
| Kilo Code | `AGENTS.md` | `.kilocode/skills` |
| Pi | `AGENTS.md` | `.pi/skills` |
| Oh My Pi | `AGENTS.md` | `.omp/skills` |
| Any other agent | `AGENTS.md` | `.agents/skills` |

Seven skills come with it: `tg-docs` (keep the docs in sync), `tg-graph` (query the graph), `tg-trace` (link requirements to code and tests), `tg-impact` (what a change touches, before and after the edit), `tg-audit` (find where specs and code disagree), `tg-migrate` (finish a migration from lat.md) and `tg-team` (the team map: who owns, knows and decided what, and which agent acts for whom). The team map's ontology is opt-in: `tg gen team-types.md > Types/team-types.md`. Re-running `tg init` only replaces its own marked blocks, and `tg init --dry-run` shows the diff without writing.

**Search that needs nothing.** `tg search "how are tokens refreshed"` ranks sections lexically with no model to download and no key. Point it at Ollama or an OpenAI-compatible endpoint and it becomes hybrid lexical plus vector search.

**An ontology agents can read.** `tg init` installs a small code ontology (Decision, Requirement, Scenario, Constraint, Concept, Change, and edge types such as `implements`, `motivated_by` and `constrains`, each with its properties) as a schema in `Types/`, with a template per type in `Templates/`. `tg ontology` prints it, including any types your project adds, so agents use your names instead of inventing synonyms; `tg ontology check` flags edges with an unknown name (and suggests the right one), a wrong direction or an undeclared property. The instructions, skills and OpenSpec rules `tg init` installs teach agents this loop. It exports to W3C SHACL with `tg schema export`.

**Your choice of folder.** Keep docs in `lat.md/` to stay compatible with the `lat` command, or in `tg.md/` if lat.md means nothing to your team. An existing `lat.md/` always wins.

## tg and lat.md

`tg` follows lat.md's format exactly and is tested against `lat check` 0.12.2 on real projects, so you can switch either way at any time. lat.md is a separate open-source project by Yury Selivanov; Typed Graph is not affiliated with it.

| | lat.md | tg |
| --- | --- | --- |
| Folder format, section ids, wiki links, `@lat:` comments | ✓ | Same |
| `check` verdicts | Reference | Same findings, checked by a parity suite in CI |
| Typed, signed links with properties | — | From code (`@tg: implements:: [[…]] {since: 2}`) and between doc sections (`- motivated_by:: [[…]]`) |
| Ontology | — | `tg ontology` lists types and edge types; `tg ontology check` validates written edges |
| Query language | Locate, refs, search | All of those, plus openCypher over docs and code |
| OpenSpec requirement tracing | — | `tg trace`, gap reports, OpenSpec rules and skill patches |
| Agent setup | Claude Code, Cursor, Pi, OpenCode | Nine agents, chosen in a setup checklist |
| Migration from the other | — | `tg migrate`: typed files, typed links with metadata, typed code edges |
| MCP tools | 6 | 10 (adds `tg_cypher`, `tg_edges`, `tg_trace`, `tg_ontology`) |
| Search | Semantic, local model or API key | Lexical with no setup; hybrid with embeddings |
| Obsidian | Folder opens as plain Markdown | Plugin resolves ids on click, shows findings, draws the graph |
| Install | npm package with native grammars and a database client | One bundled file, no runtime dependencies |
| Code symbol parsing | Tree-sitter grammars | Regex finders for TS/JS, Python, Go, Rust, C |

Where lat.md is stronger, honestly: it parses code with real grammars, so unusual syntax and macros are found more reliably; it has semantic search without running anything else; and it is the original, with far more real-world use. When the two disagree on the format, lat.md is right by definition. The full comparison is in **[tg and lat.md compared](https://typedgraph.org/blog-tg-vs-lat-md.html)**.

**Moving from lat.md** is one command, and it brings the typed graph with it:

```bash
tg migrate --dry-run   # see the diff and the links it will leave plain
tg migrate             # do it
```

`tg migrate` swaps the lat block, `lat hook` commands and `lat` MCP entry for tg's (leaving everything else in your files untouched), types docs files whose path names their kind (`decisions.md` → Decision, `constraints.md` → Constraint, `tests/` → Scenario, ...), turns each plain link whose sentence names the relation into a typed edge with metadata, and upgrades `@lat:` comments to `@tg: implements::` and `verifies::`:

```markdown
Access tokens live 15 minutes because of [[constraints#Session limit]]. This replaces [[decisions#Long sessions]].

- motivated_by:: [[constraints#Session limit]] {since: "2026-03-02"}
- supersedes:: [[decisions#Long sessions]] {since: "2026-03-02"}
```

The relations come from your ontology, the cue words from the sentence (`because` → `motivated_by`, `replaces` → `supersedes`, MUST → `constrains {strength: must}`), the dates from `git blame`. It never guesses: links it cannot decide are listed with their sentence and candidates, and the `tg-migrate` skill lets Claude Code resolve them by reading the text. It refuses files with uncommitted changes, and a second run changes nothing. `--keep-lat` keeps your `@lat:` lines if you still run `lat check`.

## Commands

| Command | What it does |
| --- | --- |
| `tg init` | Set up the docs folder, agent instructions, hooks, MCP, skills, OpenSpec rules and code ontology |
| `tg check` | Validate links, code references, index files and section structure |
| `tg search <query>` | Find sections, lexical by default, hybrid with embeddings |
| `tg section <id>` / `locate` / `refs` / `expand` | Read a section, find one by name, find what points at it, resolve `[[refs]]` in text |
| `tg cypher <query>` | Read-only openCypher over sections, code files and symbols |
| `tg edges` | List `@lat:` and `@tg:` annotation edges with type, sign and properties |
| `tg migrate` | Migrate a lat.md project: setup swap, typed files, typed links with metadata, `@lat:` → `@tg:` |
| `tg ontology` / `ontology check` | List the project's types and edge types from `Types/`; check written typed edges against them |
| `tg trace [capability] --gaps` | Which code implements, which tests verify and which docs explain each OpenSpec requirement |
| `tg validate` | Check a notes vault against its schema notes, with JSON or SARIF for CI |
| `tg schema export` / `import` | Exchange schemas with RDF tools as SHACL |
| `tg export` / `import` | Move notes between an Obsidian vault and a `lat.md/` folder or an OKF bundle |
| `tg mcp` | MCP server over stdio for any agent |
| `tg hook` | Agent hook handler (installed by `tg init`) |

Every command takes `--json`. Exit code 0 means clean, 1 means findings, 2 means a usage error.

## The rest of Typed Graph

`tg` is the command-line part of [Typed Graph](https://typedgraph.org/). The same graph engine powers an [Obsidian plugin](https://typedgraph.org/docs.html) with typed edges, a graph view and Cypher query blocks, and a [VS Code extension](https://marketplace.visualstudio.com/items?itemName=pavlyshyn.typegraph-vscode) with typed backlinks for notes and code.

Read more:

- [Why a typed graph for code](https://typedgraph.org/blog-why-typed-graph-for-code.html)
- [Specs that know where their code is](https://typedgraph.org/blog-specs-that-know-their-code.html)
- [tg: docs and code as one graph](https://typedgraph.org/blog-tg-cli.html)
- [Using the code ontology](https://typedgraph.org/blog-code-ontology.html)
- [Install for Claude Code, VS Code, Cursor or Obsidian](https://typedgraph.org/install.html)

Issues and ideas: [github.com/Volland/typedgraph](https://github.com/Volland/typedgraph/issues). MIT licensed.
