import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run, type Io } from '../src/cli.mjs';
import '../src/commands/index.mjs';

const TG = '@' + 'tg:';

function project(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'tg-specs-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

/** A PATH holding empty executables with these names, so `onPath` finds them. */
function bin(...names: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'tg-bin-'));
  for (const n of names) {
    writeFileSync(join(dir, n), '#!/bin/sh\n');
    chmodSync(join(dir, n), 0o755);
  }
  return dir;
}

interface Script {
  pick?: Record<string, string[]>;
  picked?: Record<string, string>;
}

/** Run tg with an optional terminal script and a recording fake `exec` that can write files as an installer would. */
async function tg(cwd: string, args: string[], opts: { script?: Script; path?: string; onExec?: (argv: string[], cwd: string) => void } = {}) {
  let out = '';
  let err = '';
  const ran: string[][] = [];
  const shown: Record<string, { id: string; label: string; checked: boolean }[]> = {};
  const io: Io = {
    cwd,
    out: (t) => (out += t),
    err: (t) => (err += t),
    env: { PATH: opts.path ?? '' },
    exec: async (argv, dir) => {
      ran.push(argv);
      opts.onExec?.(argv, dir);
      return 0;
    },
  };
  if (opts.script) {
    const s = opts.script;
    io.choose = async (title, items) => {
      shown[title] = items.map((i) => ({ ...i }));
      return s.pick?.[title] ?? items.filter((i) => i.checked).map((i) => i.id);
    };
    io.select = async (title, items) => {
      shown[title] = items.map((i) => ({ ...i, checked: false }));
      return s.picked?.[title] ?? items[0]!.id;
    };
    io.ask = async () => '';
  }
  const code = await run(args, io);
  return { code, out, err, ran, shown };
}

const read = (dir: string, rel: string) => readFileSync(join(dir, rel), 'utf8');
const json = (out: string) => JSON.parse(out) as { specs: string[]; installed: string[]; changes: { path: string }[]; notes: string[] };

const OPENSPEC = `## Requirements

### Requirement: Login
Users SHALL log in.

#### Scenario: Valid password
- **WHEN** a valid password is given
- **THEN** a session starts
`;

const SPECKIT = `# Feature Specification: Auth

## User Scenarios & Testing

### User Story 1 - Sign in (Priority: P1)

A user signs in.

**Acceptance Scenarios**:

1. **Given** a user, **When** they sign in, **Then** they see the dashboard

## Requirements

- **FR-001**: System MUST authenticate users
`;

const adr = (title: string, status: string, extra = '') => `---\nstatus: ${status}\ndate: 2026-01-01\n---\n# ${title}\n\n## Decision Outcome\n\nWe do it.\n${extra}`;

const LAT = { 'lat.md/lat.md': '# Project\n\nDocs.\n' };

describe('Framework ids', () => {
  // @lat: [[tests/spec-frameworks#Framework ids#Two frameworks side by side]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework ids#Two frameworks side by side]] {level: integration}
  it('resolves OpenSpec and ADR annotations in one project', async () => {
    const dir = project({
      ...LAT,
      'openspec/specs/auth/spec.md': OPENSPEC,
      'docs/adr/0003-use-postgres.md': adr('Use Postgres', 'accepted'),
      'src/a.ts': `// ${TG} implements:: [[openspec:auth#Login]]\nexport function login() {}\n// ${TG} implements:: [[adr:0003]]\nexport function db() {}\n`,
    });
    const r = await tg(dir, ['check']);
    expect(r.out + r.err).toContain('All checks passed');
    expect(r.code).toBe(0);
  });
});

