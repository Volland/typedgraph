// Ranking evaluation for `tg search` over this repository's lat.md/.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exactMatches, fuseRanks, LexicalIndex, rankSections, vectorRank, type SearchDoc } from '@obsigraph/core';

export type Kind = 'identifier' | 'keyword' | 'meaning' | 'nonsense';
export type Split = 'tune' | 'holdout';

export interface Query {
  q: string;
  kind: Kind;
  split: Split;
  relevant: string[];
}

/** One ranked answer: section ids, best first, and whether the vector list contributed any hit. */
export interface Ranked {
  ids: string[];
  vectorHits?: number;
}

export interface Config {
  name: string;
  rank: (q: string) => Promise<Ranked> | Ranked;
}

export interface Metrics {
  n: number;
  mrr: number;
  ndcg: number;
  recall5: number;
  /** Nonsense queries only: share that return nothing at all. */
  empty?: number;
  /** Nonsense queries only, hybrid configurations: share with no vector hit. */
  noVector?: number;
}

/** The labeled query set, `eval/search/queries.json` under the repository root. */
export function loadQueries(root: string): Query[] {
  return (JSON.parse(readFileSync(join(root, 'eval/search/queries.json'), 'utf8')) as { queries: Query[] }).queries;
}
const DEPTH = 10;

export function lexicalConfigs(docs: SearchDoc[]): Config[] {
  const index = new LexicalIndex(docs);
  return [
    { name: 'lexical previous', rank: (q) => ({ ids: index.search(q, DEPTH).map((h) => h.id) }) },
    { name: 'lexical new', rank: (q) => ({ ids: rankSections({ exact: exactMatches(docs, q), lists: { lexical: index.search(q, 50) }, limit: DEPTH }).map((h) => h.id) }) },
  ];
}

/** Hybrid configurations over section vectors (`vectors[i]` belongs to `docs[i]`) and a query embedder. */
export function hybridConfigs(docs: SearchDoc[], vectors: (number[] | undefined)[], embed: (q: string) => Promise<number[]>): Config[] {
  const index = new LexicalIndex(docs);
  const lists = async (q: string) => {
    const vector = vectorRank(docs, vectors, await embed(q));
    return { lexical: index.search(q, 50), vector };
  };
  return [
    {
      name: 'hybrid previous',
      rank: async (q) => {
        const l = await lists(q);
        return { ids: fuseRanks([l.lexical, l.vector], DEPTH).map((h) => h.id), vectorHits: l.vector.length };
      },
    },
    {
      name: 'hybrid new',
      rank: async (q) => {
        const l = await lists(q);
        return { ids: rankSections({ exact: exactMatches(docs, q), lists: l, limit: DEPTH }).map((h) => h.id), vectorHits: l.vector.length };
      },
    },
  ];
}

function scoreOne(query: Query, r: Ranked): { mrr: number; ndcg: number; recall5: number } {
  const rel = new Set(query.relevant);
  const top = r.ids.slice(0, DEPTH);
  const first = top.findIndex((id) => rel.has(id));
  const dcg = top.reduce((s, id, i) => s + (rel.has(id) ? 1 / Math.log2(i + 2) : 0), 0);
  let idcg = 0;
  for (let i = 0; i < Math.min(rel.size, DEPTH); i++) idcg += 1 / Math.log2(i + 2);
  return {
    mrr: first >= 0 ? 1 / (first + 1) : 0,
    ndcg: idcg ? dcg / idcg : 0,
    recall5: rel.size ? top.slice(0, 5).filter((id) => rel.has(id)).length / rel.size : 0,
  };
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Metrics for one configuration, grouped by `all`, each split and each kind. */
// @tg: implements:: [[openspec:tg-search#Ranking evaluation]]
export async function evaluate(config: Config, queries: Query[]): Promise<Record<string, Metrics>> {
  const rows: { query: Query; r: Ranked }[] = [];
  for (const query of queries) rows.push({ query, r: await config.rank(query.q) });
  const groups: Record<string, typeof rows> = { all: rows };
  for (const row of rows) {
    (groups[row.query.split] ??= []).push(row);
    (groups[row.query.kind] ??= []).push(row);
  }
  const out: Record<string, Metrics> = {};
  for (const [name, group] of Object.entries(groups)) {
    const answerable = group.filter((g) => g.query.kind !== 'nonsense');
    const nonsense = group.filter((g) => g.query.kind === 'nonsense');
    const scored = answerable.map((g) => scoreOne(g.query, g.r));
    const m: Metrics = { n: answerable.length, mrr: mean(scored.map((s) => s.mrr)), ndcg: mean(scored.map((s) => s.ndcg)), recall5: mean(scored.map((s) => s.recall5)) };
    if (nonsense.length) {
      m.empty = mean(nonsense.map((g) => (g.r.ids.length ? 0 : 1)));
      if (nonsense.some((g) => g.r.vectorHits !== undefined)) m.noVector = mean(nonsense.map((g) => (g.r.vectorHits ? 0 : 1)));
    }
    out[name] = m;
  }
  return out;
}
