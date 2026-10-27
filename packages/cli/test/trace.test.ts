import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanAnnotations, SpecIndex } from '@obsigraph/core';
import { run } from '../src/cli.mjs';
import '../src/commands/index.mjs';

const TG = '@' + 'tg:';

async function tg(cwd: string, ...args: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const code = await run(args, { cwd, out: (t) => (out += t), err: (t) => (err += t), env: {} });
  return { code, out, err };
}

const AUTH_SPEC = `# auth Specification

## Purpose
Login.

## Requirements

### Requirement: Login
The system SHALL accept valid credentials
and reject expired tokens.

#### Scenario: Valid password
- **WHEN** the password matches
- **THEN** a session starts

#### Scenario: Expired token
- **WHEN** the token is expired
- **THEN** login fails

### Requirement: Logout
The system SHALL end the session.
`;

const CHANGE_SPEC = `## ADDED Requirements

### Requirement: Login
Shadowed by the main spec.

### Requirement: Two factor
The system SHALL ask for a second factor.

#### Scenario: Code sent
- **WHEN** login succeeds
- **THEN** a code is sent

## REMOVED Requirements

### Requirement: Logout
**Reason**: sessions expire.
`;

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'tg-trace-'));
  const all: Record<string, string> = { 'lat.md/lat.md': '# Lat\n\nIndex.\n\n- [[auth]] — auth\n', 'lat.md/auth.md': '# Auth\n\nHow login works.\n', ...files };
  for (const [p, t] of Object.entries(all)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), t);
  }
  return root;
}

const withSpecs = (extra: Record<string, string> = {}) => project({ 'openspec/specs/auth/spec.md': AUTH_SPEC, ...extra });

describe('OpenSpec reader', () => {
  // @tg: verifies:: [[tests/tg-trace#OpenSpec reader#Main spec]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/tg-trace#OpenSpec reader#Main spec]]
  // @tg: verifies:: [[openspec:tg-trace#OpenSpec reader#Main spec]]
  it('reads requirements, their SHALL text and scenarios from a main spec', () => {
    const idx = new SpecIndex([{ path: 'openspec/specs/auth/spec.md', text: AUTH_SPEC }]);
    expect(idx.capabilities()).toEqual(['auth']);
    const [login, logout] = idx.requirements();
    expect(login).toMatchObject({ id: 'openspec:auth#Login', status: 'active', change: null, line: 8, text: 'The system SHALL accept valid credentials and reject expired tokens.' });
    expect(login!.scenarios.map((s) => s.name)).toEqual(['Valid password', 'Expired token']);
    expect(logout!.scenarios).toEqual([]);
  });

  // @tg: verifies:: [[tests/tg-trace#OpenSpec reader#Active change]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/tg-trace#OpenSpec reader#Active change]]
  // @tg: verifies:: [[openspec:tg-trace#OpenSpec reader#Active change]]
  it('reads pending requirements from active changes and ignores the archive', () => {
    const idx = new SpecIndex([
      { path: 'openspec/specs/auth/spec.md', text: AUTH_SPEC },
      { path: 'openspec/changes/add-2fa/specs/auth/spec.md', text: CHANGE_SPEC },
      { path: 'openspec/changes/archive/2026-01-01-old/specs/auth/spec.md', text: '## ADDED Requirements\n\n### Requirement: Archived\nOld.\n' },
    ]);
    const two = idx.resolve('openspec:auth#Two factor');
    expect(two).toMatchObject({ kind: 'requirement', requirement: { status: 'pending', change: 'add-2fa' } });
    expect(idx.resolve('openspec:auth#Login')).toMatchObject({ requirement: { status: 'active' } });
    expect(idx.resolve('openspec:auth#Logout')).toMatchObject({ requirement: { removedBy: ['add-2fa'] } });
    expect(idx.resolve('openspec:auth#Archived').kind).toBe('missing');
  });

  // @tg: verifies:: [[tests/tg-trace#OpenSpec reader#No openspec folder]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/tg-trace#OpenSpec reader#No openspec folder]]
  // @tg: verifies:: [[openspec:tg-trace#OpenSpec reader#No openspec folder]]
  it('works without an openspec folder', async () => {
    const root = project({});
    expect((await tg(root, 'check')).code).toBe(0);
    const t = await tg(root, 'trace');
    expect(t.code).toBe(2);
    expect(t.err).toContain('no spec framework');
    expect(t.err).toContain('openspec/');
  });
});

