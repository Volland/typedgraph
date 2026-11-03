import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { run } from '../src/cli.mjs';
import '../src/commands/index.mjs';

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tg-search-'));
  mkdirSync(join(dir, 'lat.md'));
  const put = (p: string, t: string) => writeFileSync(join(dir, 'lat.md', p), t);
  put('lat.md', '# Lat\n\nIndex.\n\n- [[syntax]] — s\n- [[notes]] — n\n- [[access]] — a\n');
  put('syntax.md', '# Edge Syntax\n\nHow typed edges are written in notes.\n');
  put('notes.md', '# Notes\n\nGeneral notes.\n\n## Misc\n\nThis body mentions edge syntax once in passing.\n');
  put('access.md', '# Access\n\nHow people sign in with credentials.\n');
  return dir;
}

/** A fake embedding service: concepts become dimensions, so "login" is near "sign in". */
function fakeFetch(opts: { fail?: boolean } = {}) {
  const calls: { url: string; headers: Record<string, string>; inputs: string[] }[] = [];
  const vec = (t: string): number[] => {
    const s = t.toLowerCase();
    return [/login|sign in|credential/.test(s) ? 1 : 0, /graph|edge|node/.test(s) ? 1 : 0, 0.01];
  };
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const body = JSON.parse(String(init?.body)) as { input: string[] };
    calls.push({ url: u, headers: (init?.headers ?? {}) as Record<string, string>, inputs: body.input });
    if (opts.fail) throw new Error('connect ECONNREFUSED');
    const vectors = body.input.map(vec);
    const json = u.endsWith('/api/embed') ? { embeddings: vectors } : { data: vectors.map((embedding, index) => ({ index, embedding })) };
    return new Response(JSON.stringify(json), { status: 200 });
  }) as typeof fetch;
  return { impl, calls };
}

async function tg(cwd: string, env: Record<string, string>, f: typeof fetch | undefined, ...args: string[]) {
  let out = '';
  let err = '';
  const code = await run(args, { cwd, out: (t) => (out += t), err: (t) => (err += t), env, fetch: f });
  return { code, out, err };
}

// @tg: verifies:: [[tests/tg-search#Lexical default#No configuration]] {since: "2026-10-04", level: unit}
// @lat: [[tests/tg-search#Lexical default#No configuration]]
// @tg: verifies:: [[openspec:tg-search#Lexical default#No configuration]]
it('searches lexically with no configuration and no network', async () => {
  const dir = project();
  const forbidden = (async () => {
    throw new Error('network used');
  }) as unknown as typeof fetch;
  const r = await tg(dir, {}, forbidden, 'search', 'typed edges');
  expect(r.code).toBe(0);
  expect(r.out).toContain('(lexical match)');
  expect(r.out).toContain('[[lat.md/syntax#Edge Syntax]]');
});

// @tg: verifies:: [[tests/tg-search#Lexical default#Title outranks body]] {since: "2026-10-04", level: unit}
// @lat: [[tests/tg-search#Lexical default#Title outranks body]]
// @tg: verifies:: [[openspec:tg-search#Lexical default#Title outranks body]]
it('ranks the section titled with the query above one that only mentions it', async () => {
  const r = await tg(project(), {}, undefined, 'search', 'edge syntax', '--json');
  const ids = (JSON.parse(r.out) as { hits: { id: string }[] }).hits.map((h) => h.id);
  expect(ids[0]).toBe('lat.md/syntax#Edge Syntax');
  expect(ids).toContain('lat.md/notes#Notes#Misc');
});

// @tg: verifies:: [[tests/tg-search#Hybrid ranking#Provider configured]] {since: "2026-10-04", level: unit}
// @lat: [[tests/tg-search#Hybrid ranking#Provider configured]]
// @tg: verifies:: [[openspec:tg-search#Hybrid ranking#Provider configured]]
it('fuses lexical and vector ranks when a provider is configured', async () => {
  const dir = project();
  const f = fakeFetch();
  const lexicalOnly = await tg(dir, {}, undefined, 'search', 'login', '--json');
  expect((JSON.parse(lexicalOnly.out) as { hits: unknown[] }).hits).toHaveLength(0);
  const r = await tg(dir, { TG_EMBED_PROVIDER: 'ollama' }, f.impl, 'search', 'login', '--json');
  const j = JSON.parse(r.out) as { mode: string; hits: { id: string }[] };
  expect(j.mode).toBe('hybrid');
  expect(j.hits[0]!.id).toBe('lat.md/access#Access');
  expect(f.calls.some((c) => c.url.endsWith('/api/embed'))).toBe(true);
});

// @tg: verifies:: [[tests/tg-search#Hybrid ranking#Provider down]] {since: "2026-10-04", level: unit}
// @lat: [[tests/tg-search#Hybrid ranking#Provider down]]
// @tg: verifies:: [[openspec:tg-search#Hybrid ranking#Provider down]]
it('falls back to lexical results with a notice when the provider fails', async () => {
  const f = fakeFetch({ fail: true });
  const r = await tg(project(), { TG_EMBED_PROVIDER: 'ollama' }, f.impl, 'search', 'typed edges');
  expect(r.code).toBe(0);
  expect(r.out).toContain('Note: embeddings unavailable');
  expect(r.out).toContain('(lexical match)');
});

