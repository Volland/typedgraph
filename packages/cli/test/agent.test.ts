import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, it } from 'vitest';
import { run, type Io } from '../src/cli.mjs';
import '../src/commands/index.mjs';
import { createTgMcpServer } from '../src/commands/mcp-server.mjs';

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tg-agent-'));
  mkdirSync(join(dir, 'lat.md'));
  writeFileSync(join(dir, 'lat.md', 'lat.md'), '# Lat\n\nIndex.\n\n- [[auth]] — auth\n');
  writeFileSync(join(dir, 'lat.md', 'auth.md'), '# Auth\n\nHow login works.\n\n## Login\n\nCredentials are checked; see [[auth#Tokens]].\n\n## Tokens\n\nTokens expire.\n');
  return dir;
}

async function tg(cwd: string, args: string[], stdin = '') {
  let out = '';
  let err = '';
  const io: Io = { cwd, out: (t) => (out += t), err: (t) => (err += t), env: {}, stdin: () => stdin };
  const code = await run(args, io);
  return { code, out, err };
}

const read = (dir: string, p: string) => readFileSync(join(dir, p), 'utf8');

// @tg: verifies:: [[tests/tg-agent#Safe init#Dry run]] {since: "2026-10-04", level: unit}
// @lat: [[tests/tg-agent#Safe init#Dry run]]
// @tg: verifies:: [[openspec:tg-agent-integration#Safe init#Dry run]]
it('prints a diff and changes nothing with --dry-run', async () => {
  const dir = project();
  const r = await tg(dir, ['init', '--dry-run']);
  expect(r.code).toBe(0);
  expect(r.out).toContain('+++ b/CLAUDE.md');
  expect(r.out).toContain('+++ b/.claude/settings.json');
  expect(r.out).toContain('Dry run');
  expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false);
  expect(existsSync(join(dir, '.claude'))).toBe(false);
});

// @tg: verifies:: [[tests/tg-agent#Safe init#Writes by default]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#Safe init#Writes by default]]
// @tg: verifies:: [[openspec:tg-agent-integration#Safe init#Writes by default]]
it('writes and lists the files by default, and accepts --write as a no-op', async () => {
  const dir = project();
  const r = await tg(dir, ['init']);
  expect(r.code).toBe(0);
  expect(r.out).toContain('+ created CLAUDE.md');
  expect(r.out).toContain('Wrote ');
  expect(r.out).not.toContain('+++ b/');
  expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(true);
  const again = await tg(project(), ['init', '--write']);
  expect(again.out).toContain('Wrote ');
});

// @tg: verifies:: [[tests/tg-agent#Safe init#Idempotent write]] {since: "2026-10-04", level: unit}
// @lat: [[tests/tg-agent#Safe init#Idempotent write]]
// @tg: verifies:: [[openspec:tg-agent-integration#Safe init#Idempotent write]]
it('writes once and then has nothing left to change', async () => {
  const dir = project();
  await tg(dir, ['init', '--write']);
  const first = read(dir, 'CLAUDE.md');
  const again = await tg(dir, ['init', '--write']);
  expect(again.out).toContain('already set up');
  expect(read(dir, 'CLAUDE.md')).toBe(first);
  const settings = JSON.parse(read(dir, '.claude/settings.json')) as { hooks: Record<string, unknown[]> };
  expect(settings.hooks.Stop).toHaveLength(1);
});

// @tg: verifies:: [[tests/tg-agent#Migration from lat#Existing block detected]] {since: "2026-10-04", level: unit}
// @lat: [[tests/tg-agent#Migration from lat#Existing block detected]]
// @tg: verifies:: [[openspec:tg-agent-integration#Migration from lat#Existing block detected]]
it('reports an existing lat block and leaves it alone without --migrate', async () => {
  const dir = project();
  writeFileSync(join(dir, 'CLAUDE.md'), '# Mine\n\nKeep me.\n\n%% lat:begin %%\nRun `lat search`.\n%% lat:end %%\n');
  const r = await tg(dir, ['init', '--write']);
  expect(r.out).toContain('--migrate');
  expect(read(dir, 'CLAUDE.md')).toContain('%% lat:begin %%');
});

