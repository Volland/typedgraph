import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { BuiltinEngine, checkOkf, exportOkf, Graph, planNewNote, schemasFromGraph, splitFrontmatter, validateSchemas, type NoteInput } from '../src/index.js';
import { exportShacl } from '../src/shacl.js';

const ROOT = join(__dirname, '../../../ontologies');
const ALL = readdirSync(ROOT).filter((f) => statSync(join(ROOT, f)).isDirectory()).sort();
/** The ontologies you pick from; `core` is the shared base they build on. */
const IDS = ALL.filter((id) => id !== 'core');
const validateJson = new Ajv({ strict: true, allowUnionTypes: true }).compile(JSON.parse(readFileSync(join(__dirname, '../../../spec/tgs/tgs.schema.json'), 'utf8')));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
}

/** The notes of one gallery ontology, Markdown and AsciiDoc; `README.md` is documentation and is left out. */
function load(id: string): NoteInput[] {
  const dir = join(ROOT, id);
  return files(dir)
    .filter((f) => (f.endsWith('.md') || f.endsWith('.adoc')) && !f.endsWith('README.md'))
    .sort()
    .map((f) => {
      const text = readFileSync(f, 'utf8');
      if (f.endsWith('.adoc')) return { path: relative(dir, f), text, frontmatter: null };
      const { yaml } = splitFrontmatter(text);
      return { path: relative(dir, f), text, frontmatter: yaml === null ? null : (parseYaml(yaml) as Record<string, unknown>) };
    });
}

function build(notes: NoteInput[]): Graph {
  const paths = [...new Set(notes.map((n) => n.path))];
  const graph = new Graph((l) => paths.find((p) => p === l || ['.md', '.adoc'].some((ext) => p === `${l}${ext}` || p.endsWith(`/${l}${ext}`))) ?? null, undefined, { parseYaml });
  for (const n of notes) graph.upsertNote(n);
  return graph;
}

function check(notes: NoteInput[]) {
  const graph = build(notes);
  const set = schemasFromGraph(graph, 'Types/');
  return { set, diagnostics: [...set.diagnostics, ...validateSchemas(graph, set)].map((d) => `${d.path}:${d.line ?? ''} ${d.message}`) };
}

