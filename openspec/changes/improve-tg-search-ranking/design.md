## Context

`tg search` today (`lat.md/cli.md#Search`): `buildSearchDocs` makes one document per section; `LexicalIndex` scores title (weight 3), leading paragraph (2) and body (1) with BM25 plus a 1.5× bonus when the title contains the whole query; with a provider configured, `docText` embeds `id + summary + body` cut at 2,000 characters, `vectorRank` keeps every hit with positive cosine (top 50), and `fuseRanks` applies plain RRF (k = 60) to the two lists. The prompt hook uses `LexicalIndex` alone, in memory, with no network.

lat.md 0.13 (`lat.md-code/src/search/`) on the same kind of corpus adds two things we lack: an `identifiers` table whose hits are sorted ahead of everything else in its lexical list, and a 0.2 cosine floor on its semantic list. It also embeds block-owned chunks rather than whole sections.

This change is the first iteration of `lat.md/embedded-search.md`. Everything stays in memory and in the existing `.tg/vectors.*` cache.

## Goals / Non-Goals

**Goals:**
- An identifier query finds its section first, in every mode.
- Vector search sees all of a section's text.
- Queries with no real match return few or no vector hits.
- A repeatable number for ranking quality, with lat.md as a reference.
- Code that add-hybrid-ranking extends rather than replaces.

**Non-Goals:**
- A graph store, ANN index, bundled model or token-based chunk sizing (add-embedded-graph-store, add-local-embedding).
- Cards, Facts, graph boost, `tg retrieve` (add-hybrid-ranking).
- New flags beyond what the evaluation needs; `--explain` text output.

## Decisions

**1. Identifier tokens.** `identifierTokens(text)` returns the distinct lowercased tokens matching `[\p{L}\p{N}_][\p{L}\p{N}_./:#@-]*` that contain one of `_ . / : # @ -`, contain a lowercase letter followed by an uppercase letter in their original form (camelCase, PascalCase), or are at least 40 characters long, with trailing `.`, `:` and `-` stripped. lat.md's rule omits camelCase; we add it because TypeScript symbols such as `diffMirror` and `LexicalIndex` are the most common lookup in code-adjacent docs. A token also yields its `#`-separated parts and its suffixes after each `/` when those are identifier-like, because docs name symbols inside links (`[[packages/core/src/latmd/search.ts#LexicalIndex]]`) and readers type bare file names (`search.ts`, `release-vscode.mjs`); the query is stripped of surrounding quotes and backticks and of leading punctuation, so `@asciidoctor/core` and `.tg/config.json` match the tokens the scanner sees. Each `SearchDoc` gets an `idents: Set<string>` built from its id, file path, heading and body.

**2. Exact tier.** When the trimmed query, lowercased and with surrounding backticks removed, is a single identifier token, every section whose `idents` holds it is an exact hit. `rankSections` places exact hits first, ordered among themselves by their fused score (so the section whose title or summary names the identifier, which BM25 already favors, leads), then all other sections by fused score. A multi-word query has no exact tier. The prompt hook gets the tier too, since it is pure in-memory work.

**3. `rankSections`.** `rankSections({ exact, lists, limit })` takes a set of exact ids and named ranked lists (`lexical`, `vector`), fuses the lists with RRF (k = 60, equal weights), applies the tier, and returns hits carrying `tier` and per-list ranks. `fuseRanks` stays exported for compatibility and is implemented through it. add-hybrid-ranking adds lists, weights and the boost to this function.

**4. Section chunks.** `sectionChunks(doc)` splits a section's body by blank lines into paragraphs and packs them into chunks of at most 1,500 characters, each prefixed with `{id}\n{summary}\n` when the section has a summary distinct from the chunk; a paragraph longer than the budget is split at sentence and then word boundaries, as `chunkNote` does. The 1,500-character budget suits the remote models `tg search` supports today (OpenAI and Ollama models accept thousands of tokens); sizing in model tokens comes with the bundled MiniLM model in add-local-embedding, whose 256-token limit needs it. `CHUNKER_VERSION = 'section-chunks-v1'` is appended to the cache label, so a chunker change re-embeds once instead of reusing vectors of different text.

**5. Vector list.** Each chunk is embedded through the existing `VectorCache`, now keyed by chunk text hash. `vectorRank` computes cosine for every chunk, drops those below the floor, collapses to the best chunk per section, and returns up to 50 sections. Collapsing before the cut means many chunks of a few long sections cannot crowd out other sections.

**6. Floor.** Default 0.2, as lat.md uses for MiniLM. Cosine distributions differ by model (OpenAI's `text-embedding-3-small` puts unrelated text near 0.1 to 0.2; `nomic-embed-text` sits higher), so the evaluation sets one constant per provider family (`openai/*`, `ollama/*`), and `TG_SEARCH_MIN_SIMILARITY` overrides it for an unusual model. When every vector hit falls below the floor, the result is lexical hits only, and the result is empty when those are empty too.

**7. JSON output.** Each hit adds `tier` and `ranks: { lexical?, vector? }` (1-based), plus `similarity` when it has a vector hit. Text output is unchanged except that exact hits are labeled `exact match`.

**8. Evaluation.** `eval/search/queries.json` holds about 40 queries over this repository's `lat.md/`, each labeled with one or more relevant section ids and a kind (`identifier`, `keyword`, `meaning`, `nonsense`), split evenly into `tune` and `holdout`. `eval/search/run.mts` runs each configuration in process (old ranking, new ranking; lexical always, hybrid when a provider is configured) and, if `lat` is on `PATH`, `lat search` on the same folder with its section ids parsed from text output. It prints MRR@10, nDCG@10 and recall@5 per configuration and per kind; for `nonsense` queries it reports the share that return no vector hits. Results go into `lat.md/embedded-search.md`. The lexical path runs in CI as a regression check: holdout MRR@10 must not fall below the recorded value.

## Risks / Trade-offs

- [The exact tier can rank a section that merely mentions an identifier above a better answer for a word-like query] → The tier applies only to single identifier-shaped tokens, which plain words never are.
- [A fixed floor can hide weak but correct matches for some models] → Per-family constants from the evaluation, an override variable, and `similarity` in JSON to see the cutoff.
- [Chunking multiplies embedding calls by about 1.5 to 3 for long sections] → Paid once; unchanged chunks reuse cached vectors.
- [40 labeled queries is a small set] → Enough to catch regressions and compare configurations; the set grows with add-hybrid-ranking, which adds vault queries.
- [The lat.md comparison depends on parsing its text output] → Optional and reported separately; the internal comparison does not depend on it.

## Migration Plan

Cache labels change, so the first hybrid search after upgrade re-embeds every chunk once. No configuration changes; `--lexical` and all variables keep working.

## Open Questions

- The floor constants for `openai/*` and `ollama/*` (task 4.2).
