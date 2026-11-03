import { cosine } from '../embed/chunk.js';
import type { LatIndex } from './index.js';

export interface SearchDoc {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  /** Heading and the trailing id segments. */
  title: string;
  summary: string;
  /** The section's own text, up to the next heading. */
  body: string;
  /** Identifier tokens from id, file path, heading and body, for the exact tier. */
  idents: Set<string>;
}

export interface SearchHit {
  id: string;
  score: number;
  doc: SearchDoc;
}

export type ListName = 'lexical' | 'vector';

export interface RankedHit extends SearchHit {
  /** `exact` when the section contains the query as an identifier, ranked above every `fused` hit. */
  tier: 'exact' | 'fused';
  /** 1-based rank in each list the section appears in. */
  ranks: Partial<Record<ListName, number>>;
  /** The vector list's cosine similarity, when the section has a vector hit. */
  similarity?: number;
}

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'it', 'as', 'by', 'with', 'be', 'at', 'this', 'that']);

function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Lowercased word tokens with light stemming and stop words removed. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
}

const IDENT_RE = /[\p{L}\p{N}_][\p{L}\p{N}_./:#@-]*/gu;

function isIdentifier(token: string): boolean {
  return /[_./:#@-]/.test(token) || /\p{Ll}\p{Lu}/u.test(token) || token.length >= 40;
}

/**
 * Distinct lowercased identifier-like tokens: containing `_ . / : # @ -`,
 * camelCase or PascalCase, or at least 40 characters, with trailing `.`, `:`
 * and `-` stripped. Plain words are never identifiers. A token also yields
 * its `#` parts and its suffixes after each `/`, so `LexicalIndex` and
 * `search.ts` are found inside `[[packages/core/src/latmd/search.ts#LexicalIndex]]`.
 */
// @tg: implements:: [[openspec:tg-search#Exact identifiers rank first]]
export function identifierTokens(text: string): Set<string> {
  const out = new Set<string>();
  const add = (t: string): void => {
    if (t && isIdentifier(t)) out.add(t.toLowerCase());
  };
  for (const m of text.matchAll(IDENT_RE)) {
    const t = m[0].replace(/[.:-]+$/, '');
    if (!isIdentifier(t)) continue;
    add(t);
    for (const part of t.includes('#') ? t.split('#') : []) add(part);
    for (const piece of [t, ...t.split('#')]) for (let i = piece.indexOf('/'); i >= 0; i = piece.indexOf('/', i + 1)) add(piece.slice(i + 1));
  }
  return out;
}

/** The query as one lowercased identifier token, or null when it is words or a phrase. */
export function queryIdentifier(query: string): string | null {
  const q = query
    .trim()
    .replace(/^[`'"]+|[`'"]+$/g, '')
    .replace(/^[^\p{L}\p{N}_]+/u, '')
    .replace(/[.:-]+$/, '');
  const tokens = [...q.matchAll(IDENT_RE)];
  if (tokens.length !== 1 || tokens[0]![0].length !== q.length || !isIdentifier(q)) return null;
  return q.toLowerCase();
}

/** Sections that contain the query as an identifier; empty when the query is not one. */
export function exactMatches(docs: SearchDoc[], query: string): SearchDoc[] {
  const ident = queryIdentifier(query);
  return ident ? docs.filter((d) => d.idents.has(ident)) : [];
}

/** One search document per section, with its own body text (not its children's). */
// @tg: implements:: [[openspec:tg-search#Lexical default]]
export function buildSearchDocs(index: LatIndex, readText: (filePath: string) => string | null): SearchDoc[] {
  const cache = new Map<string, string[]>();
  const linesOf = (p: string): string[] => {
    if (!cache.has(p)) cache.set(p, (readText(p) ?? '').split('\n'));
    return cache.get(p)!;
  };
  return index.searchSections().map((s) => {
    const body = linesOf(s.filePath).slice(s.startLine, s.endLine).join('\n');
    const tail = s.id.split('#').slice(1).join(' ');
    const idents = identifierTokens(`${s.id}\n${s.filePath}\n${s.heading}\n${body}`);
    return { id: s.id, file: s.filePath, startLine: s.startLine, endLine: s.endLine, title: `${s.heading} ${tail}`, summary: s.firstParagraph, body, idents };
  });
}

const FIELD_WEIGHT = { title: 3, summary: 2, body: 1 } as const;
const K1 = 1.2;
const B = 0.75;

interface FieldIndex {
  tf: Map<string, number>[];
  len: number[];
  avg: number;
  df: Map<string, number>;
}

function indexField(texts: string[]): FieldIndex {
  const tf: Map<string, number>[] = [];
  const df = new Map<string, number>();
  const len: number[] = [];
  for (const t of texts) {
    const tokens = tokenize(t);
    const m = new Map<string, number>();
    for (const w of tokens) m.set(w, (m.get(w) ?? 0) + 1);
    for (const w of m.keys()) df.set(w, (df.get(w) ?? 0) + 1);
    tf.push(m);
    len.push(tokens.length);
  }
  return { tf, len, avg: len.reduce((a, b) => a + b, 0) / Math.max(len.length, 1) || 1, df };
}

/** BM25 over title, summary and body with field weights; rebuilt per query batch since docs corpora are small. */
// @tg: implements:: [[cli#Search]] {since: "2026-10-04"}
// @lat: [[cli#Search]]
// @tg: implements:: [[openspec:tg-search#Lexical default]]
export class LexicalIndex {
  private readonly fields: Record<keyof typeof FIELD_WEIGHT, FieldIndex>;

  constructor(readonly docs: SearchDoc[]) {
    this.fields = { title: indexField(docs.map((d) => d.title)), summary: indexField(docs.map((d) => d.summary)), body: indexField(docs.map((d) => d.body)) };
  }

  search(query: string, limit = 10): SearchHit[] {
    const terms = [...new Set(tokenize(query))];
    if (!terms.length) return [];
    const n = this.docs.length;
    const phrase = query.trim().toLowerCase();
    const hits: SearchHit[] = [];
    for (let i = 0; i < n; i++) {
      let score = 0;
      for (const [name, weight] of Object.entries(FIELD_WEIGHT) as [keyof typeof FIELD_WEIGHT, number][]) {
        const f = this.fields[name];
        for (const t of terms) {
          const tf = f.tf[i]!.get(t);
          if (!tf) continue;
          const df = f.df.get(t) ?? 0;
          const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
          score += weight * idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * f.len[i]!) / f.avg)));
        }
      }
      if (score > 0 && phrase.length > 2 && this.docs[i]!.title.toLowerCase().includes(phrase)) score *= 1.5;
      if (score > 0) hits.push({ id: this.docs[i]!.id, score, doc: this.docs[i]! });
    }
    return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
  }
}

