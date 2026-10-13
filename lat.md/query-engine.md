---
type: Decision
openspec: [cypher-extensions, cypher-query, engine-conformance, graph-query-block, ladybug-backend]
---
# Query Engine

Queries are written in openCypher inside `graph-query` blocks and run through one interface backed by two engines.

## Two backends

The default engine is an in-plugin TypeScript interpreter over the live graph; an optional LadybugDB backend in the sidecar takes the same query text.

Both return the same `{columns, rows}` contract and are read-only. A block picks one with `backend: builtin|ladybug` or the plugin default; Ladybug blocks call the sidecar through [[packages/plugin/src/query/remote.ts#runRemote]], which maps every response to a result, a positioned error or a retry, and render asynchronously. See [[ladybug-mirror#Query translation]]. A conformance suite runs a corpus of about 60 queries over a fixture vault on both engines (`runCorpus` (`packages/sidecar/conformance/runner.mts`), rules in `compare` (`packages/sidecar/conformance/compare.mts`)) and prints a report with one line per query, both results for each divergence and the counts per outcome. Any undocumented divergence fails. Intentional ones are listed in `packages/sidecar/conformance/differences.json` (UNWIND and CASE only on Ladybug; startNode, endNode, keys and properties only built-in), each with the outcome each engine is documented to give; `classify` accepts a cited difference only when both engines give exactly those outcomes. The corpus includes `CREATE`, `MERGE`, `SET`, `DELETE` and `REMOVE` queries that must fail `readonly` on both engines, and must exercise every clause, pattern feature, operator, function and aggregate in the tables `parser.ts` exports, matched against [[packages/core/src/cypher/parser.ts#queryConstructs]] rather than query text. It caught Ladybug's walk semantics for variable-length paths, now translated to `TRAIL`. Re-record built-in expectations with `OBSIGRAPH_RECORD=1`.

## Supported subset

The in-plugin engine supports a read-only subset: matching, staging with `WITH`, optional matches, variable-length paths and aggregation, with everything else failing by name.

Parsed by [[packages/core/src/cypher/parser.ts#parseQuery]] and executed by [[packages/core/src/cypher/exec.ts#execute]] as a pipeline of clauses over row streams. Supported exactly:

- Clauses: `MATCH` and `OPTIONAL MATCH` (each with `WHERE`; optional rows keep nulls), `WITH` (aliases required for expressions; `DISTINCT`, `*`, `ORDER BY`, `SKIP`, `LIMIT`, then `WHERE`; only listed variables stay in scope), `RETURN [DISTINCT]` (including `*`), `ORDER BY`, `SKIP`, `LIMIT`.
- Patterns: labels, inline property maps, directed, incoming and undirected relationships, type alternation `[:a|b]`, comma-separated patterns, relationship uniqueness per MATCH, variable-length `*`, `*n`, `*n..m`, `*..m`, `*n..` (relationship variable binds a list of relationships and is reported as a scalar column; unbounded ranges stop at the depth cap, default 10, with a result notice) and path variables `p = (...)`.
- Expressions: literals, lists, maps, `$params`, property and index access, label predicates `n:Label`, arithmetic, comparisons, `IN`, `STARTS WITH`, `ENDS WITH`, `CONTAINS`, `IS [NOT] NULL`, three-valued `AND`/`OR`/`XOR`/`NOT`.
- Functions: `id`, `type`, `labels`, `keys`, `properties`, `startNode`, `endNode`, string helpers, `size`, `coalesce`, conversions, numeric helpers, `head`, `last`, `reverse`, `length`, `nodes`, `relationships`.
- Aggregates: `count` (incl. `count(*)`), `sum`, `avg`, `min`, `max`, `collect`, each with optional `DISTINCT`; non-aggregate items are grouping keys; nulls ignored; empty input without keys yields 0, 0, null, null, null, []. Aggregates are rejected in `WHERE`.
- Built-in properties: `n.stub`, `r.id`, `r.sign`.

Write clauses fail as read-only. Valid openCypher outside this list fails with kind `unsupported` and a message naming the construct (`... is not supported by the built-in engine`): `UNWIND`, `UNION`, `CALL`, `LOAD CSV`, `USE`, `CASE`, `=~`, list slicing, `shortestPath`, unsupported aggregates and unknown functions, list and pattern comprehensions, map projections (`n {.title}`), pattern predicates (`WHERE (a)-->(b)`) and `EXISTS {}`, `COUNT {}` and `COLLECT {}` subqueries. Only malformed text is a `syntax` error. Errors carry line and column. The message does not point at Ladybug; on `backend: ladybug` such queries run there untranslated (see [[ladybug-mirror#Query translation]]).

## Query block

A `graph-query` fenced block holds a header of options followed by the Cypher text.

Header options are `view` (`auto`, `table` or `graph`), `columns` (comma-separated names to show), `height` (graph height in pixels, 100 to 4000, default 360), `backend` (`builtin` or `ladybug`, overriding the plugin default), `code` (`show` or `hide` source-code nodes of the code layer in graph results) and `node.<Type>` or `edge.<type>` styling. An unknown option or invalid value is reported with its line.

The query may refer to the note holding the block with `{{name}}` variables, replaced by Cypher literals before parsing: `path`, `name`, `title`, `folder`, `extension` and frontmatter as `fm.<property>`. Unresolved names become `null`; nothing is evaluated. See [[packages/plugin/src/query/variables.ts#substituteVariables]].

The result shape picks the renderer unless the header overrides it: nodes, relationships or paths render as a graph, scalars as a table. Blocks re-run live on note changes, debounced. See [[visualization]].