describe('Framework detection', () => {
  // @lat: [[tests/spec-frameworks#Framework detection#Spec Kit needs its marker]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework detection#Spec Kit needs its marker]] {level: integration}
  it('reads Spec Kit features only when .specify/ exists', async () => {
    const files = { ...LAT, 'specs/001-auth/spec.md': SPECKIT };
    const without = await tg(project(files), ['trace']);
    expect(without.code).toBe(2);
    const withMarker = await tg(project({ ...files, '.specify/memory/constitution.md': '# Constitution\n' }), ['trace']);
    expect(withMarker.out).toContain('speckit:001-auth');
    expect(withMarker.out).toContain('FR-001');
  });

  // @lat: [[tests/spec-frameworks#Framework detection#Custom ADR folder]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework detection#Custom ADR folder]] {level: integration}
  it('reads the ADR folder named in .adr-dir', async () => {
    const dir = project({ ...LAT, '.adr-dir': 'architecture/adr\n', 'architecture/adr/0001-x.md': adr('X', 'accepted'), 'src/a.ts': `// ${TG} implements:: [[adr:0001]]\nexport const x = 1;\n` });
    const r = await tg(dir, ['trace', 'adr']);
    expect(r.out).toContain('0001');
    expect(r.out).toContain('implements  src/a.ts');
  });
});

// @lat: [[tests/spec-frameworks#Framework registry#Registry lists six frameworks]]
// @tg: verifies:: [[openspec:spec-frameworks#Framework registry#Registry lists six frameworks]] {level: unit}
it('lists every framework in the init usage', async () => {
  const r = await tg(project(), ['init', '--help']);
  expect(r.out + r.err).toContain('--spec openspec|speckit|kiro|bmad|gsd|adr');
});

// @lat: [[tests/spec-frameworks#Framework nodes in the graph#Implements a user story]]
// @tg: verifies:: [[openspec:spec-frameworks#Framework nodes in the graph#Implements a user story]] {level: integration}
it('lets code implement a user story under the code ontology', async () => {
  const dir = project({ '.specify/memory/constitution.md': '# C\n', 'specs/001-auth/spec.md': SPECKIT });
  expect((await tg(dir, ['init', '--spec', 'speckit', '--json'])).code).toBe(0);
  writeFileSync(join(dir, 'src.ts'), `// ${TG} implements:: [[speckit:001-auth#US1]]\nexport function signIn() {}\n`);
  const r = await tg(dir, ['ontology', 'check']);
  expect(r.out).toContain('All typed edges agree');
  const q = await tg(dir, ['cypher', 'MATCH (u:UserStory) RETURN u.requirement, u.priority']);
  expect(q.out).toContain('speckit:001-auth#US1');
  expect(q.out).toContain('P1');
});

describe('Docs name any framework', () => {
  // @lat: [[tests/spec-frameworks#Docs name any framework#ADR documented]]
  // @tg: verifies:: [[openspec:spec-frameworks#Docs name any framework#ADR documented]] {level: integration}
  it('marks a record named in specs: frontmatter as documented', async () => {
    const dir = project({ 'lat.md/lat.md': '---\nspecs: ["adr:0003"]\n---\n# Project\n\nDocs.\n', 'docs/adr/0003-use-postgres.md': adr('Use Postgres', 'accepted') });
    const r = await tg(dir, ['trace', 'adr']);
    expect(r.out).toContain('doc         lat.md/lat.md');
    expect((await tg(dir, ['check'])).code).toBe(0);
  });

  // @lat: [[tests/spec-frameworks#Docs name any framework#Unknown entry]]
  // @tg: verifies:: [[openspec:spec-frameworks#Docs name any framework#Unknown entry]] {level: integration}
  it('fails check for a specs: entry that names nothing', async () => {
    const dir = project({ 'lat.md/lat.md': '---\nspecs: ["speckit:009-missing"]\n---\n# Project\n\nDocs.\n', '.specify/x.md': '', 'specs/001-auth/spec.md': SPECKIT });
    const r = await tg(dir, ['check']);
    expect(r.code).toBe(1);
    expect(r.out + r.err).toContain('specs: "speckit:009-missing"');
  });
});