/** Rank documents by cosine similarity to a query vector. */
export function vectorRank(docs: SearchDoc[], vectors: (number[] | undefined)[], query: number[], limit = 50): SearchHit[] {
  const hits: SearchHit[] = [];
  docs.forEach((doc, i) => {
    const v = vectors[i];
    if (v) hits.push({ id: doc.id, doc, score: cosine(v, query) });
  });
  return hits.filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Reciprocal rank fusion of named ranked lists, then the exact tier: sections
 * that contain the query as an identifier come first, ordered among
 * themselves by fused score. add-hybrid-ranking extends this with more lists,
 * weights and the graph boost.
 */
// @tg: implements:: [[openspec:tg-search#Exact identifiers rank first]]
// @tg: implements:: [[openspec:tg-search#Hybrid ranking]]
export function rankSections(opts: { exact?: SearchDoc[]; lists: Partial<Record<ListName, SearchHit[]>>; limit?: number; k?: number }): RankedHit[] {
  const { exact = [], lists, limit = 10, k = 60 } = opts;
  const acc = new Map<string, RankedHit>();
  for (const [name, list] of Object.entries(lists) as [ListName, SearchHit[]][]) {
    list.forEach((h, rank) => {
      let cur = acc.get(h.id);
      if (!cur) acc.set(h.id, (cur = { id: h.id, doc: h.doc, score: 0, tier: 'fused', ranks: {} }));
      cur.score += 1 / (k + rank + 1);
      cur.ranks[name] = rank + 1;
      if (name === 'vector') cur.similarity = h.score;
    });
  }
  for (const doc of exact) {
    const cur = acc.get(doc.id);
    if (cur) cur.tier = 'exact';
    else acc.set(doc.id, { id: doc.id, doc, score: 0, tier: 'exact', ranks: {} });
  }
  const tierOf = (h: RankedHit): number => (h.tier === 'exact' ? 0 : 1);
  return [...acc.values()].sort((a, b) => tierOf(a) - tierOf(b) || b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}

/** Reciprocal rank fusion of rankings, so lexical and vector scores need no calibration. */
// @tg: implements:: [[openspec:tg-search#Hybrid ranking]]
export function fuseRanks(rankings: SearchHit[][], limit = 10, k = 60): (SearchHit & { sources: number })[] {
  // Positional names: fuseRanks predates named lists and never has more than two.
  const names: ListName[] = ['lexical', 'vector'];
  const lists = Object.fromEntries(rankings.map((r, i) => [names[i] ?? `list${i}`, r])) as Partial<Record<ListName, SearchHit[]>>;
  return rankSections({ lists, limit, k }).map((h) => ({ id: h.id, score: h.score, doc: h.doc, sources: Object.keys(h.ranks).length }));
}
