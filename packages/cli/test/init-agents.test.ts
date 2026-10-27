import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { run, type Io } from '../src/cli.mjs';
import '../src/commands/index.mjs';
import { withOpenspecRules } from '../src/commands/openspec-config.mjs';

function project(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'tg-init-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

interface Script {
  /** Ids to leave ticked, per checklist title; absent keeps the defaults. */
  pick?: Record<string, string[]>;
  answers?: string[];
  /** Id to pick, per single-choice title; absent picks the first. */
  picked?: Record<string, string>;
}

/** Run tg; with a script, as a person at a terminal who ticks and answers as scripted. */
async function tg(cwd: string, args: string[], script?: Script) {
  let out = '';
  const shown: Record<string, { id: string; checked: boolean }[]> = {};
  const io: Io = { cwd, out: (t) => (out += t), err: (t) => (out += t), env: {}, stdin: () => '' };
  if (script) {
    const answers = [...(script.answers ?? [])];
    io.choose = async (title, items) => {
      shown[title] = items.map(({ id, checked }) => ({ id, checked }));
      return script.pick?.[title] ?? items.filter((i) => i.checked).map((i) => i.id);
    };
    io.ask = async () => answers.shift() ?? '';
    io.select = async (title, items) => {
      shown[title] = items.map(({ id }) => ({ id, checked: false }));
      return script.picked?.[title] ?? items[0]!.id;
    };
  }
  const code = await run(args, io);
  return { code, out, shown };
}

const planned = (out: string) => (JSON.parse(out) as { changes: { path: string }[] }).changes.map((c) => c.path);
const SKILL_NAMES = ['tg-docs', 'tg-graph', 'tg-trace', 'tg-impact', 'tg-audit'];

// @tg: verifies:: [[tests/tg-agent#Agent selection#Several agents]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#Agent selection#Several agents]]
// @tg: verifies:: [[openspec:tg-agent-integration#Agent selection#Several agents]]
it('sets up every agent in a comma-separated --agent list', async () => {
  const dir = project();
  const r = await tg(dir, ['init', '--agent', 'claude,codex', '--write']);
  expect(r.code).toBe(0);
  expect(read(dir, 'CLAUDE.md')).toContain('%% tg:begin %%');
  expect(read(dir, 'AGENTS.md')).toContain('%% tg:begin %%');
  for (const n of SKILL_NAMES) {
    expect(existsSync(join(dir, `.claude/skills/${n}/SKILL.md`))).toBe(true);
    expect(existsSync(join(dir, `.agents/skills/${n}/SKILL.md`))).toBe(true);
  }
});

// @tg: verifies:: [[tests/tg-agent#Agent selection#Checklist in a terminal]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#Agent selection#Checklist in a terminal]]
// @tg: verifies:: [[openspec:tg-agent-integration#Agent selection#Checklist in a terminal]]
it('shows a checklist with detected agents ticked and sets up the ones left ticked', async () => {
  const dir = project({ '.cursor/rules/other.mdc': 'x' });
  const r = await tg(dir, ['init'], { pick: { 'Coding agents to set up': ['cursor', 'opencode'] } });
  expect(r.shown['Coding agents to set up']!.filter((i) => i.checked).map((i) => i.id)).toEqual(['cursor']);
  expect(existsSync(join(dir, '.cursor/rules/tg.mdc'))).toBe(true);
  expect(existsSync(join(dir, '.opencode/skills/tg-docs/SKILL.md'))).toBe(true);
  expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false);
});

// @tg: verifies:: [[tests/tg-agent#Agent selection#No terminal]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#Agent selection#No terminal]]
// @tg: verifies:: [[openspec:tg-agent-integration#Agent selection#No terminal]]
it('asks nothing without a terminal and defaults to Claude Code', async () => {
  const dir = project();
  const r = await tg(dir, ['init', '--json', '--dry-run'], { pick: { 'Coding agents to set up': ['codex'] } });
  expect(r.shown).toEqual({});
  expect(JSON.parse(r.out)).toMatchObject({ agents: ['claude'], write: false });
  expect(planned(r.out)).toContain('CLAUDE.md');
});