describe('Trace across frameworks', () => {
  // @lat: [[tests/spec-frameworks#Trace across frameworks#Superseded record is not a gap]]
  // @tg: verifies:: [[openspec:spec-frameworks#Trace across frameworks#Superseded record is not a gap]] {level: integration}
  it('lists retired records but never as gaps', async () => {
    const dir = project({
      ...LAT,
      'docs/adr/0002-use-postgres.md': adr('Use Postgres', 'superseded by ADR-0004'),
      'docs/adr/0004-use-sqlite.md': adr('Use SQLite', 'accepted', '\nSupersedes [2. Use Postgres](0002-use-postgres.md)\n'),
      'src/a.ts': `// ${TG} implements:: [[adr:4]]\nexport const db = 1;\n`,
    });
    const gaps = await tg(dir, ['trace', 'adr', '--gaps', '--strict']);
    expect(gaps.code).toBe(0);
    expect(gaps.out).not.toContain('0002');
    const all = await tg(dir, ['trace', 'adr']);
    expect(all.out).toContain('retired: superseded');
  });

  // @lat: [[tests/spec-frameworks#Trace across frameworks#Group argument]]
  // @tg: verifies:: [[openspec:spec-frameworks#Trace across frameworks#Group argument]] {level: integration}
  it('filters by a framework group', async () => {
    const dir = project({ ...LAT, 'openspec/specs/auth/spec.md': OPENSPEC, '.specify/x.md': '', 'specs/001-auth/spec.md': SPECKIT });
    const r = await tg(dir, ['trace', 'speckit:001-auth']);
    expect(r.out).toContain('FR-001');
    expect(r.out).not.toContain('Login');
    expect((await tg(dir, ['trace', 'auth'])).out).toContain('Login');
  });

  // @lat: [[tests/spec-frameworks#Trace across frameworks#No framework]]
  // @tg: verifies:: [[openspec:spec-frameworks#Trace across frameworks#No framework]] {level: integration}
  it('names the folders it looks for when there is no framework', async () => {
    const r = await tg(project(LAT), ['trace']);
    expect(r.code).toBe(2);
    for (const f of ['openspec/', '.kiro/specs/', 'docs/adr/']) expect(r.err).toContain(f);
  });
});

describe('Framework choice', () => {
  // @lat: [[tests/spec-frameworks#Framework choice#Flag for scripts]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework choice#Flag for scripts]] {level: integration}
  it('takes frameworks from --spec', async () => {
    const r = await tg(project(), ['init', '--spec', 'speckit,adr', '--json']);
    expect(json(r.out).specs).toEqual(['speckit', 'adr']);
  });

  // @lat: [[tests/spec-frameworks#Framework choice#Unknown framework]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework choice#Unknown framework]] {level: integration}
  it('rejects an unknown framework and writes nothing', async () => {
    const dir = project();
    const r = await tg(dir, ['init', '--spec', 'specflow']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('openspec, speckit, kiro, bmad, gsd, adr');
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false);
  });

  // @lat: [[tests/spec-frameworks#Framework choice#Checklist in a terminal]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework choice#Checklist in a terminal]] {level: integration}
  it('ticks and marks detected frameworks in the checklist', async () => {
    const dir = project({ 'openspec/config.yaml': 'schema: spec-driven\n', 'docs/adr/0001-x.md': adr('X', 'accepted') });
    const r = await tg(dir, ['init'], { script: {} });
    const items = r.shown['Spec frameworks to use']!;
    expect(items.filter((i) => i.checked).map((i) => i.id)).toEqual(['openspec', 'adr']);
    expect(items.find((i) => i.id === 'openspec')!.label).toContain('(found)');
  });
});

describe('Project analysis', () => {
  // @lat: [[tests/spec-frameworks#Project analysis#Existing codebase]]
  // @tg: verifies:: [[openspec:spec-frameworks#Project analysis#Existing codebase]] {level: integration}
  it('recommends OpenSpec for an existing codebase', async () => {
    const files = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`src/m${i}.ts`, 'export {};\n']));
    const r = await tg(project(files), ['init', '--dry-run'], { script: {} });
    const items = r.shown['Spec frameworks to use']!;
    expect(items.filter((i) => i.checked).map((i) => i.id)).toEqual(['openspec']);
    expect(items.find((i) => i.id === 'openspec')!.label).toContain('recommended: 12 source files');
  });

  // @lat: [[tests/spec-frameworks#Project analysis#New project]]
  // @tg: verifies:: [[openspec:spec-frameworks#Project analysis#New project]] {level: integration}
  it('recommends Spec Kit for a new project', async () => {
    const r = await tg(project(), ['init', '--dry-run'], { script: {} });
    const items = r.shown['Spec frameworks to use']!;
    expect(items.filter((i) => i.checked).map((i) => i.id)).toEqual(['speckit']);
    expect(items.find((i) => i.id === 'speckit')!.label).toContain('recommended');
  });
});

