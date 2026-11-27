import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { expect, it } from 'vitest';
import { run, type Io } from '../src/cli.mjs';
import '../src/commands/index.mjs';
import { OPENSPEC_PATCHES, SKILLS, SPEC_TEMPLATES, STAGE_PATCHES, TEMPLATES } from '../src/commands/gen.mjs';
import { asksForLatCheck, forIntegrations } from '../src/integrations.mjs';
import { renderConditions } from '../src/template-conditions.mjs';

const OPENSPEC_SKILL = '---\nname: openspec-apply-change\n---\n\nImplement the tasks.\n';
const OPENSPEC_CONFIG = 'schema: spec-driven\n';

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tg-integrations-'));
  const files: Record<string, string> = {
    'lat.md/lat.md': '# Lat\n\nIndex.\n',
    '.claude/skills/openspec-apply-change/SKILL.md': OPENSPEC_SKILL,
    'openspec/config.yaml': OPENSPEC_CONFIG,
    'openspec/specs/.gitkeep': '',
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

/** Run tg; with `toggle`, as a person at a terminal who flips those checklist items. */
async function tg(cwd: string, args: string[], o: { toggle?: string[]; stdin?: string } = {}) {
  let out = '';
  const shown: Record<string, { id: string; checked: boolean }[]> = {};
  const io: Io = { cwd, out: (t) => (out += t), err: (t) => (out += t), env: {}, stdin: () => o.stdin ?? '' };
  if (o.toggle) {
    io.choose = async (title, items) => {
      shown[title] = items.map(({ id, checked }) => ({ id, checked }));
      return items.filter((i) => i.checked !== o.toggle!.includes(i.id)).map((i) => i.id);
    };
    io.select = async (_, items) => items.find((i) => i.id === 'none' || i.id === 'skip')?.id ?? items[0]!.id;
    io.ask = async () => '';
  }
  const code = await run(args, io);
  return { code, out, shown };
}

/** Every file below `dir`, relative to it. */
function files(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((n) => {
    const full = join(dir, n);
    return statSync(full).isDirectory() ? files(full, base) : [relative(base, full)];
  });
}

const generated = (dir: string) => files(dir).filter((f) => !f.startsWith('lat.md/') && !f.startsWith('Types/') && !f.startsWith('Templates/'));
const asking = (dir: string) => generated(dir).filter((f) => asksForLatCheck(readFileSync(join(dir, f), 'utf8')));
const read = (dir: string, rel: string) => readFileSync(join(dir, rel), 'utf8');

// @tg: verifies:: [[tests/tg-agent#Integrations#No integration by default]] {since: "2026-11-27", level: unit}
// @lat: [[tests/tg-agent#Integrations#No integration by default]]
// @tg: verifies:: [[openspec:tg-agent-integration#Integrations#No integration by default]]
it('leaves `lat check` out of every generated file by default and asks for it with --integrations lat', async () => {
  const off = project();
  expect((await tg(off, ['init', '--agent', 'claude', '--yes', '--no-update-check'])).code).toBe(0);
  expect(asking(off)).toEqual([]);
  expect(read(off, 'CLAUDE.md')).toContain('until all three pass.');
  expect(read(off, 'openspec/config.yaml')).toContain('End with a task to run `tg check`, `tg ontology check` and');

  const on = project();
  expect((await tg(on, ['init', '--agent', 'claude', '--yes', '--no-update-check', '--integrations', 'lat'])).code).toBe(0);
  const claude = read(on, 'CLAUDE.md');
  expect(claude).toContain('- [ ] Run `lat check`');
  expect(claude).toContain('until all four pass.');
  expect(asking(on)).toEqual(expect.arrayContaining(['CLAUDE.md', '.claude/skills/tg-docs/SKILL.md', '.claude/skills/openspec-apply-change/SKILL.md', 'openspec/config.yaml']));

  // A re-run keeps the project's choice; --integrations none takes it out again, and an unknown name is an error.
  await tg(on, ['init', '--agent', 'claude', '--yes', '--no-update-check']);
  expect(read(on, 'CLAUDE.md')).toBe(claude);
  await tg(on, ['init', '--agent', 'claude', '--yes', '--no-update-check', '--integrations', 'none']);
  expect(asking(on)).toEqual([]);
  const bad = await tg(on, ['init', '--agent', 'claude', '--yes', '--no-update-check', '--integrations', 'nope']);
  expect(bad.code).toBe(2);
  expect(bad.out).toContain('unknown integration "nope"');
});

// @tg: verifies:: [[tests/tg-agent#Integrations#No integration by default]] {since: "2026-11-27", level: unit}
// @lat: [[tests/tg-agent#Integrations#No integration by default]]
// @tg: verifies:: [[openspec:tg-agent-integration#Integrations#No integration by default]]
it('renders the `lat check` sections of every bundled template on or off and keeps the rest of the text', () => {
  const all = [...Object.values(TEMPLATES), ...Object.values(SKILLS), ...Object.values(OPENSPEC_PATCHES), ...Object.values(STAGE_PATCHES), ...Object.values(SPEC_TEMPLATES)];
  for (const text of all) {
    const off = forIntegrations(text, []);
    expect(off).not.toMatch(/\{\{(if:|else|end)/);
    expect(asksForLatCheck(off)).toBe(false);
    expect(forIntegrations(text, ['lat'])).not.toMatch(/\{\{(if:|else|end)/);
  }
  expect(forIntegrations(SKILLS['tg-docs']!, [])).toContain('`tg check` (links, structure) and `tg ontology check` (edge names, endpoints, properties) until both pass.');
  expect(forIntegrations(SKILLS['tg-docs']!, ['lat'])).toContain('`tg check` (links, structure), `lat check` (lat.md\'s own validator) and `tg ontology check` (edge names, endpoints, properties) until all three pass.');
  expect(forIntegrations(TEMPLATES.agents, [])).toContain('until all three pass.');
  expect(forIntegrations(TEMPLATES.agents, ['lat'])).toContain('- [ ] Run `lat check`');
  expect(forIntegrations(SKILLS['tg-migrate']!, [])).toContain('for teams that still run `lat check`');
});

// @tg: verifies:: [[tests/tg-agent#Integrations#Conditional sections]] {since: "2026-11-27", level: unit}
// @lat: [[tests/tg-agent#Integrations#Conditional sections]]
// @tg: verifies:: [[openspec:tg-agent-integration#Integrations#Conditional sections]]
it('keeps or drops {{if:...}} sections, picks the {{else}} text and removes marker-only lines', () => {
  const on = { 'lat-integration': true };
  const off = { 'lat-integration': false };
  const text = 'a{{if:lat-integration}}, b{{end}} and c until {{if:lat-integration}}all three{{else}}both{{end}} pass.\n{{if:lat-integration}}\nlat check\n{{end}}\ntg trace\n';
  expect(renderConditions(text, on)).toBe('a, b and c until all three pass.\nlat check\ntg trace\n');
  expect(renderConditions(text, off)).toBe('a and c until both pass.\ntg trace\n');
  expect(() => renderConditions('{{if:nope}}x{{end}}', on)).toThrow(/unknown template condition "nope"/);
  expect(() => renderConditions('{{if:lat-integration}}x', on)).toThrow(/unbalanced/);
  expect(() => renderConditions('{{if:lat-integration}}a{{if:lat-integration}}b{{end}}c{{end}}', on)).toThrow(/do not nest/);
});

// @tg: verifies:: [[tests/tg-agent#Integrations#Integrations checklist]] {since: "2026-11-27", level: unit}
// @lat: [[tests/tg-agent#Integrations#Integrations checklist]]
// @tg: verifies:: [[openspec:tg-agent-integration#Integrations#Integrations checklist]]
it('offers the integrations as a checklist with none ticked, and ticking lat adds `lat check`', async () => {
  const dir = project();
  const off = await tg(dir, ['init', '--agent', 'claude', '--no-update-check'], { toggle: [] });
  expect(off.code).toBe(0);
  expect(off.shown['Integrations to use']).toEqual([{ id: 'lat', checked: false }]);
  expect(off.shown['What to set up or update']!.map((i) => i.id)).not.toContain('lat');
  expect(read(dir, 'CLAUDE.md')).toContain('%% tg:begin %%');
  expect(asking(dir)).toEqual([]);

  const on = await tg(dir, ['init', '--agent', 'claude', '--no-update-check'], { toggle: ['lat'] });
  expect(on.code).toBe(0);
  expect(read(dir, 'CLAUDE.md')).toContain('- [ ] Run `lat check`');
  // Once the project asks for it, the checklist offers it ticked.
  const again = await tg(dir, ['init', '--agent', 'claude', '--no-update-check'], { toggle: [] });
  expect(again.shown['Integrations to use']).toEqual([{ id: 'lat', checked: true }]);
});

// @tg: verifies:: [[tests/tg-agent#Integrations#Choice kept]] {since: "2026-11-27", level: unit}
// @lat: [[tests/tg-agent#Integrations#Choice kept]]
// @tg: verifies:: [[openspec:tg-agent-integration#Integrations#Choice kept]]
it('keeps the choice in tg upgrade and the hooks', async () => {
  const off = project();
  await tg(off, ['init', '--agent', 'claude', '--yes', '--no-update-check']);
  writeFileSync(join(off, 'lat.md', 'lat.md'), '# Lat\n\nIndex; see [[missing]].\n');
  expect((await tg(off, ['upgrade', '--yes', '--no-update-check'])).code).toBe(0);
  expect(asking(off)).toEqual([]);
  const stopOff = await tg(off, ['hook', 'claude', 'Stop'], { stdin: '{}' });
  expect(stopOff.out).toContain('tg check');
  expect(stopOff.out).not.toContain('lat check');
  expect((await tg(off, ['hook', 'claude', 'UserPromptSubmit'], { stdin: '{"prompt":"x"}' })).out).not.toContain('lat check');

  const on = project();
  await tg(on, ['init', '--agent', 'claude', '--yes', '--no-update-check', '--integrations', 'lat']);
  expect((await tg(on, ['upgrade', '--yes', '--no-update-check'])).code).toBe(0);
  expect(asking(on)).toContain('CLAUDE.md');
  writeFileSync(join(on, 'lat.md', 'lat.md'), '# Lat\n\nIndex; see [[missing]].\n');
  expect((await tg(on, ['hook', 'claude', 'Stop'], { stdin: '{}' })).out).toContain('lat check');
  expect((await tg(on, ['hook', 'claude', 'UserPromptSubmit'], { stdin: '{"prompt":"x"}' })).out).toContain('lat check');
});
