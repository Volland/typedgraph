import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isScalar, parseDocument, visit } from 'yaml';
import { run, type Io } from '../src/cli.mjs';
import '../src/commands/index.mjs';
import { enrichOntology } from '../src/commands/upgrade.mjs';
import { isNewer } from '../src/update.mjs';

/** The bundled ontology as an older tg wrote it: TGS 0.1, with no descriptions, elements or sections. */
function olderOntology(): string {
  const text = readFileSync(join(__dirname, '../templates/ontology/code-types.md'), 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text)!;
  const doc = parseDocument(m[1]!);
  visit(doc, {
    Pair: (_, p) => (isScalar(p.key) && ['description', 'elements', 'sections'].includes(String(p.key.value)) ? visit.REMOVE : undefined),
  });
  doc.set('tgs', '0.1');
  return `---\n${doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd()}\n---\n${text.slice(m[0].length)}`;
}

function project(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'tg-upgrade-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

interface Opts {
  latest?: string | null;
  version?: string;
  pick?: 'update' | 'continue';
  terminal?: boolean;
  env?: Record<string, string>;
}

/** Run tg with a fake registry, version and installer; never touches the network or runs a program. */
async function tg(cwd: string, args: string[], o: Opts = {}) {
  let out = '';
  const execs: string[][] = [];
  const asked: string[] = [];
  let looked = 0;
  const terminal = o.terminal ?? true;
  const io: Io = {
    cwd,
    out: (t) => (out += t),
    err: (t) => (out += t),
    env: o.env ?? {},
    stdin: () => '',
    version: o.version ?? '0.25.0',
    latestVersion: async () => {
      looked++;
      return o.latest === undefined ? '0.25.0' : o.latest;
    },
    exec: async (argv) => {
      execs.push(argv);
      return argv[0] === 'tg' || argv[0] === 'npx' ? 7 : 0;
    },
    ...(terminal
      ? {
          choose: async (_title: string, items: { id: string; checked: boolean }[]) => items.filter((i) => i.checked).map((i) => i.id),
          select: async (title: string, items: { id: string }[]) => {
            asked.push(title);
            if (title.startsWith('tg ')) return o.pick ?? 'continue';
            return items.find((i) => i.id === 'skip' || i.id === 'apply')?.id ?? items[0]!.id;
          },
        }
      : {}),
  };
  const code = await run(args, io);
  return { code, out, execs, asked, looked };
}

describe('update check', () => {
  // @lat: [[tests/tg-upgrade#Update check#Newer versions only]]
  it('compares release versions only', () => {
    expect(isNewer('0.26.0', '0.25.0')).toBe(true);
    expect(isNewer('1.0.0', '0.99.9')).toBe(true);
    expect(isNewer('0.25.0', '0.25.0')).toBe(false);
    expect(isNewer('0.24.9', '0.25.0')).toBe(false);
    expect(isNewer('0.26.0-beta.1', '0.25.0')).toBe(false);
    expect(isNewer('0.26.0', 'dev')).toBe(false);
  });

  // @lat: [[tests/tg-upgrade#Update check#Continue with the running version]]
  // @tg: verifies:: [[openspec:tg-upgrade#Install with consent#Continue]] {level: integration}
  it('asks in a terminal and continues with the running version when told to', async () => {
    const dir = project();
    const r = await tg(dir, ['init'], { latest: '0.26.0', pick: 'continue' });
    expect(r.asked[0]).toContain('tg 0.26.0 is available; this is 0.25.0');
    expect(r.execs).toEqual([]);
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(true);
  });

  // @lat: [[tests/tg-upgrade#Update check#Install and run again]]
  // @tg: verifies:: [[openspec:tg-upgrade#Install with consent#Install and run again]] {level: integration}
  it('installs the newer version and runs the same command again with it', async () => {
    const dir = project();
    const r = await tg(dir, ['init', '--agent', 'claude'], { latest: '0.26.0', pick: 'update' });
    expect(r.execs.map((a) => a.join(' '))).toEqual([`${process.platform === 'win32' ? 'npm.cmd' : 'npm'} install -g @typedgraph/cli@0.26.0`, 'tg init --agent claude --no-update-check']);
    // The new version's exit code is the result, and this version writes nothing.
    expect(r.code).toBe(7);
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false);
  });

  // @lat: [[tests/tg-upgrade#Update check#Under npx]]
  it('runs the newer version through npx when tg was started by npx', async () => {
    const dir = project();
    const r = await tg(dir, ['upgrade'], { latest: '0.26.0', pick: 'update', env: { npm_command: 'exec' } });
    expect(r.execs).toEqual([['npx', '-y', '@typedgraph/cli@0.26.0', 'upgrade', '--no-update-check']]);
  });

  // @lat: [[tests/tg-upgrade#Update check#No check for scripts]]
  // @tg: verifies:: [[openspec:tg-upgrade#Update check#Scripts never wait]] {level: integration}
  it('never looks outside a terminal, with --yes, --no-update-check, in CI or when opted out', async () => {
    expect((await tg(project(), ['init'], { latest: '0.26.0', terminal: false })).looked).toBe(0);
    expect((await tg(project(), ['init', '--yes'], { latest: '0.26.0' })).looked).toBe(0);
    expect((await tg(project(), ['init', '--no-update-check'], { latest: '0.26.0' })).looked).toBe(0);
    expect((await tg(project(), ['init'], { latest: '0.26.0', env: { CI: 'true' } })).looked).toBe(0);
    expect((await tg(project(), ['init'], { latest: '0.26.0', env: { TG_NO_UPDATE_CHECK: '1' } })).looked).toBe(0);
    expect((await tg(project(), ['init'], { latest: '0.26.0', version: 'dev' })).looked).toBe(0);
  });

  // @lat: [[tests/tg-upgrade#Update check#Up to date or offline]]
  // @tg: verifies:: [[openspec:tg-upgrade#Update check#Nothing newer]] {level: integration}
  it('asks nothing when the running version is the newest or the registry does not answer', async () => {
    for (const latest of ['0.25.0', null]) {
      const r = await tg(project(), ['init'], { latest });
      expect(r.looked).toBe(1);
      expect(r.asked.some((t) => t.startsWith('tg '))).toBe(false);
    }
  });
});