describe('Framework install', () => {
  // @lat: [[tests/spec-frameworks#Framework install#Installed in a terminal]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework install#Installed in a terminal]] {level: integration}
  it('runs the installer the person picks, then patches the skills it wrote', async () => {
    const dir = project();
    const r = await tg(dir, ['init', '--agent', 'claude'], {
      script: { pick: { 'Spec frameworks to use': ['openspec'] }, picked: { 'Set up OpenSpec in this project now?': 'run' } },
      path: bin('openspec'),
      onExec: (_argv, cwd) => {
        mkdirSync(join(cwd, '.claude/skills/openspec-apply-change'), { recursive: true });
        writeFileSync(join(cwd, '.claude/skills/openspec-apply-change/SKILL.md'), '# Apply\n');
        mkdirSync(join(cwd, 'openspec'), { recursive: true });
      },
    });
    expect(r.ran).toEqual([['openspec', 'init', '--tools', 'claude']]);
    expect(read(dir, '.claude/skills/openspec-apply-change/SKILL.md')).toContain('<!-- tg:begin -->');
  });

  // @lat: [[tests/spec-frameworks#Framework install#Script without consent]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework install#Script without consent]] {level: integration}
  it('runs nothing in a script without --install-spec and prints the command', async () => {
    const r = await tg(project(), ['init', '--spec', 'openspec', '--json'], { path: bin('openspec') });
    expect(r.ran).toEqual([]);
    expect(json(r.out).notes.join('\n')).toContain('openspec init --tools claude');
  });

  // @lat: [[tests/spec-frameworks#Framework install#Script with consent]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework install#Script with consent]] {level: integration}
  it('runs the one-off installer with --install-spec', async () => {
    const r = await tg(project(), ['init', '--spec', 'speckit', '--install-spec', '--json'], { path: bin('uvx') });
    expect(r.ran).toEqual([['uvx', '--from', 'specify-cli', 'specify', 'init', '--here', '--force', '--integration', 'claude']]);
    expect(json(r.out).installed).toEqual(['speckit']);
  });

  // @lat: [[tests/spec-frameworks#Framework install#Dry run]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework install#Dry run]] {level: integration}
  it('runs and writes nothing in a dry run', async () => {
    const dir = project();
    const r = await tg(dir, ['init', '--spec', 'openspec', '--install-spec', '--dry-run'], { path: bin('openspec') });
    expect(r.ran).toEqual([]);
    expect(r.out).toContain('openspec init --tools claude');
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false);
  });
});

describe('Framework skill patching', () => {
  const kit = () => project({ '.specify/x.md': '', '.claude/skills/speckit-implement/SKILL.md': '---\nname: speckit-implement\n---\n# Implement\n' });

  // @lat: [[tests/spec-frameworks#Framework skill patching#Spec Kit skill patched]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework skill patching#Spec Kit skill patched]] {level: integration}
  it('appends the implement block with Spec Kit ids', async () => {
    const dir = kit();
    await tg(dir, ['init', '--write']);
    const text = read(dir, '.claude/skills/speckit-implement/SKILL.md');
    expect(text.startsWith('---\nname: speckit-implement\n---\n# Implement\n')).toBe(true);
    expect(text).toContain('implements:: [[speckit:<feature>#FR-001]]');
  });

  // @lat: [[tests/spec-frameworks#Framework skill patching#Command file of another agent]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework skill patching#Command file of another agent]] {level: integration}
  it("patches another agent's command file", async () => {
    const dir = project({ '.specify/x.md': '', '.opencode/command/speckit.tasks.md': '# Tasks\n' });
    await tg(dir, ['init', '--agent', 'opencode', '--write']);
    expect(read(dir, '.opencode/command/speckit.tasks.md')).toContain('verifies:: [[speckit:<feature>#US1#Scenario 1]]');
  });

  // @lat: [[tests/spec-frameworks#Framework skill patching#Re-run is stable]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework skill patching#Re-run is stable]] {level: integration}
  it('keeps one block on a second run', async () => {
    const dir = kit();
    await tg(dir, ['init', '--write']);
    const r = await tg(dir, ['init', '--write']);
    expect(r.out).toContain('already set up');
    expect(read(dir, '.claude/skills/speckit-implement/SKILL.md').split('<!-- tg:begin -->').length).toBe(2);
  });
});