it('removes a lat block left next to an existing tg block with --migrate', async () => {
  const dir = project();
  writeFileSync(join(dir, 'CLAUDE.md'), '# Mine\n\n%% lat:begin %%\nRun `lat search`.\n%% lat:end %%\n\nMiddle.\n\n%% tg:begin %%\nold\n%% tg:end %%\n');
  await tg(dir, ['init', '--migrate']);
  const md = read(dir, 'CLAUDE.md');
  expect(md).not.toContain('lat:begin');
  expect(md.match(/%% tg:begin %%/g)).toHaveLength(1);
  expect(md.startsWith('# Mine\n\nMiddle.\n\n%% tg:begin %%\n')).toBe(true);
  expect(md).not.toContain('\nold\n');
});

// @tg: verifies:: [[tests/tg-agent#Migration from lat#Migration applied]] {since: "2026-10-04", level: unit}
// @lat: [[tests/tg-agent#Migration from lat#Migration applied]]
// @tg: verifies:: [[openspec:tg-agent-integration#Migration from lat#Migration applied]]
it('replaces the lat block, hooks and MCP entry with --write --migrate', async () => {
  const dir = project();
  writeFileSync(join(dir, 'CLAUDE.md'), '# Mine\n\nKeep me.\n\n%% lat:begin %%\nRun `lat search`.\n%% lat:end %%\n\nAfter.\n');
  mkdirSync(join(dir, '.claude'));
  writeFileSync(join(dir, '.claude/settings.json'), JSON.stringify({ model: 'x', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'lat hook claude Stop' }] }] } }));
  writeFileSync(join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { lat: { command: 'lat', args: ['mcp'] }, other: { command: 'o' } } }));
  await tg(dir, ['init', '--write', '--migrate']);
  const md = read(dir, 'CLAUDE.md');
  expect(md).not.toContain('lat:begin');
  expect(md).toContain('%% tg:begin %%');
  expect(md.startsWith('# Mine\n\nKeep me.\n\n')).toBe(true);
  expect(md.endsWith('\n\nAfter.\n')).toBe(true);
  const settings = JSON.parse(read(dir, '.claude/settings.json')) as { model: string; hooks: { Stop: { hooks: { command: string }[] }[] } };
  expect(settings.model).toBe('x');
  expect(settings.hooks.Stop.flatMap((e) => e.hooks.map((h) => h.command))).toEqual(['tg hook claude Stop']);
  const mcp = JSON.parse(read(dir, '.mcp.json')) as { mcpServers: Record<string, unknown> };
  expect(Object.keys(mcp.mcpServers).sort()).toEqual(['other', 'tg']);
});

// @tg: verifies:: [[tests/tg-agent#Instruction generation#Generate]] {since: "2026-10-04", level: unit}
// @lat: [[tests/tg-agent#Instruction generation#Generate]]
// @tg: verifies:: [[openspec:tg-agent-integration#Instruction generation#Generate]]
it('generates instructions that tell the agent to search first and check last', async () => {
  const r = await tg(mkdtempSync(join(tmpdir(), 'tg-gen-')), ['gen', 'claude.md']);
  expect(r.code).toBe(0);
  expect(r.out).toContain('tg search');
  expect(r.out).toContain('tg check');
  expect((await tg(process.cwd(), ['gen', 'nope'])).code).toBe(2);
});

// @tg: verifies:: [[tests/tg-agent#Agent hooks#Prompt hook]] {since: "2026-10-04", level: unit}
// @lat: [[tests/tg-agent#Agent hooks#Prompt hook]]
// @tg: verifies:: [[openspec:tg-agent-integration#Agent hooks#Prompt hook]]
it('the prompt hook reminds, expands refs and adds search hits', async () => {
  const dir = project();
  const r = await tg(dir, ['hook', 'claude', 'UserPromptSubmit'], JSON.stringify({ prompt: 'fix [[auth#Login]] and the token expiry' }));
  expect(r.code).toBe(0);
  const ctx = (JSON.parse(r.out) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } }).hookSpecificOutput;
  expect(ctx.hookEventName).toBe('UserPromptSubmit');
  expect(ctx.additionalContext).toContain('run `tg search`');
  expect(ctx.additionalContext).toContain('[[lat.md/auth#Auth#Login]]');
  expect(ctx.additionalContext).toContain('Search results for the user prompt');
});