describe('Requirement ids', () => {
  const idx = new SpecIndex([{ path: 'openspec/specs/auth/spec.md', text: AUTH_SPEC }]);

  // @tg: verifies:: [[tests/tg-trace#Requirement ids#Scenario id]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/tg-trace#Requirement ids#Scenario id]]
  // @tg: verifies:: [[openspec:tg-trace#Requirement ids#Scenario id]]
  it('resolves scenario ids ignoring case and extra whitespace', () => {
    const r = idx.resolve('openspec:AUTH#login#expired   TOKEN');
    expect(r).toMatchObject({ kind: 'scenario', scenario: { id: 'openspec:auth#Login#Expired token' } });
  });

  // @tg: verifies:: [[tests/tg-trace#Requirement ids#Misspelled requirement]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/tg-trace#Requirement ids#Misspelled requirement]]
  // @tg: verifies:: [[openspec:tg-trace#Requirement ids#Misspelled requirement]]
  it('suggests the nearest id for an unknown target', () => {
    expect(idx.resolve('openspec:auth#Logn')).toMatchObject({ kind: 'missing', suggestion: 'openspec:auth#Login' });
    expect(idx.resolve('openspec:auht#Login')).toMatchObject({ kind: 'missing', suggestion: 'openspec:auth' });
    expect(idx.resolve('openspec:auth#Login#Expird token')).toMatchObject({ kind: 'missing', suggestion: 'openspec:auth#Login#Expired token' });
  });
});

describe('Annotations on tests', () => {
  // @tg: verifies:: [[tests/tg-trace#Annotations on tests#Test call]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/tg-trace#Annotations on tests#Test call]]
  // @tg: verifies:: [[openspec:tg-annotations#Edge source#Test call]]
  it('attaches an annotation above a test call to the file with the test name', () => {
    const src = [`// ${TG} verifies:: [[openspec:auth#Login#Expired token]]`, `it('rejects expired tokens', () => {});`, `// ${TG} verifies:: [[openspec:auth#Login]]`, `test.skip("plain", () => {});`, `// ${TG} implements:: [[openspec:auth#Login]]`, 'const x = 1;'].join('\n');
    const r = scanAnnotations('a.test.ts', src);
    expect(r.annotations[0]).toMatchObject({ source: { kind: 'file' }, edges: [{ type: 'verifies', props: { test: 'rejects expired tokens' } }] });
    expect(r.annotations[1]!.edges[0]!.props).toEqual({ test: 'plain' });
    expect(r.annotations[2]!.source.kind).toBe('symbol');
    expect(r.diagnostics).toEqual([]);
  });
});

describe('Docs frontmatter and check', () => {
  // @tg: verifies:: [[tests/tg-trace#Docs frontmatter#Capability entry]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/tg-trace#Docs frontmatter#Capability entry]]
  // @tg: verifies:: [[openspec:tg-trace#Docs frontmatter#Capability entry]]
  it('turns openspec frontmatter into references from the root section', async () => {
    const root = withSpecs({ 'lat.md/auth.md': '---\nopenspec: [auth]\n---\n# Auth\n\nHow login works.\n' });
    const q = await tg(root, 'cypher', 'MATCH (s:Section)-[:references]->(r:Requirement) RETURN r.name ORDER BY r.name');
    expect(q.out).toContain('Login');
    expect(q.out).toContain('Logout');
    const t = await tg(root, 'trace', '--json');
    expect(JSON.parse(t.out)[0].documentedIn).toEqual(['lat.md/auth.md']);
  });

  // @tg: verifies:: [[tests/tg-trace#Check#Broken requirement target]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/tg-trace#Check#Broken requirement target]]
  // @tg: verifies:: [[openspec:tg-annotations#Annotation validation#Broken requirement target]]
  it('reports a misspelled requirement target with a suggestion', async () => {
    const root = withSpecs({ 'src/a.ts': `// ${TG} implements:: [[openspec:auth#Logn]]\nexport function login() {}\n` });
    const r = await tg(root, 'check');
    expect(r.code).toBe(1);
    expect(r.out).toContain("src/a.ts:1: @tg: [[openspec:auth#Logn]] — no requirement \"Logn\" in capability \"auth\" — did you mean '[[openspec:auth#Login]]'?");
  });

  // @tg: verifies:: [[tests/tg-trace#Check#Unknown frontmatter capability]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/tg-trace#Check#Unknown frontmatter capability]]
  // @tg: verifies:: [[openspec:tg-check#Check#Unknown frontmatter capability]]
  it('reports an unknown capability in openspec frontmatter', async () => {
    const root = withSpecs({ 'lat.md/auth.md': '---\nopenspec: [auht]\n---\n# Auth\n\nHow login works.\n' });
    const r = await tg(root, 'check');
    expect(r.code).toBe(1);
    expect(r.out).toContain('lat.md/auth.md:2: openspec: "auht" — no OpenSpec capability "auht"');
  });

  // @tg: verifies:: [[tests/tg-trace#Check#Untraced requirement]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/tg-trace#Check#Untraced requirement]]
  // @tg: verifies:: [[openspec:tg-check#Check#Untraced requirement]]
  it('does not report requirements without annotations', async () => {
    expect((await tg(withSpecs(), 'check')).code).toBe(0);
  });
});

