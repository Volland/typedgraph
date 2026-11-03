## MODIFIED Requirements

### Requirement: Hybrid ranking
The system SHALL combine lexical and vector ranks when an embedding provider is configured, embedding each section as heading-prefixed chunks of at most 1,500 characters and scoring a section by its best chunk, and SHALL fall back to lexical results with a notice when the provider fails.

#### Scenario: Provider configured
- **WHEN** an embedding provider is configured and reachable
- **THEN** results are ranked by fused lexical and vector ranks

#### Scenario: Provider down
- **WHEN** the provider times out
- **THEN** results are lexical and a notice says embeddings were unavailable, with exit code 0

#### Scenario: Text late in a long section
- **WHEN** a 6,000-character section answers the query only in its last paragraph and shares no words with it
- **THEN** the section is found through its vector rank

### Requirement: Search output
`tg search <query> [--limit N] [--lexical]` SHALL return at most N hits (default 5), SHALL skip embeddings with `--lexical`, and with `--json` SHALL print one JSON document holding `mode` (`lexical` or `hybrid`), any notice, the query and ranked hits with section id, score, file, line range, `tier` (`exact` or `fused`), the hit's 1-based rank in each list it appears in, and its cosine similarity when it has a vector hit.

#### Scenario: JSON output
- **WHEN** `tg search login --json --lexical` runs
- **THEN** stdout is one JSON document with `mode` `lexical` and up to five hits each giving id, score, file, line range, tier and lexical rank

## ADDED Requirements

### Requirement: Exact identifiers rank first
When a query is a single identifier-like token (containing `_ . / : # @ -`, written in camelCase or PascalCase, or at least 40 characters long), the system SHALL rank every section whose id, file path, heading or body contains that token above all other results, in lexical and hybrid modes and in the prompt hook.

#### Scenario: Symbol beats close matches
- **WHEN** `diffMirror` appears in one section only and other sections rank well for "diff" and "mirror" in both lists
- **THEN** the section containing `diffMirror` ranks first and its hit has tier `exact`

#### Scenario: File path
- **WHEN** the query is `packages/core/src/latmd/search.ts`
- **THEN** the sections that mention that path rank first

#### Scenario: Bare file name
- **WHEN** the query is `search.ts` and a section mentions `packages/core/src/latmd/search.ts`
- **THEN** that section has tier `exact`

#### Scenario: Plain words have no tier
- **WHEN** the query is `edge syntax`
- **THEN** every hit has tier `fused`

### Requirement: Similarity floor
The system SHALL drop vector hits whose cosine similarity is below a floor (0.2 unless the provider family's evaluated constant or `TG_SEARCH_MIN_SIMILARITY` sets another value) before fusing, and SHALL return no results when no list has hits.

#### Scenario: Nonsense query
- **WHEN** a provider is configured, no chunk reaches the floor for `zxqv flurb`, and no section contains those words
- **THEN** the result is empty

#### Scenario: Override
- **WHEN** `TG_SEARCH_MIN_SIMILARITY=0.5` is set
- **THEN** no hit in the JSON output has a similarity below 0.5

### Requirement: Distinct-section vector candidates
The vector list SHALL collapse chunk hits to the best chunk per section before taking its top 50, so that chunks of a few long sections cannot fill the list.

#### Scenario: Long sections
- **WHEN** three sections each have 30 chunks above the floor and a fourth has one
- **THEN** the fourth section is in the vector list

### Requirement: Chunk vector cache
The system SHALL key cached vectors by chunk text hash under a label that includes the provider, the model and the chunker version, SHALL embed only chunks the cache lacks, and SHALL re-embed when the chunker version changes.

#### Scenario: Edit one paragraph
- **WHEN** one paragraph of a long section changes and search runs again
- **THEN** only the chunks containing changed text are embedded

### Requirement: Ranking evaluation
The project SHALL keep a labeled query set over its `lat.md/` with tuning and held-out halves, and a script that reports MRR@10, nDCG@10 and recall@5 for the previous and new ranking in lexical mode, in hybrid mode when a provider is configured, and for lat.md's `lat search` when it is installed; CI SHALL fail when held-out lexical MRR@10 falls below the recorded value.

#### Scenario: Report
- **WHEN** `npm run eval:search` runs with no provider configured
- **THEN** it prints lexical metrics for both rankings, per query kind, and makes no network request