// @tg: verifies:: [[tests/tg-agent#Agent hooks#Internal failure]] {since: "2026-10-04", level: unit}
// @lat: [[tests/tg-agent#Agent hooks#Internal failure]]
// @tg: verifies:: [[openspec:tg-agent-integration#Agent hooks#Internal failure]]
it('a hook outside any project exits 0 without blocking', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'tg-nohook-'));
  const stop = await tg(empty, ['hook', 'claude', 'Stop'], '{}');
  expect(stop.code).toBe(0);
  expect(stop.out).toBe('');
  const bad = await tg(empty, ['hook', 'claude', 'UserPromptSubmit'], 'not json');
  expect(bad.code).toBe(0);
  expect(bad.out).toContain('run `tg search`');
});

// @tg: verifies:: [[tests/tg-agent#Agent hooks#Cursor init]] {since: "2026-10-08", level: unit}
// @lat: [[tests/tg-agent#Agent hooks#Cursor init]]
// @tg: verifies:: [[openspec:tg-agent-integration#Agent hooks#Cursor init]]
it('writes Cursor rules and skills and no Cursor hook configuration', async () => {
  const dir = project();
  const r = await tg(dir, ['init', '--agent', 'cursor', '--write', '--json']);
  expect(r.code).toBe(0);
  const paths = (JSON.parse(r.out) as { changes: { path: string }[] }).changes.map((c) => c.path);
  expect(paths).toContain('.cursor/rules/tg.mdc');
  expect(paths.filter((p) => p.startsWith('.cursor/') && !p.startsWith('.cursor/skills/'))).toEqual(['.cursor/rules/tg.mdc']);
  expect(paths).toContain('.cursor/skills/tg-trace/SKILL.md');
  expect(existsSync(join(dir, '.cursor', 'hooks.json'))).toBe(false);
  expect(existsSync(join(dir, '.claude'))).toBe(false);
});

// @tg: verifies:: [[tests/tg-agent#MCP server#Cypher over docs and code]] {since: "2026-10-04", level: unit}
// @lat: [[tests/tg-agent#MCP server#Cypher over docs and code]]
// @tg: verifies:: [[openspec:tg-agent-integration#MCP server#Cypher over docs and code]]
it('serves the tools over MCP and tg_cypher returns the tagged result contract', async () => {
  const dir = project();
  const server = createTgMcpServer(dir, { cwd: dir, out: () => undefined, err: () => undefined, env: {} });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 't', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  expect(tools).toEqual(['tg_check', 'tg_cypher', 'tg_edges', 'tg_expand', 'tg_locate', 'tg_ontology', 'tg_refs', 'tg_search', 'tg_section', 'tg_trace']);
  const res = (await client.callTool({ name: 'tg_cypher', arguments: { query: 'MATCH (a:Section {title: \"Login\"})-[:references]->(b:Section) RETURN a, b.title' } })) as { content: { text: string }[] };
  const json = JSON.parse(res.content[0]!.text) as { columns: unknown[]; rows: Record<string, unknown>[][] };
  expect(json.rows).toHaveLength(1);
  expect(json.rows[0]![0]).toMatchObject({ _type: 'node', labels: ['Section'] });
  expect(json.rows[0]![1]).toBe('Tokens');
  const check = (await client.callTool({ name: 'tg_check', arguments: {} })) as { content: { text: string }[]; isError?: boolean };
  expect(check.content[0]!.text).toContain('All checks passed');
});

