---
type: Decision
openspec: [graph-store, store-sync, local-embedding, vector-pack, hybrid-ranking, tg-retrieve, plugin-search, model-setup]
---
# Embedded Search

Planned: one embedded LadybugDB graph store per host holding graph, text and vectors, a bundled local embedding model, and one hybrid ranking pipeline for CLI, plugin (desktop and mobile) and sidecar.

Only part of a first iteration is implemented. improve-tg-search-ranking improves today's in-memory `tg search`: its exact-identifier tier and ranking evaluation landed on Nov 3, 2026 (see [[embedded-search#First iteration results]]); its section chunks and similarity floor wait, because they change results only when an embedding provider is configured. The rest is specified by five OpenSpec changes, deferred until there is demand: add-embedded-graph-store, add-local-embedding, add-hybrid-ranking, add-plugin-search, converge-sidecar-vectors. Decisions with lasting trade-offs are recorded in `docs/adr/` 0001 to 0003, and the vocabulary (Graph store, Card, Chunk, Fact, Model fingerprint, Shadow build, Vector pack, Graph boost, Context pack) in `CONTEXT.md`. When a change lands, its part of this page moves into [[vector-search]], [[ladybug-mirror]], [[cli#Search]] or [[sidecar]].

## Graph store per host

Every host keeps a derived LadybugDB database beside its corpus, through one `GraphStore` interface and one schema module in `core`.

The WASM build (`@ladybugdb/wasm-core` 0.21.2) statically links the vector (HNSW), full-text (BM25), JSON and algorithm extensions, needs no network install and no cross-origin isolation, and opens in about 250 ms from a cold CLI process. The plugin runs its async build in a Worker, the CLI and VS Code its Node sync build, and the sidecar keeps the native build with the extensions pre-installed. Vector and full-text indexes exist only on node tables, so searchable edges are reified. Locations: `.tg/graph.lbug` in the CLI, per-device IndexedDB in the plugin (never a synced folder), the data directory in the sidecar.

## Two-phase sync

Markdown reaches the store silently: a structural phase applies a signature diff in one transaction, and a vector phase fills embeddings from a queue without blocking it.

The diff is the sidecar's `diffMirror`, moved into `core`. The plugin syncs after `VaultIndex`'s debounced notifications, the CLI catches up by stat and hash before `search`, `retrieve` and `cypher`, and hooks never open the store. On mobile the vector phase runs only while the app is open and idle.

## Local embedding model

Planned, not built: the CLI would pre-bundle all-MiniLM-L6-v2 (lat.md's model) in a candle WASM runtime, so search is hybrid offline with no setup; the plugin would download weights only on request.

Presets: `minilm-l6` (English, default), `bge-small-en` (English) and `e5-small-multi` (about 100 languages), plus custom Ollama and OpenAI-compatible models. MiniLM's vocabulary is English-only, so the plugin samples a vault's script mix at first run and recommends the multilingual preset above 10% non-Latin letters. A model fingerprint covers weights, pooling, prefixes, chunker and text templates; the stored fingerprint is authoritative and a change runs as a shadow build while the old index keeps answering. The plugin ships all code in `main.js` and downloads only weights, verified by sha256, because Obsidian's policies forbid installing dependencies at runtime.

## Searchable units and ranking

Vault nodes have a Card (what it is); every node has token-sized Chunks (where things are said); typed edges become Facts (which relationship). Lattice sections get no Card.

The baseline is lat.md 0.13, which is already hybrid: BM25 over chunks, an exact-identifier tier, cosine with a 0.2 floor and two-list RRF. The pipeline keeps all of that and adds Cards, Facts and the graph boost only where a held-out evaluation shows a gain.

Lists come from a `ListSource` interface, so ranking runs over today's in-memory index before the store lands: exact identifiers (including camelCase), BM25 over Chunks and Facts, and exact cosine scans over Chunks, Cards and Facts with a per-preset floor. Each list fetches until it holds 50 distinct nodes. Facts lift fully to their source and half to their target; weighted RRF fuses; a graph boost over typed edges only, degree-normalized and capped at a quarter of the top-20 score spread, may follow; exact-identifier nodes rank first; results group one per node. An HNSW index is used only above 50,000 units. `tg search` gains modes, targets, type filters, `--explain` and `--then`; `tg retrieve` and MCP `tg_retrieve` return the sidecar's context-pack contract.

## Plugin search and devices

The plugin gets a search view with an always-visible model status, a related-notes panel, and a copyable context pack; the model choice is per vault, semantic search can be off per device.

Devices share embeddings through a vector pack: content-addressed files of float16 vectors under the synced plugin folder, one per note version, so a phone reuses what a laptop embedded and sync conflicts are harmless.

## First iteration results

Measured Nov 3, 2026 with `npm run eval:search` over 44 labeled queries and 974 sections of this repository: the exact tier lifts identifier queries and leaves the others unchanged.

- changed_by:: [[roadmap#Roadmap#Phase 3 grow the Obsidian side#Embedded search in two steps]] {date: 2026-11-03}

MRR@10 per configuration and query kind; *nonsense empty* is the share of the four nonsense queries that return nothing. Hybrid uses a local Ollama `nomic-embed-text`.

| Configuration | All (40) | Held-out (20) | Identifier (16) | Keyword (12) | Meaning (12) | Nonsense empty |
| --- | --- | --- | --- | --- | --- | --- |
| Lexical, previous | 0.529 | 0.505 | 0.750 | 0.704 | 0.059 | 0.75 |
| Lexical, exact tier | 0.558 | 0.555 | 0.823 | 0.704 | 0.059 | 0.75 |
| Hybrid, previous | 0.600 | 0.576 | 0.783 | 0.680 | 0.277 | 0 |
| Hybrid, exact tier | 0.620 | 0.616 | 0.833 | 0.680 | 0.277 | 0 |
| `lat search` (lat.md 0.12.2) | 0.369 | 0.450 | 0.397 | 0.243 | 0.458 | 0 |

Recall@5 on identifier queries reaches 1.0 with the tier in both modes (0.906 lexical and 0.969 hybrid before).

The remaining identifier misses all sit at rank 2 or 3 behind a test-spec section that names the same identifier: both are exact hits, and BM25's length normalization favors the shorter test section. Paraphrased (meaning) queries are where vectors help (0.06 to 0.28 MRR@10), and hybrid search answers every nonsense query, since every vector hit with a positive cosine is kept; the similarity floor addresses that. `lat search` here is lat.md 0.12.2, purely semantic over its own index, so it is a reference rather than the 0.13 hybrid baseline.