describe('ontology gallery', () => {
  it('has the six ontologies and the shared core', () => {
    expect(ALL).toEqual(['agents', 'core', 'library', 'manuscript', 'okf', 'requirements', 'zettelkasten']);
  });

  // @tg: verifies:: [[tests/ontology-gallery#Each ontology stands alone]] {since: "2026-10-06", level: unit}
  // @lat: [[tests/ontology-gallery#Each ontology stands alone]]
  // @tg: verifies:: [[openspec:ontology-gallery#Each ontology stands alone#Ontology checked alone]]
  it.each(IDS)('%s reads, validates its examples, exports to SHACL and matches the JSON Schema', (id) => {
    const notes = load(id);
    const { set, diagnostics } = check(notes);
    expect(diagnostics).toEqual([]);
    expect(set.schemas.size).toBeGreaterThanOrEqual(3);
    expect(set.edgeTypes.size).toBeGreaterThanOrEqual(5);
    for (const n of notes.filter((x) => x.path.startsWith('Types/'))) expect(validateJson(n.frontmatter ?? {}), JSON.stringify(validateJson.errors)).toBe(true);
    const bodies = new Map(notes.map((n) => [n.path, splitFrontmatter(n.text).body]));
    expect(exportShacl(set, { body: (p) => bodies.get(p) ?? null })).toContain('sh:NodeShape');
  });

  it('core declares the shared edge types and nothing else', () => {
    const { set, diagnostics } = check(load('core'));
    expect(diagnostics).toEqual([]);
    expect([...set.edgeTypes.keys()].sort()).toEqual(['cites', 'contradicts', 'derived_from']);
    expect(set.schemas.size).toBe(0);
  });

  // @tg: verifies:: [[tests/ontology-gallery#Zettelkasten note types and sources]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/ontology-gallery#Zettelkasten note types and sources]]
  // @tg: verifies:: [[openspec:ontology-gallery#Zettelkasten ontology#Literature note without a source]]
  it('covers every Zettelkasten note and source type, and requires sources for literature notes and highlights', () => {
    const notes = load('zettelkasten');
    const used = new Set(notes.flatMap((n) => [n.frontmatter?.type].flat().filter(Boolean) as string[]));
    for (const t of ['FleetingNote', 'LiteratureNote', 'PermanentNote', 'StructureNote', 'ProjectNote', 'BookSource', 'ArticleSource', 'PaperSource', 'Highlight', 'Writer', 'Topic']) expect(used.has(t), t).toBe(true);
    const orphanLiterature: NoteInput = { path: 'Examples/No source.md', text: '---\ntype: LiteratureNote\n---\nA summary of nothing.\n', frontmatter: { type: 'LiteratureNote' } };
    const orphanHighlight: NoteInput = { path: 'Examples/Loose.md', text: '---\ntype: Highlight\n---\nA line from nowhere.\n', frontmatter: { type: 'Highlight' } };
    const { diagnostics } = check([...load('core'), ...notes, orphanLiterature, orphanHighlight]);
    expect(diagnostics.some((d) => /Missing required edge 'cites' for type LiteratureNote/.test(d))).toBe(true);
    expect(diagnostics.some((d) => /Missing required edge 'highlighted_in' for type Highlight/.test(d))).toBe(true);
  });

  // @tg: verifies:: [[tests/ontology-gallery#Manuscript chapters, research and reviews]] {since: "2026-10-27", level: unit}
  // @lat: [[tests/ontology-gallery#Manuscript chapters, research and reviews]]
  // @tg: verifies:: [[openspec:ontology-gallery#Manuscript ontology#Review comment checked]]
  it('reads AsciiDoc chapters in include order and answers manuscript, research and review questions', () => {
    const notes = [...load('core'), ...load('manuscript')];
    const used = new Set(notes.flatMap((n) => [n.frontmatter?.type].flat().filter(Boolean) as string[]));
    for (const t of ['ResearchNote', 'Source', 'Outline', 'Idea', 'Review', 'Reviewer']) expect(used.has(t), t).toBe(true);
    const graph = build(notes);
    const rows = (q: string) => new BuiltinEngine(graph).run(q).rows;
    expect(rows('MATCH (m:Manuscript)-[r:includes]->(c:Chapter) RETURN c.title, r.order ORDER BY r.order')).toEqual([
      ['Why Graphs', 1],
      ['Typed Edges', 2],
      ['Asking the Graph', 3],
      ['Bibliography', 4],
    ]);
    // An idea a chapter relies on before the chapter that introduces it, in reading order.
    expect(
      rows('MATCH (m:Manuscript)-[a:includes]->(c:Chapter)-[:relies_on]->(i:Idea)<-[:introduces]-(d:Chapter)<-[b:includes]-(m) WHERE b.order > a.order RETURN c.title, i.title, d.title'),
    ).toEqual([['Why Graphs', 'Typed edge', 'Typed Edges']]);
    expect(rows("MATCH (r:Review)-[e:comments_on]->(c) WHERE e.status = 'open' AND e.severity IN ['blocker', 'major'] RETURN c.title ORDER BY c.title")).toEqual([['Asking the Graph'], ['Why Graphs']]);
    expect(rows("MATCH (c:Chapter)-[e:cites]->(s:Source) WHERE e.intent = 'obtainsBackgroundFrom' RETURN DISTINCT s.citekey ORDER BY s.citekey")).toEqual([['hogan2021'], ['robinson2015']]);

    const unsigned: NoteInput = {
      path: 'Examples/reviews/Anonymous.md',
      text: '---\ntype: Review\nstage: beta\n---\n## Links\n\n- comments_on:: [[ch02-typed-edges]] {status: maybe}\n',
      frontmatter: { type: 'Review', stage: 'beta' },
    };
    const { diagnostics } = check([...notes, unsigned]);
    expect(diagnostics.some((d) => /Missing required edge 'reviewed_by' for type Review/.test(d))).toBe(true);
    expect(diagnostics.some((d) => /maybe/.test(d))).toBe(true);

    // Chapters, parts and the manuscript are created as AsciiDoc from their templates, the rest as Markdown.
    const { set } = check(notes);
    for (const t of set.schemas.values()) {
      const templatePath = t.template!.replace(/^\[\[|\]\]$/g, '');
      const template = notes.find((n) => n.path === templatePath || n.path === `${templatePath}.md`)!;
      expect(template, t.type).toBeTruthy();
      const linkedBody = template.path.endsWith('.adoc') ? template.text : splitFrontmatter(template.text).body;
      const plan = planNewNote({ schema: t, title: 'Fresh', linkedBody, templatePath: template.path, schemaBody: '', graph });
      expect(plan.fileName, t.type).toBe(['Manuscript', 'Part', 'Chapter'].includes(t.type) ? 'Fresh.adoc' : 'Fresh.md');
      const fresh: NoteInput = { path: `Examples/${plan.fileName}`, text: plan.content, frontmatter: plan.fileName.endsWith('.md') ? (parseYaml(splitFrontmatter(plan.content).yaml ?? '') as Record<string, unknown>) : null };
      const found = check([...notes, fresh]).diagnostics.filter((d) => d.startsWith(fresh.path) && !/Missing required/.test(d));
      expect(found, t.type).toEqual([]);
      expect(build([fresh]).node(fresh.path)!.labels, t.type).toEqual([t.type]);
    }
  });

  // @tg: verifies:: [[tests/ontology-gallery#Ontologies compose]] {since: "2026-10-06", level: unit}
  // @lat: [[tests/ontology-gallery#Ontologies compose]]
  // @tg: verifies:: [[openspec:ontology-gallery#Ontologies compose#All composed]]
  it('combines into one vault with no clash, and a note can carry labels from two ontologies', () => {
    const merged = ALL.flatMap((id) => load(id).map((n) => ({ ...n, path: n.path.startsWith('Types/') ? n.path : `${id}/${n.path}` })));
    const both: NoteInput = {
      path: 'Shared/Thinking in Systems.md',
      text: '---\ntype: [Book, BookSource]\nauthor: Donella Meadows\nstatus: finished\n---\n## Links\n\nwritten_by:: [[Donella Meadows]]\nauthored_by:: [[Donella Meadows]]\n',
      frontmatter: { type: ['Book', 'BookSource'], author: 'Donella Meadows', status: 'finished' },
    };
    const author: NoteInput = { path: 'Shared/Donella Meadows.md', text: '---\ntype: [Author, Writer]\n---\n', frontmatter: { type: ['Author', 'Writer'] } };
    const zettel: NoteInput = {
      path: 'Shared/Leverage points.md',
      text: '---\ntype: PermanentNote\n---\n## Links\n\ncites:: [[Thinking in Systems]] {page: "145"}\n',
      frontmatter: { type: 'PermanentNote' },
    };
    const { set, diagnostics } = check([...merged, both, author, zettel]);
    expect(diagnostics).toEqual([]);
    expect(set.schemas.size).toBe(IDS.reduce((n, id) => n + check(load(id)).set.schemas.size, 0));
    expect(set.edgeTypes.has('contradicts')).toBe(true);
  });

  // @tg: verifies:: [[tests/ontology-gallery#Clash without core]] {since: "2026-10-06", level: unit}
  // @lat: [[tests/ontology-gallery#Clash without core]]
  // @tg: verifies:: [[openspec:ontology-gallery#Ontologies compose#Clash without core]]
  it('reports the duplicate edge type when two ontologies both declare it', () => {
    const dup: NoteInput = {
      path: 'Types/Extra.md',
      text: '---\nedgeTypes:\n  contradicts: {from: PermanentNote}\n---\n',
      frontmatter: { edgeTypes: { contradicts: { from: 'PermanentNote' } } },
    };
    const { diagnostics } = check([...ALL.flatMap((id) => load(id)), dup]);
    expect(diagnostics.some((d) => /Edge type 'contradicts' is declared in both/.test(d))).toBe(true);
  });

  // @tg: verifies:: [[tests/ontology-gallery#Mixin bridges two ontologies]] {since: "2026-10-06", level: unit}
  // @lat: [[tests/ontology-gallery#Mixin bridges two ontologies]]
  // @tg: verifies:: [[openspec:ontology-gallery#Mixins bridge ontologies#Edge granted by mixin]]
  it('lets a mixin type grant an edge across ontologies, and rejects it without the mixin', () => {
    const merged = ALL.flatMap((id) => load(id).map((n) => ({ ...n, path: n.path.startsWith('Types/') ? n.path : `${id}/${n.path}` })));
    const bridge: NoteInput = {
      path: 'Types/Bridge.md',
      text: '---\nschemas:\n  Traceable:\n    edges:\n      implements: Requirement\nedgeTypes:\n  implements: {to: Requirement}\n---\n',
      frontmatter: { schemas: { Traceable: { edges: { implements: 'Requirement' } } }, edgeTypes: { implements: { to: 'Requirement' } } },
    };
    const prompt = (types: string[]): NoteInput => ({
      path: 'Shared/Expiry prompt.md',
      text: `---\ntype: [${types.join(', ')}]\npurpose: Explain token expiry\n---\n## Links\n\nimplements:: [[Tokens expire after 15 minutes]]\n`,
      frontmatter: { type: types, purpose: 'Explain token expiry' },
    });
    expect(check([...merged, bridge, prompt(['Prompt', 'Traceable'])]).diagnostics).toEqual([]);
    const without = check([...merged, bridge, prompt(['Prompt'])]).diagnostics;
    expect(without.some((d) => /'implements' is not allowed for/.test(d))).toBe(true);
  });

  // @tg: verifies:: [[tests/ontology-gallery#OKF ontology exports conformant]] {since: "2026-10-06", level: unit}
  // @lat: [[tests/ontology-gallery#OKF ontology exports conformant]]
  // @tg: verifies:: [[openspec:ontology-gallery#OKF ontology exports conformant#Export and check]]
  it('exports the OKF ontology as a bundle with no conformance errors', () => {
    const notes = load('okf').filter((n) => n.path.startsWith('Examples/'));
    const { files } = exportOkf(notes.map((n) => ({ path: n.path, text: n.text, frontmatter: n.frontmatter ?? null })));
    const bundle = files.map((f) => {
      const { yaml } = splitFrontmatter(f.text);
      return { ...f, frontmatter: yaml === null ? null : (parseYaml(yaml) as Record<string, unknown>) };
    });
    expect(checkOkf(bundle).filter((f) => f.severity === 'error')).toEqual([]);
    expect(files.find((f) => f.path === 'Examples/orders.md')!.text).toContain('derived_from:: [raw_orders](/Examples/raw_orders.md)');
  });
});
