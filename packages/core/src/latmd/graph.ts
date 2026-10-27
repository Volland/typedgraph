import type { ParsedEdge } from '../edges/parse.js';
import { buildCodeLayer, upsertCodeNode, type CodeLayer, type CodeMode, type CodeSource } from '../code/layer.js';
import { noteFormat, parseAsciidoc } from '../asciidoc/parse.js';
import type { YamlParser } from '../asciidoc/meta.js';
import { Graph } from '../graph/graph.js';
import { isSourceTarget } from './links.js';
import { isSpecTarget, type SpecIndex } from '../openspec/index.js';
import type { LatIndex } from './index.js';
import { specEntries } from './markdown.js';

export interface LatGraphOptions {
  /** Code to bring into the graph; default `off`. */
  code?: { mode: CodeMode; files: CodeSource[] };
  /** OpenSpec requirements to add as `Requirement` and `Scenario` nodes. */
  specs?: SpecIndex | null;
  /** AsciiDoc notes (project-relative path and text): one node each with its properties, comment edges, includes and cross references. */
  notes?: { path: string; text: string }[];
  /** YAML parser for the notes' property blocks. */
  parseYaml?: YamlParser;
}

function edge(type: string, target: string, line: number): ParsedEdge {
  return { type, sign: 1, target, subpath: null, alias: null, props: {}, line, heading: null };
}

/**
 * The lattice as a property graph the Cypher engine can query: one `Section`
 * node per section with properties `section` (the lat id), `title`, `file`,
 * `depth`, `startLine`, `endLine` and `summary`; `contains` edges from parent to
 * child section and `references` edges for every wiki link that resolves to a
 * section or, when the code layer is on, to a code node. With code enabled,
 * `CodeFile` and `CodeSymbol` nodes and the `@lat:` and `@tg:` edges join in.
 * With specs, `Requirement` and `Scenario` nodes join too: `@tg:` edges to
 * `openspec:` ids end at them, and a file's `openspec:` frontmatter becomes
 * `references` edges from its root section. A typed edge line in a section
 * (`motivated_by:: [[decisions#Why]] {since: 2}`) becomes an edge of that type,
 * sign and properties from the section, instead of a plain `references`.
 */