// @tg: verifies:: [[tests/tg-agent#Bundled skills#Skills installed]] {since: "2026-10-04", level: unit}
// @lat: [[tests/tg-agent#Bundled skills#Skills installed]]
// @tg: verifies:: [[openspec:tg-agent-integration#Bundled skills#Skills installed]]
it('installs all seven skills for Claude Code', async () => {
  const dir = project();
  await tg(dir, ['init', '--write']);
  for (const name of ['tg-docs', 'tg-graph', 'tg-trace', 'tg-impact', 'tg-audit', 'tg-migrate', 'tg-team']) expect(read(dir, `.claude/skills/${name}/SKILL.md`)).toContain(`name: ${name}`);
});

// @tg: verifies:: [[tests/tg-agent#Team ontology#Team ontology printed]] {since: "2026-11-18", level: unit}
// @lat: [[tests/tg-agent#Team ontology#Team ontology printed]]
// @tg: verifies:: [[openspec:tg-agent-integration#Team ontology template#Team ontology printed]]
it('prints the team ontology on request and never writes it on init', async () => {
  const r = await tg(project(), ['gen', 'team-types.md']);
  expect(r.code).toBe(0);
  for (const type of ['Member:', 'Team:', 'TeamAgent:', 'decided_by:', 'knows_about:', 'acts_for:']) expect(r.out).toContain(type);
  const dir = project();
  await tg(dir, ['init', '--write']);
  expect(existsSync(join(dir, 'Types/team-types.md'))).toBe(false);
});

// @tg: verifies:: [[tests/tg-agent#Team ontology#Only people decide]] {since: "2026-11-18", level: integration}
// @lat: [[tests/tg-agent#Team ontology#Only people decide]]
// @tg: verifies:: [[openspec:tg-agent-integration#Team ontology template#Only people decide]]
it('lets only a person be the one who decided', async () => {
  const dir = project();
  await tg(dir, ['init', '--write']);
  writeFileSync(join(dir, 'Types/team-types.md'), (await tg(dir, ['gen', 'team-types.md'])).out);
  writeFileSync(join(dir, 'lat.md/people.md'), '---\ntype: Member\n---\n# People\n\nThe team.\n\n## Alice\n\n@alice, tech lead.\n');
  writeFileSync(join(dir, 'lat.md/agents.md'), '---\ntype: TeamAgent\n---\n# Agents\n\nThe agents.\n\n## Bot\n\nA coding agent.\n\n- acts_for:: [[people#Alice]] {autonomy: ask-first}\n');
  const decision = (who: string) => `---\ntype: Decision\n---\n# Decisions\n\nChoices.\n\n## Retry three times\n\nRetry a failed charge three times.\n\n- decided_by:: [[${who}]] {role: driver}\n- proposed_by:: [[agents#Bot]]\n`;
  writeFileSync(join(dir, 'lat.md/decisions.md'), decision('agents#Bot'));
  const bad = await tg(dir, ['ontology', 'check']);
  expect(bad.code).toBe(1);
  expect(bad.out).toContain("'decided_by' ends at Member, not TeamAgent");
  writeFileSync(join(dir, 'lat.md/decisions.md'), decision('people#Alice'));
  expect((await tg(dir, ['ontology', 'check'])).code).toBe(0);
});

const OPENSPEC_SKILL = '---\nname: openspec-apply-change\n---\n\nImplement tasks from an OpenSpec change.\n';
const OPENSPEC_CMD = '---\nname: "OPSX: Apply"\n---\n\nImplement tasks.\n';

function withOpenspec(): string {
  const dir = project();
  mkdirSync(join(dir, '.claude/skills/openspec-apply-change'), { recursive: true });
  mkdirSync(join(dir, '.claude/skills/openspec-onboard'), { recursive: true });
  mkdirSync(join(dir, '.claude/commands/opsx'), { recursive: true });
  writeFileSync(join(dir, '.claude/skills/openspec-apply-change/SKILL.md'), OPENSPEC_SKILL);
  writeFileSync(join(dir, '.claude/skills/openspec-onboard/SKILL.md'), 'Onboard.\n');
  writeFileSync(join(dir, '.claude/commands/opsx/apply.md'), OPENSPEC_CMD);
  return dir;
}

