---
type: Scenario
lat:
  require-code-mention: true
---
# TG Search Tests

Test specifications for `tg search` and `tg reindex`: lexical ranking, optional hybrid ranking, key handling and the derived cache. See [[cli#Search]].

## Lexical default

Search with nothing configured.

### No configuration

With no environment settings `tg search` returns ranked sections without calling the network, which the test enforces with a fetch that throws.

### Title outranks body

A section titled with the query ranks above one that only mentions the words once in its body.

## Hybrid ranking

Search with an embedding provider.

### Provider configured

With a provider set, a query that shares no words with the answer ("login" against "sign in") finds it through vector rank fusion, which lexical search alone cannot.

### Provider down

When the provider fails, results stay lexical, a notice says embeddings were unavailable, and the exit code is 0.

## Exact identifiers

A query that is one identifier-like token (camelCase, a path, a variable) ranks the sections containing it above all others.

### Symbol beats close matches

`diffMirror` ranks its one section first with tier `exact`, lexically and in hybrid mode where vectors favor a section about diffs and mirrors; every other hit is `fused`.

### File path

`packages/core/src/latmd/search.ts` and the bare `search.ts` both rank the section mentioning the path above one whose title holds the path's words, labeled `exact match`.

### Plain words have no tier

`edge syntax` is two plain words, so every hit has tier `fused`.

### Prompt hook

The prompt hook's first search result for a prompt that is a file path is the section mentioning that path.

## Search output

The `--json` document carries what a ranking needs to be debugged.

### Rank details in JSON

Lexical hits carry tier `fused`, consecutive lexical ranks, file, lines and score and no similarity; a hybrid hit found by vector carries its vector rank and cosine similarity.

## Ranking evaluation

`npm run eval:search` scores the labeled queries in `eval/search/queries.json` over this repository's `lat.md/`.

### Report without network

Both lexical configurations (previous and new ranking) report metrics for all queries, each half and each query kind with no provider configured.

### Held-out regression check

The new lexical ranking's held-out MRR@10 stays at or above `eval/search/baseline.json`; CI fails otherwise.

## Key variable aliases

lat.md key variables keep working.

### Alias honored

With only `LAT_LLM_KEY` set, an OpenAI-compatible provider is used with that key as a bearer token.

### TG variables win over aliases

With `TG_EMBED_KEY_FILE` and `LAT_LLM_KEY` both set, the key from the file is used, because every `TG_EMBED_KEY*` variable is checked before any alias.

### Not written to disk

A key present during a search appears in no file under `.tg/`.

## Derived cache

The index is disposable.

### Cache deleted

Reindexing twice reuses unchanged vectors, and after deleting `.tg/` the next search works and recreates the cache.
