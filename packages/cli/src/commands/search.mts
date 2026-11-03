import { join } from 'node:path';
import { buildSearchDocs, exactMatches, LexicalIndex, rankSections, vectorRank, type RankedHit } from '@obsigraph/core';
import { EXIT_ERROR, EXIT_FINDINGS, EXIT_OK, register, type Command, type Ctx } from '../cli.mjs';
import { embedConfig, VectorCache, type EmbedConfig } from '../embed.mjs';
import { NoLatDir, Project } from '../project.mjs';

const quote = (s: string): string => (s ? s.split('\n').map((l) => (l ? `  > ${l}` : '  >')).join('\n') : '  > (no leading paragraph)');

function open(ctx: Ctx): Project | null {
  try {
    return new Project(ctx.root);
  } catch (e) {
    if (e instanceof NoLatDir) {
      ctx.err(`${e.message}\n`);
      return null;
    }
    throw e;
  }
}

// @tg: implements:: [[openspec:tg-search#Hybrid ranking]]
export const search: Command = {
  name: 'search',
  summary: 'Search sections: lexical by default, hybrid when embeddings are configured',
  usage: 'search [--limit N] [--lexical] <query>',
  flags: { limit: 'string', lexical: 'bool' },
  async run(ctx, args, flags) {
    const project = open(ctx);
    if (!project) return EXIT_ERROR;
    const query = args.join(' ').trim();
    if (!query) {
      ctx.err('usage: tg search <query>\n');
      return EXIT_ERROR;
    }
    const limit = Math.max(1, Number(flags.get('limit') ?? 5) || 5);
    const docs = buildSearchDocs(project.index(), (p) => project.text(p));
    const lexical = new LexicalIndex(docs).search(query, 50);

    let config: EmbedConfig | null = null;
    if (!flags.has('lexical')) {
      try {
        config = embedConfig(ctx.env, ctx.fetch);
      } catch (e) {
        ctx.err(`${(e as Error).message}\n`);
        return EXIT_ERROR;
      }
    }
    const exact = exactMatches(docs, query);
    let hits: RankedHit[] = rankSections({ exact, lists: { lexical }, limit });
    let mode = 'lexical';
    let notice: string | null = null;
    if (config) {
      try {
        const cache = new VectorCache(join(ctx.root, '.tg'));
        const { vectors } = await cache.vectorsFor(docs, config);
        const [q] = await config.provider.embed([query]);
        const vector = vectorRank(docs, vectors, q!);
        hits = rankSections({ exact, lists: { lexical, vector }, limit });
        mode = 'hybrid';
      } catch (e) {
        notice = `embeddings unavailable (${(e as Error).message}); showing lexical results`;
      }
    }
    if (ctx.json) {
      const out = hits.map((h) => ({ id: h.id, score: h.score, file: h.doc.file, startLine: h.doc.startLine, endLine: h.doc.endLine, summary: h.doc.summary, tier: h.tier, ranks: h.ranks, ...(h.similarity === undefined ? {} : { similarity: h.similarity }) }));
      ctx.out(`${JSON.stringify({ mode, notice, query, hits: out })}\n`);
      return hits.length ? EXIT_OK : EXIT_FINDINGS;
    }
    if (!hits.length) {
      ctx.out(`No sections found for "${query}"\n${notice ? `Note: ${notice}\n` : ''}`);
      return EXIT_FINDINGS;
    }
    const label = mode === 'hybrid' ? 'hybrid match' : 'lexical match';
    const lines = [`## Search results for "${query}":`, ''];
    for (const h of hits) lines.push(`* Section: [[${h.id}]] (${h.tier === 'exact' ? 'exact match' : label})`, `  Defined in ${h.doc.file}:${h.doc.startLine}-${h.doc.endLine}`, '', quote(h.doc.summary), '');
    lines.push('## To navigate further:', '', '* `tg section "section#id"` — show full content with outgoing/incoming refs', '* `tg search "new query"` — search for something else');
    if (notice) lines.push('', `Note: ${notice}`);
    ctx.out(`${lines.join('\n')}\n`);
    return EXIT_OK;
  },
};

// @tg: implements:: [[openspec:tg-search#Derived cache]]
export const reindex: Command = {
  name: 'reindex',
  summary: 'Rebuild the derived embedding cache in .tg/',
  usage: 'reindex',
  async run(ctx) {
    const project = open(ctx);
    if (!project) return EXIT_ERROR;
    let config: EmbedConfig | null;
    try {
      config = embedConfig(ctx.env, ctx.fetch);
    } catch (e) {
      ctx.err(`${(e as Error).message}\n`);
      return EXIT_ERROR;
    }
    if (!config) {
      ctx.out('Lexical search needs no index. Set TG_EMBED_PROVIDER (ollama or openai) or TG_EMBED_KEY to enable embeddings.\n');
      return EXIT_OK;
    }
    const docs = buildSearchDocs(project.index(), (p) => project.text(p));
    try {
      const { embedded, reused } = await new VectorCache(join(ctx.root, '.tg')).vectorsFor(docs, config);
      ctx.out(`Indexed ${docs.length} sections with ${config.label}: ${embedded} embedded, ${reused} reused.\n`);
      return EXIT_OK;
    } catch (e) {
      ctx.err(`embedding failed: ${(e as Error).message}\n`);
      return EXIT_ERROR;
    }
  },
};

register(search, reindex);