// @tg: verifies:: [[tests/tg-agent#Agent selection#Unknown agent]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#Agent selection#Unknown agent]]
// @tg: verifies:: [[openspec:tg-agent-integration#Agent selection#Unknown agent]]
it('rejects an unknown agent and writes nothing', async () => {
  const dir = project();
  const r = await tg(dir, ['init', '--agent', 'vim', '--write']);
  expect(r.code).toBe(2);
  expect(r.out).toContain('expected one or more of claude, codex, cursor, github-copilot, opencode, kilocode, pi, oh-my-pi, agents');
  expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false);
});

// @tg: verifies:: [[tests/tg-agent#Agent selection#Detected from OpenSpec]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#Agent selection#Detected from OpenSpec]]
// @tg: verifies:: [[openspec:tg-agent-integration#Agent detection#OpenSpec set up Codex]]
it('detects agents from the skill folders OpenSpec created', async () => {
  const dir = project({ '.agents/skills/openspec-propose/SKILL.md': '# propose\n' });
  const r = await tg(dir, ['init', '--json']);
  expect(JSON.parse(r.out).agents).toEqual(['codex', 'agents']);
  const paths = planned(r.out);
  expect(paths).toContain('.agents/skills/tg-trace/SKILL.md');
  expect(paths).toContain('.agents/skills/openspec-propose/SKILL.md');
  // Codex and generic agents share one skills folder and one AGENTS.md.
  expect(paths.filter((p) => p === '.agents/skills/tg-trace/SKILL.md')).toHaveLength(1);
  expect(paths.filter((p) => p === 'AGENTS.md')).toHaveLength(1);
});

// @tg: verifies:: [[tests/tg-agent#Agent selection#Codex skills]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#Agent selection#Codex skills]]
// @tg: verifies:: [[openspec:tg-agent-integration#Skills per agent#Codex skills]]
it('installs skills for Codex under .agents/skills with an AGENTS.md block', async () => {
  const dir = project();
  await tg(dir, ['init', '--agent', 'codex', '--write']);
  for (const n of SKILL_NAMES) expect(existsSync(join(dir, `.agents/skills/${n}/SKILL.md`))).toBe(true);
  expect(read(dir, 'AGENTS.md')).toContain('%% tg:begin %%');
  expect(existsSync(join(dir, '.claude'))).toBe(false);
});

// @tg: verifies:: [[tests/tg-agent#OpenSpec skill patching#Other agent's skill]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#OpenSpec skill patching#Other agent's skill]]
// @tg: verifies:: [[openspec:tg-agent-integration#OpenSpec skill patching#Other agent's OpenSpec skill]]
it("patches OpenSpec skills in another agent's skills folder", async () => {
  const dir = project({ '.cursor/skills/openspec-apply-change/SKILL.md': '# Apply\n' });
  await tg(dir, ['init', '--agent', 'cursor', '--write']);
  const text = read(dir, '.cursor/skills/openspec-apply-change/SKILL.md');
  expect(text.startsWith('# Apply\n')).toBe(true);
  expect(text).toContain('<!-- tg:begin -->');
  expect(text).toContain('implements');
});

// @tg: verifies:: [[tests/tg-agent#Setup parts#Only the OpenSpec config]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#Setup parts#Only the OpenSpec config]]
// @tg: verifies:: [[openspec:tg-agent-integration#Setup parts#Only the OpenSpec config]]
it('updates only OpenSpec files with --only openspec', async () => {
  const dir = project({ 'openspec/config.yaml': 'schema: spec-driven\n' });
  const r = await tg(dir, ['init', '--only', 'openspec', '--write', '--json']);
  expect(planned(r.out)).toEqual(['openspec/config.yaml']);
  expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false);
  expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false);
});