describe('Trace command', () => {
  const traced = () =>
    withSpecs({
      'src/auth.ts': `// ${TG} implements:: [[openspec:auth#Login]]\nexport function login() {}\n`,
      'test/auth.test.ts': `// ${TG} verifies:: [[openspec:auth#Login#Valid password]]\nit('accepts a valid password', () => {});\n// ${TG} verifies:: [[openspec:auth#Login#Expired token]]\nit('rejects expired tokens', () => {});\n`,
    });

  // @tg: verifies:: [[tests/tg-trace#Trace command#Full trace]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/tg-trace#Trace command#Full trace]]
  // @tg: verifies:: [[openspec:tg-trace#Trace command#Full trace]]
  it('lists implementing code and verifying tests', async () => {
    const r = await tg(traced(), 'trace', 'auth');
    expect(r.code).toBe(0);
    expect(r.out).toContain('✓ Login  — undocumented');
    expect(r.out).toContain('implements  src/auth.ts#login:1');
    expect(r.out).toContain('✓ scenario  Expired token  test/auth.test.ts:3 "rejects expired tokens"');
    expect(r.out).toContain('✗ Logout  — unimplemented, unverified, undocumented');
  });

  // @tg: verifies:: [[tests/tg-trace#Trace command#Strict gap]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/tg-trace#Trace command#Strict gap]]
  // @tg: verifies:: [[openspec:tg-trace#Trace command#Strict gap]]
  it('fails under --strict while gaps remain and filters with --gaps', async () => {
    const root = traced();
    expect((await tg(root, 'trace', '--strict')).code).toBe(1);
    const gaps = await tg(root, 'trace', '--gaps');
    expect(gaps.code).toBe(0);
    expect(gaps.out).toContain('Logout');
    expect(gaps.out).not.toContain('✓ Login');
  });

  // @tg: verifies:: [[tests/tg-trace#Trace command#Unknown capability]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/tg-trace#Trace command#Unknown capability]]
  // @tg: verifies:: [[openspec:tg-trace#Trace command#Unknown capability]]
  it('rejects an unknown capability', async () => {
    const r = await tg(withSpecs(), 'trace', 'nope');
    expect(r.code).toBe(2);
    expect(r.err).toContain('unknown capability: nope');
    expect(r.err).toContain('known: auth');
  });

  // @tg: verifies:: [[tests/tg-trace#Requirement nodes#Cypher over requirements]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/tg-trace#Requirement nodes#Cypher over requirements]]
  // @tg: verifies:: [[openspec:tg-trace#Requirement nodes#Cypher over requirements]]
  it('exposes requirement nodes to cypher', async () => {
    const r = await tg(traced(), 'cypher', 'MATCH (s:CodeSymbol)-[:implements]->(r:Requirement) RETURN s.name, r.name');
    expect(r.out).toContain('login  | Login');
    const sc = await tg(traced(), 'cypher', 'MATCH (:Requirement {name: "Login"})-[:contains]->(s:Scenario) RETURN count(s)');
    expect(sc.out).toContain('2');
  });
});
