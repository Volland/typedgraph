// `npm run eval:search [-- --record]`: ranking metrics for the previous and new `tg search` ranking.
// Lexical always; hybrid when an embedding provider is configured (TG_EMBED_PROVIDER, TG_EMBED_KEY, ...);
// lat.md's `lat search` when `lat` is on PATH and --lat is given. --record writes baseline.json, --verbose lists misses.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSearchDocs } from '@obsigraph/core';
import { embedConfig, VectorCache } from '../../packages/cli/src/embed.mjs';
import { Project } from '../../packages/cli/src/project.mjs';
import { evaluate, hybridConfigs, lexicalConfigs, loadQueries, type Config, type Metrics } from './evaluate.mjs';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const queries = loadQueries(root);
const project = new Project(root);
const docs = buildSearchDocs(project.index(), (p) => project.text(p));

const configs: Config[] = lexicalConfigs(docs);
const config = embedConfig(process.env);
if (config) {
  const { vectors } = await new VectorCache(join(root, '.tg')).vectorsFor(docs, config);
  configs.push(...hybridConfigs(docs, vectors, async (q) => (await config.provider.embed([q]))[0]!).map((c) => ({ ...c, name: `${c.name} (${config.label})` })));
}
if (args.has('--lat')) {
  configs.push({
    name: 'lat search',
    rank: (q) => {
      const out = execFileSync('lat', ['search', q, '--limit', '10'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return { ids: [...out.matchAll(/^\* Section: \[\[([^\]]+)\]\]/gm)].map((m) => m[1]!) };
    },
  });
}

const f = (x: number | undefined): string => (x === undefined ? '    -' : x.toFixed(3).padStart(5));
const groups = ['all', 'tune', 'holdout', 'identifier', 'keyword', 'meaning', 'nonsense'];
const results: Record<string, Record<string, Metrics>> = {};
console.log(`${queries.length} queries, ${docs.length} sections\n`);
for (const c of configs) {
  results[c.name] = await evaluate(c, queries);
  console.log(`## ${c.name}\n\n| group      |  n | MRR@10 | nDCG@10 | R@5   | empty | no vec |\n|------------|----|--------|---------|-------|-------|--------|`);
  for (const g of groups) {
    const m = results[c.name]![g];
    if (m) console.log(`| ${g.padEnd(10)} | ${String(m.n).padStart(2)} |  ${f(m.mrr)} |   ${f(m.ndcg)} | ${f(m.recall5)} | ${f(m.empty)} |  ${f(m.noVector)} |`);
  }
  if (args.has('--verbose')) {
    for (const query of queries) {
      const ids = (await c.rank(query.q)).ids;
      const at = ids.findIndex((id) => query.relevant.includes(id));
      if (at !== 0 && query.kind !== 'nonsense') console.log(`  miss@1 ${query.kind.padEnd(10)} ${JSON.stringify(query.q)}: ${at < 0 ? 'not in top 10' : `rank ${at + 1}`}; first ${ids[0] ?? '-'}`);
      if (query.kind === 'nonsense' && ids.length) console.log(`  answered nonsense ${JSON.stringify(query.q)}: first ${ids[0]}`);
    }
  }
  console.log('');
}

if (args.has('--record')) {
  const mrr = results['lexical new']!.holdout!.mrr;
  writeFileSync(join(root, 'eval/search/baseline.json'), `${JSON.stringify({ lexicalHoldoutMrr10: Number(mrr.toFixed(3)) }, null, 2)}\n`);
  console.log(`Recorded lexical held-out MRR@10 ${mrr.toFixed(3)} in eval/search/baseline.json`);
}