// @tg: verifies:: [[tests/tg-agent#Setup parts#Skip instructions]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#Setup parts#Skip instructions]]
// @tg: verifies:: [[openspec:tg-agent-integration#Setup parts#Skip instructions]]
it('skips instruction files with --skip instructions', async () => {
  const dir = project();
  const r = await tg(dir, ['init', '--skip', 'instructions', '--write']);
  expect(r.code).toBe(0);
  expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false);
  expect(existsSync(join(dir, '.claude/skills/tg-docs/SKILL.md'))).toBe(true);
  expect((await tg(dir, ['init', '--skip', 'nope'])).code).toBe(2);
});

// @tg: verifies:: [[tests/tg-agent#Setup parts#Parts checklist]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#Setup parts#Parts checklist]]
// @tg: verifies:: [[openspec:tg-agent-integration#Setup parts#Parts checklist]]
it('offers the parts as a checklist with every part ticked', async () => {
  const dir = project();
  const r = await tg(dir, ['init'], { pick: { 'What to set up or update': ['skills'] }, answers: [''] });
  const shown = r.shown['What to set up or update']!;
  expect(shown.map((i) => i.id)).toEqual(['instructions', 'hooks', 'skills', 'specs', 'ontology']);
  expect(shown.every((i) => i.checked)).toBe(true);
  expect(existsSync(join(dir, '.claude/skills/tg-docs/SKILL.md'))).toBe(true);
  expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false);
  expect(existsSync(join(dir, 'lat.md'))).toBe(false);
});

// @tg: verifies:: [[tests/tg-agent#Interactive setup#Confirmed]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#Interactive setup#Confirmed]]
// @tg: verifies:: [[openspec:tg-agent-integration#Interactive setup#Confirmed]]
it('writes and lists the files after the checklists, asking no further question', async () => {
  const dir = project();
  const r = await tg(dir, ['init'], { answers: ['n'] });
  expect(r.out).toContain('+ created\x1b[0m CLAUDE.md');
  expect(r.out).toContain('Wrote ');
  expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(true);
});

// @tg: verifies:: [[tests/tg-agent#Interactive setup#Dry run in a terminal]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#Interactive setup#Dry run in a terminal]]
// @tg: verifies:: [[openspec:tg-agent-integration#Interactive setup#Dry run in a terminal]]
it('prints the diff after the checklists with --dry-run', async () => {
  const dir = project();
  const r = await tg(dir, ['init', '--dry-run'], {});
  expect(Object.keys(r.shown)).toContain('Coding agents to set up');
  expect(r.out).toContain('+++ b/CLAUDE.md');
  expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false);
});

// @tg: verifies:: [[tests/tg-agent#Interactive setup#Declined]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#Interactive setup#Declined]]
// @tg: verifies:: [[openspec:tg-agent-integration#Interactive setup#Declined]]
it('writes nothing when every agent is unticked, and never asks with --yes', async () => {
  const dir = project();
  const r = await tg(dir, ['init'], { pick: { 'Coding agents to set up': [] } });
  expect(r.out).toContain('Nothing selected');
  expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false);
  const yes = await tg(dir, ['init', '--yes'], { pick: { 'Coding agents to set up': [] } });
  expect(yes.shown).toEqual({});
  expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(true);
});

// @tg: verifies:: [[tests/tg-agent#Agent selection#Pi detected]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#Agent selection#Pi detected]]
// @tg: verifies:: [[openspec:tg-agent-integration#Agent detection#Pi detected]]
it('detects Pi from its folder', async () => {
  const dir = project({ '.pi/settings.json': '{}' });
  const r = await tg(dir, ['init', '--json', '--dry-run']);
  expect(JSON.parse(r.out).agents).toEqual(['pi']);
  expect(planned(r.out)).toContain('.pi/skills/tg-docs/SKILL.md');
});

