## 1. Evaluation baseline

- [x] 1.1 Write `eval/search/queries.json`: about 40 queries over this repository's `lat.md/` (identifier, keyword, meaning, nonsense), each with relevant section ids, split into `tune` and `holdout`
- [x] 1.2 Write `eval/search/run.mts` and the `eval:search` script: MRR@10, nDCG@10, recall@5 per configuration and per kind; optional `lat search` adapter
- [x] 1.3 Record the current ranking's numbers before any change

## 2. Exact tier

- [x] 2.1 `identifierTokens` and per-section `idents` in `core`
- [x] 2.2 `rankSections` with tiers, RRF and per-list ranks; reimplement `fuseRanks` through it
- [x] 2.3 Use `rankSections` in `tg search` and in the prompt hook

## 3. Chunks, floor and cache

- [ ] 3.1 `sectionChunks` with `CHUNKER_VERSION`
- [ ] 3.2 `VectorCache` keyed by chunk text hash, label including the chunker version
- [ ] 3.3 `vectorRank` with the floor, best-chunk collapse and top 50 sections; `TG_SEARCH_MIN_SIMILARITY`

## 4. Output and tuning

- [x] 4.1 JSON `tier`, `ranks` and `similarity`; `exact match` label in text output
- [ ] 4.2 Run the evaluation with an OpenAI-compatible and an Ollama provider; set floor constants per family from the tuning half; record held-out numbers
- [x] 4.3 Add the lexical held-out MRR@10 check to CI

## 5. Tests

- [ ] 5.1 Tests for every scenario in the tg-search delta (exact tier, JSON output and evaluation scenarios done; chunk, floor and cache scenarios wait for section 3), each with an `@lat:` ref to a new section in `lat.md/tests/tg-search.md`
- [ ] 5.2 Fake-provider fixtures for the floor, the long-section case and distinct-section collapse, with no network

## 6. Docs

- [ ] 6.1 (exact tier and evaluation done; again when section 3 lands) Update `lat.md/cli.md#Search` and `lat.md/embedded-search.md` (results and that this iteration landed); `tg check`