// @tg: verifies:: [[tests/tg-search#Key variable aliases#Alias honored]] {since: "2026-10-04", level: unit}
// @lat: [[tests/tg-search#Key variable aliases#Alias honored]]
// @tg: verifies:: [[openspec:tg-search#Key variable aliases#Alias honored]]
it('uses LAT_LLM_KEY as the provider key', async () => {
  const f = fakeFetch();
  const r = await tg(project(), { LAT_LLM_KEY: 'sk-test-123' }, f.impl, 'search', 'login', '--json');
  expect((JSON.parse(r.out) as { mode: string }).mode).toBe('hybrid');
  expect(f.calls[0]!.url).toBe('https://api.openai.com/v1/embeddings');
  expect(f.calls[0]!.headers.authorization).toBe('Bearer sk-test-123');
});

// @tg: verifies:: [[tests/tg-search#Key variable aliases#TG variables win over aliases]] {since: "2026-10-08", level: unit}
// @lat: [[tests/tg-search#Key variable aliases#TG variables win over aliases]]
it('prefers TG_EMBED_KEY_FILE over LAT_LLM_KEY', async () => {
  const dir = project();
  const keyFile = join(dir, 'key.txt');
  writeFileSync(keyFile, 'sk-from-file\n');
  const f = fakeFetch();
  const r = await tg(dir, { TG_EMBED_KEY_FILE: keyFile, LAT_LLM_KEY: 'sk-from-alias' }, f.impl, 'search', 'login', '--json');
  expect(r.code).toBe(0);
  expect(f.calls[0]!.headers.authorization).toBe('Bearer sk-from-file');
});

// @tg: verifies:: [[tests/tg-search#Key variable aliases#Not written to disk]] {since: "2026-10-04", level: unit}
// @lat: [[tests/tg-search#Key variable aliases#Not written to disk]]
// @tg: verifies:: [[openspec:tg-search#Key variable aliases#Not written to disk]]
it('never persists a key', async () => {
  const dir = project();
  await tg(dir, { LAT_LLM_KEY: 'sk-secret-xyz' }, fakeFetch().impl, 'search', 'login');
  const files = readdirSync(join(dir, '.tg'));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) expect(readFileSync(join(dir, '.tg', f), 'utf8')).not.toContain('sk-secret-xyz');
});

// @tg: verifies:: [[tests/tg-search#Derived cache#Cache deleted]] {since: "2026-10-04", level: unit}
// @lat: [[tests/tg-search#Derived cache#Cache deleted]]
// @tg: verifies:: [[openspec:tg-search#Derived cache#Cache deleted]]
it('recreates a deleted cache and reuses unchanged vectors on reindex', async () => {
  const dir = project();
  const env = { TG_EMBED_PROVIDER: 'ollama' };
  const f = fakeFetch();
  const first = await tg(dir, env, f.impl, 'reindex');
  expect(first.out).toMatch(/\d+ embedded, 0 reused/);
  const again = await tg(dir, env, f.impl, 'reindex');
  expect(again.out).toMatch(/0 embedded, \d+ reused/);
  rmSync(join(dir, '.tg'), { recursive: true });
  const r = await tg(dir, env, f.impl, 'search', 'login');
  expect(r.code).toBe(0);
  expect(readdirSync(join(dir, '.tg'))).toContain('vectors.json');
});

/** Sections that share words with identifier queries without containing the identifiers. */
function identProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tg-search-ident-'));
  mkdirSync(join(dir, 'lat.md'));
  const put = (p: string, t: string) => writeFileSync(join(dir, 'lat.md', p), t);
  put('lat.md', '# Lat\n\nIndex.\n\n- [[mirror]] — m\n- [[diff]] — d\n- [[ranking]] — r\n- [[paths]] — p\n');
  put('mirror.md', '# Mirror\n\nKeeps the store in step with the vault.\n\n## Sync\n\nEach run calls `diffMirror` and applies the result.\n');
  put('diff.md', '# Diff Mirror\n\nA diff of the mirror, diff by diff, mirror by mirror.\n');
  put('ranking.md', '# Ranking\n\nThe ranking lives in `packages/core/src/latmd/search.ts`.\n');
  put('paths.md', '# Packages Core Src Search\n\nPackages, core, src, latmd and search: search the packages in core src for latmd.\n');
  return dir;
}

type Hit = { id: string; tier: string; ranks: { lexical?: number; vector?: number }; similarity?: number };
const hitsOf = (out: string): Hit[] => (JSON.parse(out) as { hits: Hit[] }).hits;