describe('Framework scaffolds', () => {
  // @lat: [[tests/spec-frameworks#Framework scaffolds#First ADR]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework scaffolds#First ADR]] {level: integration}
  it('writes a first ADR that resolves afterwards', async () => {
    const dir = project();
    await tg(dir, ['init', '--spec', 'adr', '--write']);
    expect(existsSync(join(dir, 'docs/adr/0001-record-architecture-decisions.md'))).toBe(true);
    expect(existsSync(join(dir, 'docs/adr/template.md'))).toBe(true);
    writeFileSync(join(dir, 'a.ts'), `// ${TG} implements:: [[adr:1]]\nexport const a = 1;\n`);
    expect((await tg(dir, ['check'])).code).toBe(0);
  });

  // @lat: [[tests/spec-frameworks#Framework scaffolds#Kiro steering]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework scaffolds#Kiro steering]] {level: integration}
  it('writes an always-included Kiro steering file', async () => {
    const dir = project();
    await tg(dir, ['init', '--spec', 'kiro', '--write']);
    expect(read(dir, '.kiro/steering/tg.md').startsWith('---\ninclusion: always\n---')).toBe(true);
  });
});

describe('Ontology per framework', () => {
  // @lat: [[tests/spec-frameworks#Ontology per framework#Spec Kit and Kiro together]]
  // @tg: verifies:: [[openspec:spec-frameworks#Ontology per framework#Spec Kit and Kiro together]] {level: integration}
  it('merges shared types into one note without duplicates', async () => {
    const dir = project();
    await tg(dir, ['init', '--spec', 'speckit,kiro', '--write']);
    const note = read(dir, 'Types/spec-types.md');
    expect(note.match(/^ {2}Feature:/gm)?.length).toBe(1);
    expect(note).toContain('UserStory:');
    expect(note).toContain('AcceptanceCriterion:');
    const r = await tg(dir, ['ontology']);
    expect(r.out + r.err).not.toContain('duplicate');
    expect(r.out).toContain('UserStory');
  });

  // @lat: [[tests/spec-frameworks#Ontology per framework#Only what is chosen]]
  // @tg: verifies:: [[openspec:spec-frameworks#Ontology per framework#Only what is chosen]] {level: integration}
  it('declares only the chosen frameworks', async () => {
    const dir = project();
    await tg(dir, ['init', '--spec', 'adr', '--write']);
    const note = read(dir, 'Types/spec-types.md');
    expect(note).toContain('ADR:');
    expect(note).toContain('amends:');
    expect(note).not.toContain('UserStory:');
  });
});

describe('Skills follow the frameworks', () => {
  // @lat: [[tests/spec-frameworks#Skills follow the frameworks#Skill for Spec Kit]]
  // @tg: verifies:: [[openspec:spec-frameworks#Skills follow the frameworks#Skill for Spec Kit]] {level: integration}
  it('fills the trace skill with the chosen framework only', async () => {
    const dir = project();
    await tg(dir, ['init', '--spec', 'speckit', '--write']);
    const skill = read(dir, '.claude/skills/tg-trace/SKILL.md');
    expect(skill).toContain('speckit:<feature>#FR-001');
    expect(skill).not.toContain('### Kiro specs');
    expect(skill).not.toContain('{{');
  });

  // @lat: [[tests/spec-frameworks#Skills follow the frameworks#Instructions name the frameworks]]
  // @tg: verifies:: [[openspec:spec-frameworks#Skills follow the frameworks#Instructions name the frameworks]] {level: integration}
  it('puts one line per framework in the instruction block', async () => {
    const dir = project();
    await tg(dir, ['init', '--spec', 'openspec,adr', '--write']);
    const block = read(dir, 'CLAUDE.md');
    expect(block).toContain('- **OpenSpec**');
    expect(block).toContain('[[adr:0003]]');
    expect(block).not.toContain('Spec Kit**');
  });
});
