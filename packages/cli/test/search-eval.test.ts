import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSearchDocs } from '@obsigraph/core';
import { expect, it } from 'vitest';
import { evaluate, lexicalConfigs, loadQueries } from '../../../eval/search/evaluate.mjs';
import { Project } from '../src/project.mjs';

const root = join(import.meta.dirname, '../../..');

// @tg: verifies:: [[tests/tg-search#Ranking evaluation#Held-out regression check]] {since: "2026-11-03", level: integration}
// @lat: [[tests/tg-search#Ranking evaluation#Held-out regression check]]
it('keeps lexical held-out MRR@10 at or above the recorded baseline', async () => {
  const { lexicalHoldoutMrr10 } = JSON.parse(readFileSync(join(root, 'eval/search/baseline.json'), 'utf8')) as { lexicalHoldoutMrr10: number };
  const project = new Project(root);
  const config = lexicalConfigs(buildSearchDocs(project.index(), (p) => project.text(p))).find((c) => c.name === 'lexical new')!;
  const holdout = (await evaluate(config, loadQueries(root))).holdout!;
  // A drop means ranking got worse, or lat.md/ moved a labeled section: fix the ranking or the labels, then `npm run eval:search -- --record`.
  expect(Number(holdout.mrr.toFixed(3))).toBeGreaterThanOrEqual(lexicalHoldoutMrr10);
});

// @tg: verifies:: [[tests/tg-search#Ranking evaluation#Report without network]] {since: "2026-11-03", level: integration}
// @lat: [[tests/tg-search#Ranking evaluation#Report without network]]
// @tg: verifies:: [[openspec:tg-search#Ranking evaluation#Report]]
it('reports lexical metrics for both rankings per query kind without a provider', async () => {
  const project = new Project(root);
  const configs = lexicalConfigs(buildSearchDocs(project.index(), (p) => project.text(p)));
  expect(configs.map((c) => c.name)).toEqual(['lexical previous', 'lexical new']);
  const queries = loadQueries(root);
  for (const c of configs) {
    const m = await evaluate(c, queries);
    for (const group of ['all', 'tune', 'holdout', 'identifier', 'keyword', 'meaning', 'nonsense']) expect(m[group]).toBeDefined();
    expect(m.identifier!.mrr).toBeGreaterThan(0);
  }
});