// @tg: verifies:: [[tests/tg-agent#OpenSpec skill patching#Skills patched]] {since: "2026-10-08", level: unit}
// @lat: [[tests/tg-agent#OpenSpec skill patching#Skills patched]]
// @tg: verifies:: [[openspec:tg-agent-integration#OpenSpec skill patching#Skills patched]]
it('appends a tg block to OpenSpec apply skill and command and keeps their text', async () => {
  const dir = withOpenspec();
  await tg(dir, ['init', '--write']);
  for (const [rel, original] of [['.claude/skills/openspec-apply-change/SKILL.md', OPENSPEC_SKILL], ['.claude/commands/opsx/apply.md', OPENSPEC_CMD]] as const) {
    const text = read(dir, rel);
    expect(text.startsWith(original)).toBe(true);
    expect(text).toMatch(/<!-- tg:begin -->\n## Traceability with tg[\s\S]*@tg: implements::[\s\S]*@tg: verifies::[\s\S]*<!-- tg:end -->\n$/);
  }
  expect(read(dir, '.claude/skills/openspec-onboard/SKILL.md')).toBe('Onboard.\n');
});

// @tg: verifies:: [[tests/tg-agent#OpenSpec skill patching#Re-run is stable]] {since: "2026-10-08", level: unit}
// @lat: [[tests/tg-agent#OpenSpec skill patching#Re-run is stable]]
// @tg: verifies:: [[openspec:tg-agent-integration#OpenSpec skill patching#Re-run is stable]]
it('keeps exactly one block and reports nothing to change on a second run', async () => {
  const dir = withOpenspec();
  await tg(dir, ['init', '--write']);
  const again = await tg(dir, ['init', '--write']);
  expect(again.out).toContain('already set up');
  expect(read(dir, '.claude/skills/openspec-apply-change/SKILL.md').split('<!-- tg:begin -->')).toHaveLength(2);
});

// @tg: verifies:: [[tests/tg-agent#OpenSpec skill patching#Regenerated skill]] {since: "2026-10-08", level: unit}
// @lat: [[tests/tg-agent#OpenSpec skill patching#Regenerated skill]]
// @tg: verifies:: [[openspec:tg-agent-integration#OpenSpec skill patching#Regenerated skill]]
it('appends the block again after OpenSpec regenerates a skill', async () => {
  const dir = withOpenspec();
  await tg(dir, ['init', '--write']);
  writeFileSync(join(dir, '.claude/skills/openspec-apply-change/SKILL.md'), `${OPENSPEC_SKILL}\nNew upstream step.\n`);
  await tg(dir, ['init', '--write']);
  const text = read(dir, '.claude/skills/openspec-apply-change/SKILL.md');
  expect(text).toContain('New upstream step.');
  expect(text.split('<!-- tg:begin -->')).toHaveLength(2);
});

// @tg: verifies:: [[tests/tg-agent#OpenSpec skill patching#Opt out]] {since: "2026-10-08", level: unit}
// @lat: [[tests/tg-agent#OpenSpec skill patching#Opt out]]
// @tg: verifies:: [[openspec:tg-agent-integration#OpenSpec skill patching#Opt out]]
it('leaves OpenSpec files alone with --no-openspec', async () => {
  const dir = withOpenspec();
  await tg(dir, ['init', '--write', '--no-openspec']);
  expect(read(dir, '.claude/skills/openspec-apply-change/SKILL.md')).toBe(OPENSPEC_SKILL);
  expect(read(dir, '.claude/commands/opsx/apply.md')).toBe(OPENSPEC_CMD);
});

// @tg: verifies:: [[tests/tg-agent#OpenSpec skill patching#Skills only]] {since: "2026-10-08", level: unit}
// @lat: [[tests/tg-agent#OpenSpec skill patching#Skills only]]
// @tg: verifies:: [[openspec:tg-agent-integration#Skills-only init#Existing lat.md project]]
it('writes only skills and OpenSpec patches with --skills-only', async () => {
  const dir = withOpenspec();
  writeFileSync(join(dir, 'CLAUDE.md'), '%% lat:begin %%\nlat block\n%% lat:end %%\n');
  const r = await tg(dir, ['init', '--skills-only', '--write', '--json']);
  const paths = (JSON.parse(r.out) as { changes: { path: string }[] }).changes.map((c) => c.path);
  expect(paths.length).toBe(9);
  expect(paths.every((p) => p.startsWith('.claude/skills/') || p.startsWith('.claude/commands/'))).toBe(true);
  expect(read(dir, 'CLAUDE.md')).toBe('%% lat:begin %%\nlat block\n%% lat:end %%\n');
  expect(existsSync(join(dir, '.claude/settings.json'))).toBe(false);
  expect(existsSync(join(dir, 'lat.md/code-ontology.md'))).toBe(false);
});

// @tg: verifies:: [[tests/tg-agent#OpenSpec skill patching#Patch text printed]] {since: "2026-10-08", level: unit}
// @lat: [[tests/tg-agent#OpenSpec skill patching#Patch text printed]]
// @tg: verifies:: [[openspec:tg-agent-integration#Skill text available#Print a patch]]
it('prints skills and patch blocks with tg gen', async () => {
  const r = await tg(project(), ['gen', 'openspec-apply.md']);
  expect(r.code).toBe(0);
  expect(r.out).toContain('## Traceability with tg');
  expect((await tg(project(), ['gen', 'impact-skill.md'])).out).toContain('name: tg-impact');
});

// @tg: verifies:: [[tests/tg-agent#Code ontology#Ontology installed]] {since: "2026-10-06", level: unit}
// @lat: [[tests/tg-agent#Code ontology#Ontology installed]]
// @tg: verifies:: [[openspec:tg-agent-integration#Code ontology install#Types and templates]]
it('installs the ontology note, schema in Types/ and templates, and the project still checks clean', async () => {
  const dir = project();
  await tg(dir, ['init', '--write']);
  expect(read(dir, 'lat.md/code-ontology.md')).toContain('# Code Ontology');
  expect(read(dir, 'Types/code-types.md')).toContain('edgeTypes:');
  expect(read(dir, 'Types/code-types.md')).toContain('template: "[[Templates/Decision]]"');
  for (const t of ['Decision', 'Requirement', 'Scenario', 'Constraint', 'Concept', 'Change']) expect(read(dir, `Templates/${t}.md`)).toContain('# {{title}}');
  expect(existsSync(join(dir, 'ontology'))).toBe(false);
  expect(read(dir, 'lat.md/lat.md')).toContain('[[code-ontology]]');
  const checked = await tg(dir, ['check']);
  expect(checked.err + checked.out).not.toContain('broken');
  expect(checked.code).toBe(0);
  const exported = await tg(dir, ['schema', 'export', 'shapes.ttl', '--json']);
  const report = JSON.parse(exported.out) as { types: number; edgeTypes: number; diagnostics: unknown[] };
  // Ten edge types of the code ontology and three of the shared core it uses.
  expect(report).toMatchObject({ types: 6, edgeTypes: 13, diagnostics: [] });
});

// @tg: verifies:: [[tests/tg-agent#Code ontology#Ontology kept on re-run]] {since: "2026-10-06", level: unit}
// @lat: [[tests/tg-agent#Code ontology#Ontology kept on re-run]]
it('does not overwrite an edited ontology note on a later init', async () => {
  const dir = project();
  await tg(dir, ['init', '--write']);
  writeFileSync(join(dir, 'lat.md/code-ontology.md'), '# Ours\n\nOur own words.\n');
  const again = await tg(dir, ['init', '--write']);
  expect(again.out).toContain('already set up');
  expect(read(dir, 'lat.md/code-ontology.md')).toBe('# Ours\n\nOur own words.\n');
});

// @tg: verifies:: [[tests/tg-agent#Code ontology#Ontology opt-out]] {since: "2026-10-06", level: unit}
// @lat: [[tests/tg-agent#Code ontology#Ontology opt-out]]
it('leaves the ontology out with --no-ontology', async () => {
  const dir = project();
  await tg(dir, ['init', '--write', '--no-ontology']);
  expect(existsSync(join(dir, 'lat.md/code-ontology.md'))).toBe(false);
  expect(existsSync(join(dir, 'Types'))).toBe(false);
  expect(existsSync(join(dir, 'Templates'))).toBe(false);
});