// @tg: verifies:: [[tests/tg-search#Exact identifiers#Symbol beats close matches]] {since: "2026-11-03", level: unit}
// @lat: [[tests/tg-search#Exact identifiers#Symbol beats close matches]]
// @tg: verifies:: [[openspec:tg-search#Exact identifiers rank first#Symbol beats close matches]]
it('ranks the section containing a camelCase symbol first, in both modes', async () => {
  const dir = identProject();
  // Vectors favor the section about diffs and mirrors over the one that names the symbol.
  const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const { input } = JSON.parse(String(init?.body)) as { input: string[] };
    const vec = (t: string): number[] => (/^lat\.md\/diff/.test(t) || /^diffMirror$/.test(t) ? [1, 0.01] : [0.2, 1]);
    return new Response(JSON.stringify({ embeddings: input.map(vec) }), { status: 200 });
  }) as typeof fetch;
  for (const [env, f] of [[{}, undefined], [{ TG_EMBED_PROVIDER: 'ollama' }, impl]] as const) {
    const hits = hitsOf((await tg(dir, env, f, 'search', 'diffMirror', '--json')).out);
    expect(hits[0]!.id).toBe('lat.md/mirror#Mirror#Sync');
    expect(hits[0]!.tier).toBe('exact');
    expect(hits.slice(1).every((h) => h.tier === 'fused')).toBe(true);
  }
});

// @tg: verifies:: [[tests/tg-search#Exact identifiers#File path]] {since: "2026-11-03", level: unit}
// @lat: [[tests/tg-search#Exact identifiers#File path]]
// @tg: verifies:: [[openspec:tg-search#Exact identifiers rank first#File path]]
// @tg: verifies:: [[openspec:tg-search#Exact identifiers rank first#Bare file name]]
it('ranks the section that mentions a file path first, also for its bare file name', async () => {
  const dir = identProject();
  for (const q of ['packages/core/src/latmd/search.ts', '`search.ts`']) {
    const r = await tg(dir, {}, undefined, 'search', q);
    expect(r.out.indexOf('[[lat.md/ranking#Ranking]] (exact match)')).toBeGreaterThan(0);
    expect(r.out.indexOf('[[lat.md/ranking#Ranking]]')).toBeLessThan(r.out.indexOf('[[lat.md/paths#Packages Core Src Search]]'));
  }
});

// @tg: verifies:: [[tests/tg-search#Exact identifiers#Plain words have no tier]] {since: "2026-11-03", level: unit}
// @lat: [[tests/tg-search#Exact identifiers#Plain words have no tier]]
// @tg: verifies:: [[openspec:tg-search#Exact identifiers rank first#Plain words have no tier]]
it('gives plain-word queries no exact tier', async () => {
  const hits = hitsOf((await tg(project(), {}, undefined, 'search', 'edge syntax', '--json')).out);
  expect(hits.length).toBeGreaterThan(1);
  expect(hits.every((h) => h.tier === 'fused')).toBe(true);
});

// @tg: verifies:: [[tests/tg-search#Exact identifiers#Prompt hook]] {since: "2026-11-03", level: unit}
// @lat: [[tests/tg-search#Exact identifiers#Prompt hook]]
it('puts exact identifier hits first in the prompt hook', async () => {
  let out = '';
  const code = await run(['hook', 'claude', 'UserPromptSubmit'], { cwd: identProject(), out: (t) => (out += t), err: () => {}, env: {}, stdin: () => JSON.stringify({ prompt: 'packages/core/src/latmd/search.ts' }) });
  expect(code).toBe(0);
  const context = (JSON.parse(out) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext;
  const results = context.slice(context.indexOf('Search results for the user prompt'));
  expect(results.split('\n').find((l) => l.startsWith('* [['))).toContain('[[lat.md/ranking#Ranking]]');
});

// @tg: verifies:: [[tests/tg-search#Search output#Rank details in JSON]] {since: "2026-11-03", level: unit}
// @lat: [[tests/tg-search#Search output#Rank details in JSON]]
// @tg: verifies:: [[openspec:tg-search#Search output#JSON output]]
it('reports tier, per-list ranks and similarity in JSON output', async () => {
  const dir = project();
  const lexical = JSON.parse((await tg(dir, {}, undefined, 'search', 'edge syntax', '--json', '--lexical')).out) as { mode: string; hits: (Hit & { file: string; startLine: number; endLine: number; score: number })[] };
  expect(lexical.mode).toBe('lexical');
  expect(lexical.hits.length).toBeLessThanOrEqual(5);
  expect(lexical.hits.map((h) => h.ranks.lexical)).toEqual(lexical.hits.map((_, i) => i + 1));
  for (const h of lexical.hits) {
    expect(h).toMatchObject({ tier: 'fused', file: expect.any(String), startLine: expect.any(Number), endLine: expect.any(Number), score: expect.any(Number) });
    expect(h.similarity).toBeUndefined();
  }
  const hybrid = hitsOf((await tg(dir, { TG_EMBED_PROVIDER: 'ollama' }, fakeFetch().impl, 'search', 'login', '--json')).out);
  expect(hybrid[0]!.ranks.vector).toBe(1);
  expect(hybrid[0]!.similarity).toBeGreaterThan(0.9);
});