// @tg: verifies:: [[tests/tg-agent#Agent selection#Kilo Code and Oh My Pi skills]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#Agent selection#Kilo Code and Oh My Pi skills]]
// @tg: verifies:: [[openspec:tg-agent-integration#Skills per agent#Kilo Code and Oh My Pi skills]]
it('installs skills for Kilo Code and Oh My Pi with an AGENTS.md block', async () => {
  const dir = project();
  await tg(dir, ['init', '--agent', 'kilocode,oh-my-pi']);
  for (const n of SKILL_NAMES) {
    expect(existsSync(join(dir, `.kilocode/skills/${n}/SKILL.md`))).toBe(true);
    expect(existsSync(join(dir, `.omp/skills/${n}/SKILL.md`))).toBe(true);
  }
  expect(read(dir, 'AGENTS.md')).toContain('%% tg:begin %%');
});

// @tg: verifies:: [[tests/tg-agent#OpenSpec config rules#Rules added]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#OpenSpec config rules#Rules added]]
// @tg: verifies:: [[openspec:tg-agent-integration#OpenSpec config rules#Rules added]]
it('adds tg rules to openspec/config.yaml and keeps the project rules and comments', async () => {
  const config = 'schema: spec-driven\n\n# Our conventions\nrules:\n  tasks:\n    - Keep tasks under two hours\n';
  const dir = project({ 'openspec/config.yaml': config });
  await tg(dir, ['init', '--write']);
  const text = read(dir, 'openspec/config.yaml');
  expect(text).toContain('schema: spec-driven');
  expect(text).toContain('# Our conventions');
  expect(text).toContain('- Keep tasks under two hours');
  for (const artifact of ['proposal:', 'specs:', 'design:', 'tasks:']) expect(text).toContain(artifact);
  expect(text).toContain('tg: For each requirement, include a task to annotate the code that implements it');
  expect(text).toContain('`openspec:` frontmatter');
  expect(text.indexOf('Keep tasks under two hours')).toBeLessThan(text.indexOf('tg: For each requirement'));
  // The rule examples must not read as real annotations when tg check scans the config.
  const checked = await tg(dir, ['check']);
  expect(checked.out).toContain('All checks passed');
  expect(checked.code).toBe(0);
});

// @tg: verifies:: [[tests/tg-agent#OpenSpec config rules#Rules re-run is stable]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#OpenSpec config rules#Rules re-run is stable]]
// @tg: verifies:: [[openspec:tg-agent-integration#OpenSpec config rules#Re-run is stable]]
it('leaves openspec/config.yaml unchanged on a second run and replaces stale tg rules', async () => {
  const dir = project({ 'openspec/config.yaml': 'schema: spec-driven\n' });
  await tg(dir, ['init', '--write']);
  const first = read(dir, 'openspec/config.yaml');
  const again = await tg(dir, ['init', '--write', '--json']);
  expect(planned(again.out)).not.toContain('openspec/config.yaml');
  expect(read(dir, 'openspec/config.yaml')).toBe(first);
  const stale = first.replace('tg: Give every requirement', 'tg: An older wording of the rule');
  const refreshed = withOpenspecRules(stale)!;
  expect(refreshed).not.toContain('older wording');
  expect(refreshed).toBe(first);
});

// @tg: verifies:: [[tests/tg-agent#OpenSpec config rules#No OpenSpec]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#OpenSpec config rules#No OpenSpec]]
// @tg: verifies:: [[openspec:tg-agent-integration#OpenSpec config rules#No OpenSpec]]
it('creates no openspec files in a project without OpenSpec', async () => {
  const dir = project();
  await tg(dir, ['init', '--write']);
  expect(existsSync(join(dir, 'openspec'))).toBe(false);
});

// @tg: verifies:: [[tests/tg-agent#Code ontology#Old ontology folder noted]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-agent#Code ontology#Old ontology folder noted]]
it('notes an ontology/code-types.md left by an older tg init', async () => {
  const dir = project({ 'ontology/code-types.md': '---\nschemas: {}\n---\n' });
  const r = await tg(dir, ['init', '--json']);
  expect(JSON.parse(r.out).notes.join(' ')).toContain('ontology/code-types.md is from an older tg init');
  expect(planned(r.out)).not.toContain('ontology/code-types.md');
});

function read(dir: string, rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}