describe('tg upgrade', () => {
  /** A project set up by `tg init`, then aged: the ontology and one skill from the last commit, one skill deleted. */
  async function aged(): Promise<string> {
    const dir = project();
    await tg(dir, ['init', '--yes', '--spec', 'adr']);
    writeFileSync(join(dir, 'Types/code-types.md'), olderOntology());
    writeFileSync(join(dir, '.claude/skills/tg-docs/SKILL.md'), '---\nname: tg-docs\n---\nOld text.\n');
    rmSync(join(dir, '.claude/skills/tg-graph'), { recursive: true });
    return dir;
  }

  // @lat: [[tests/tg-upgrade#Upgrade#Refreshes what was set up]]
  // @tg: verifies:: [[openspec:tg-upgrade#Project refresh#Refreshed files listed]] {level: integration}
  it('lists and refreshes the skills, instructions and ontology an earlier init set up, and is stable', async () => {
    const dir = await aged();
    const r = await tg(dir, ['upgrade', '--yes']);
    expect(r.out).toContain('~ updated .claude/skills/tg-docs/SKILL.md');
    expect(r.out).toContain('+ new     .claude/skills/tg-graph/SKILL.md');
    expect(r.out).toContain('~ updated Types/code-types.md');
    expect(readFileSync(join(dir, '.claude/skills/tg-docs/SKILL.md'), 'utf8')).toContain('Parts inside a section: elements');
    expect(readFileSync(join(dir, 'Types/code-types.md'), 'utf8')).toMatch(/^tgs: "?0\.4"?$/m);
    // Nothing the project never chose appears.
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false);
    const again = await tg(dir, ['upgrade', '--yes']);
    expect(again.out).toContain('is up to date with tg 0.25.0; nothing to change');
    expect((await tg(dir, ['ontology', 'check'])).code).toBe(0);
  });

  // @lat: [[tests/tg-upgrade#Upgrade#Dry run and confirmation]]
  // @tg: verifies:: [[openspec:tg-upgrade#Upgrade command#Asked before writing]] {level: integration}
  it('prints the diff in a dry run and asks before writing in a terminal', async () => {
    const dir = await aged();
    const before = readFileSync(join(dir, 'Types/code-types.md'), 'utf8');
    const dry = await tg(dir, ['upgrade', '--dry-run']);
    expect(dry.out).toContain('Dry run: 3 files would change.');
    expect(readFileSync(join(dir, 'Types/code-types.md'), 'utf8')).toBe(before);
    const asked = await tg(dir, ['upgrade']);
    expect(asked.asked).toContain('Apply these changes?');
    expect(readFileSync(join(dir, 'Types/code-types.md'), 'utf8')).not.toBe(before);
  });

  // @lat: [[tests/tg-upgrade#Upgrade#No setup]]
  it('says so when the project has no tg setup', async () => {
    const r = await tg(project({ 'README.md': '# Hi\n' }), ['upgrade', '--yes']);
    expect(r.out).toContain('has no tg setup to upgrade; run tg init');
  });

  // @lat: [[tests/tg-upgrade#Upgrade#Ontology edits kept]]
  // @tg: verifies:: [[openspec:tg-upgrade#Ontology enrichment#Edits kept]] {level: unit}
  it('adds only what is missing to the project ontology and keeps its edits', () => {
    const mine = '---\ntgs: "0.1"\nschemas:\n  # our decisions\n  Decision:\n    properties:\n      status: {values: [open, closed]}\n      date: date\n  Risk:\n    properties: {level: number}\n---\n# Types\n\nOurs.\n';
    const bundled = '---\ntgs: "0.4"\nschemas:\n  Decision:\n    description: A choice.\n    properties:\n      status: {values: [proposed, accepted], description: Where it is.}\n      date: {kind: date, description: When.}\n    elements:\n      option:\n        description: An option.\n        attributes:\n          outcome: {values: [chosen, rejected]}\n  Concept:\n    description: A term.\n---\n# Bundled\n';
    const r = enrichOntology(mine, bundled)!;
    expect(r.added).toEqual(['Decision.description', 'Decision.elements', 'Decision.properties.status.description', 'Decision.properties.date.description']);
    expect(r.text).toContain('# our decisions');
    expect(r.text).toContain('status: {values: [open, closed], description: Where it is.}');
    expect(r.text).toContain('date: {kind: date, description: When.}');
    expect(r.text).toContain('Risk:');
    expect(r.text).not.toContain('Concept');
    expect(r.text).toContain('tgs: "0.4"');
    expect(r.text.endsWith('---\n# Types\n\nOurs.\n')).toBe(true);
    expect(enrichOntology(r.text, bundled)).toBeNull();
  });
});