// @tg: implements:: [[cli#Agent integration]] {since: "2026-10-04"}
// @lat: [[cli#Agent integration]]
// @tg: implements:: [[openspec:code-layer#Link and node identity agree]]
// @tg: implements:: [[openspec:tg-trace#Requirement nodes]]
// @tg: implements:: [[openspec:tg-trace#Docs frontmatter]]
// @tg: implements:: [[openspec:tg-cli#Typed edges in docs]]
// @tg: implements:: [[openspec:spec-frameworks#Framework nodes in the graph]]
export function buildLatGraph(index: LatIndex, options: LatGraphOptions = {}): { graph: Graph; code: CodeLayer } {
  const known = new Set<string>(index.sections().map((s) => s.id));
  const specs = options.specs ?? null;
  const resolveSpec = (target: string): string | null => {
    const r = specs?.resolve(target);
    return r?.kind === 'requirement' ? r.requirement.id : r?.kind === 'scenario' ? r.scenario.id : null;
  };
  const resolveSection = (target: string): string | null => {
    if (isSpecTarget(target)) return resolveSpec(target);
    const r = index.resolve(target);
    return r.kind === 'section' ? r.id : null;
  };
  const notes = (options.notes ?? []).filter((n) => noteFormat(n.path) === 'adoc');
  const parsedNotes = notes.map((n) => ({ ...n, parsed: parseAsciidoc(n.text, n.path, { parseYaml: options.parseYaml, linkEdges: true }) }));
  // Source files a note includes or links get code nodes, so an include ends at the file it names.
  const noteCodeTargets = parsedNotes.flatMap((n) => n.parsed.edges.filter((e) => isSourceTarget(e.target)).map((e) => (e.subpath ? `${e.target}#${e.subpath}` : e.target)));
  const code = options.code ? buildCodeLayer(options.code.files, options.code.mode, resolveSection, noteCodeTargets) : { nodes: [], unresolved: [] };
  for (const n of code.nodes) known.add(n.path);
  // A note is reached by its path, or by its name when that is unambiguous, as in a vault.
  const noteNames = new Map<string, string | null>();
  for (const n of notes) {
    known.add(n.path);
    const base = n.path.slice(n.path.lastIndexOf('/') + 1);
    for (const key of [n.path, n.path.replace(/\.adoc$/i, ''), base, base.replace(/\.adoc$/i, '')].map((k) => k.toLowerCase())) {
      noteNames.set(key, noteNames.has(key) && noteNames.get(key) !== n.path ? null : n.path);
    }
  }
  for (const r of specs?.requirements() ?? []) {
    known.add(r.id);
    for (const sc of r.scenarios) known.add(sc.id);
  }

  const graph = new Graph(
    (link) => (known.has(link) ? link : noteNames.get(link.toLowerCase()) ?? null),
    (link, sub) => (known.has(`${link}#${sub}`) ? `${link}#${sub}` : null),
    { linkEdges: true, parseYaml: options.parseYaml },
  );

  /** A link target written in a doc: a section, an OpenSpec requirement or scenario, or a code node in the graph. */
  const resolveTarget = (target: string): string | null => {
    const sec = resolveSection(target);
    if (sec) return sec;
    const res = index.resolve(target);
    if (res.kind !== 'code') return null;
    const id = res.symbol ? `${res.file}#${res.symbol}` : res.file;
    return known.has(id) ? id : null;
  };

  // Section links, including links from prose to code nodes.
  const linksBySection = new Map<string, Map<string, number>>();
  for (const ref of index.refs()) {
    if (!ref.fromSection) continue;
    const res = index.resolve(ref.target);
    let target: string | null = null;
    if (res.kind === 'section') target = res.id;
    else if (res.kind === 'code') target = known.has(res.symbol ? `${res.file}#${res.symbol}` : res.file) ? (res.symbol ? `${res.file}#${res.symbol}` : res.file) : null;
    if (!target) continue;
    const m = linksBySection.get(ref.fromSection) ?? new Map<string, number>();
    if (!m.has(target)) m.set(target, ref.line);
    linksBySection.set(ref.fromSection, m);
  }

  // Typed edge lines in a section's own text become typed edges from that section.
  const typedBySection = new Map<string, ParsedEdge[]>();
  for (const file of index.files.values()) {
    for (const e of file.edges) {
      const line = e.line + 1;
      const owner = file.flat.filter((s) => s.startLine <= line && line <= s.endLine).sort((a, b) => b.depth - a.depth)[0];
      if (!owner) continue;
      const target = resolveTarget(e.subpath ? `${e.target}#${e.subpath}` : e.target);
      if (!target || target === owner.id) continue;
      const list = typedBySection.get(owner.id) ?? [];
      list.push({ type: e.type, sign: e.sign, target, subpath: null, alias: null, props: e.props, line, heading: null });
      typedBySection.set(owner.id, list);
    }
  }

  for (const s of index.sections()) {
    const edges: ParsedEdge[] = s.children.map((c) => edge('contains', c.id, c.startLine));
    const typed = typedBySection.get(s.id) ?? [];
    edges.push(...typed);
    const typedTargets = new Set(typed.map((e) => e.target));
    const fm = index.files.get(s.filePath)?.frontmatter;
    if (specs && s.depth === 1) {
      for (const { entry } of specEntries(fm)) {
        const reqs = entry.includes('#') ? [resolveSpec(entry)].filter((x): x is string => x !== null) : specs.entries(entry).map((r) => r.id);
        for (const id of reqs) edges.push(edge('references', id, s.startLine));
      }
    }
    // A link written as a typed edge is that edge, not also a plain reference.
    for (const [target, line] of linksBySection.get(s.id) ?? []) if (target !== s.id && !typedTargets.has(target)) edges.push(edge('references', target, line));
    graph.upsertNote({
      path: s.id,
      text: '',
      edges,
      frontmatter: { type: ['Section', ...(s.depth > 1 ? (index.files.get(s.filePath)?.frontmatter.types ?? []) : [])], section: s.id, file: s.filePath, depth: s.depth, startLine: s.startLine, endLine: s.endLine, summary: s.firstParagraph },
    });
    // Node titles default to the last path segment, which for a section id is not the heading.
    graph.node(s.id)!.props.title = s.heading;
  }

  // Spec nodes keep the base label the code ontology's edges allow (Requirement, Scenario, Decision) and add the framework's own (UserStory, ADR, ...).
  for (const r of specs?.requirements() ?? []) {
    const relations = (r.relations ?? []).map((x) => ({ ...edge(x.type, resolveSpec(x.target) ?? x.target, r.line) }));
    const base = r.kind === 'decision' ? 'Decision' : 'Requirement';
    graph.upsertNote({
      path: r.id,
      text: '',
      edges: [...r.scenarios.map((sc) => edge('contains', sc.id, sc.line)), ...relations],
      frontmatter: { ...(r.props ?? {}), type: [base, ...(r.labels ?? [])], requirement: r.id, framework: r.framework ?? 'openspec', capability: r.capability, name: r.name, text: r.text, file: r.file, line: r.line, status: r.status, change: r.change, removedBy: r.removedBy },
    });
    // A user story or decision record shows its own title; OpenSpec requirements have only their name.
    graph.node(r.id)!.props.title = r.props?.title || r.name;
    for (const sc of r.scenarios) {
      graph.upsertNote({ path: sc.id, text: '', edges: [], frontmatter: { ...(sc.props ?? {}), type: ['Scenario', ...(sc.labels ?? [])], scenario: sc.id, requirement: r.id, name: sc.name, file: sc.file, line: sc.line } });
      graph.node(sc.id)!.props.title = sc.name;
    }
  }

  for (const n of code.nodes) upsertCodeNode(graph, n);
  // Notes last, so their includes and links end at the code and section nodes already there.
  for (const n of parsedNotes) graph.upsertNote({ path: n.path, text: n.text, frontmatter: n.parsed.meta });
  return { graph, code };
}
