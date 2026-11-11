import { BuiltinEngine, buildLatGraph, CypherError, isSpecTarget, resultToJson, type CodeMode, type QueryResult, type Value } from '@obsigraph/core';
import { parseYaml } from '@obsigraph/node-vault';
import { EXIT_ERROR, EXIT_FINDINGS, EXIT_OK, register, type Command } from '../cli.mjs';
import { NoLatDir, Project } from '../project.mjs';

// @tg: implements:: [[openspec:code-layer#Code mode setting]]
function codeMode(flag: string | true | undefined, env: string | undefined): CodeMode {
  const v = typeof flag === 'string' ? flag : env;
  if (v === 'off' || v === 'all' || v === 'annotated') return v;
  if (v) throw new Error(`unknown code mode "${v}"; expected off, annotated or all`);
  return 'annotated';
}

function cell(v: Value): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'object' && 'props' in (v as object)) {
    const n = v as { id?: string; props?: Record<string, unknown> };
    return String(n.props?.section ?? n.props?.requirement ?? n.props?.scenario ?? n.props?.element ?? n.props?.title ?? n.id ?? '?');
  }
  return typeof v === 'string' ? v : JSON.stringify(v);
}

export const cypher: Command = {
  name: 'cypher',
  summary: 'Run a read-only openCypher query over the section graph',
  usage: 'cypher [--code off|annotated|all] "<query>"',
  flags: { code: 'string' },
  run(ctx, args, flags) {
    const query = args.join(' ').trim();
    if (!query) {
      ctx.err('usage: tg cypher "<query>"\n');
      return EXIT_ERROR;
    }
    let project: Project;
    try {
      project = new Project(ctx.root);
    } catch (e) {
      if (e instanceof NoLatDir) {
        ctx.err(`${e.message}\n`);
        return EXIT_ERROR;
      }
      throw e;
    }
    let result: QueryResult;
    try {
      const mode = codeMode(flags.get('code'), ctx.env.TG_CODE);
      const files = mode === 'off' ? [] : project.codeSources();
      result = new BuiltinEngine(buildLatGraph(project.index(), { code: { mode, files }, specs: project.specIndex(), schemas: project.schemas(), notes: project.noteFiles().map((path) => ({ path, text: project.text(path) ?? '' })), parseYaml }).graph, () => ({ timeoutMs: 10_000 })).run(query);
    } catch (e) {
      if (e instanceof CypherError) {
        ctx.err(`${e.message}${e.line > 0 ? ` (line ${e.line}, column ${e.column})` : ''}\n`);
        return EXIT_ERROR;
      }
      throw e;
    }
    if (ctx.json) {
      ctx.out(`${JSON.stringify(resultToJson(result))}\n`);
      return EXIT_OK;
    }
    const cols = result.columns.map((c) => c.name);
    const rows = result.rows.map((r) => r.map(cell));
    const widths = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => r[i]!.length)));
    const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join(' | ').trimEnd();
    ctx.out(`${[line(cols), widths.map((w) => '-'.repeat(w)).join('-+-'), ...rows.map(line), '', `${rows.length} row${rows.length === 1 ? '' : 's'}`, ...(result.notices ?? [])].join('\n')}\n`);
    return EXIT_OK;
  },
};

export const edges: Command = {
  name: 'edges',
  summary: 'List @lat and @tg annotation edges (code to section or requirement) with type, sign and properties',
  usage: 'edges [--type t] [--to section] [--file path]',
  flags: { type: 'string', to: 'string', file: 'string' },
  run(ctx, _args, flags) {
    let project: Project;
    try {
      project = new Project(ctx.root);
    } catch (e) {
      if (e instanceof NoLatDir) {
        ctx.err(`${e.message}\n`);
        return EXIT_ERROR;
      }
      throw e;
    }
    const index = project.index();
    const specs = project.specIndex();
    const resolveTarget = (t: string): string => {
      if (!isSpecTarget(t)) return index.resolveRef(t).resolved;
      const r = specs?.resolve(t);
      return r?.kind === 'requirement' ? r.requirement.id : r?.kind === 'scenario' ? r.scenario.id : t;
    };
    const type = flags.get('type');
    const to = flags.get('to');
    const file = flags.get('file');
    const rows = project.annotations().annotations.flatMap((a) =>
      a.edges.map((e) => ({
        type: e.type,
        sign: e.sign,
        source: `${a.file}${a.source.kind === 'symbol' ? `#${a.source.symbolPath}` : ''}`,
        line: a.line,
        target: resolveTarget(e.target),
        props: e.props,
        kind: a.kind,
      })),
    );
    const out = rows.filter((r) => (typeof type !== 'string' || r.type === type) && (typeof to !== 'string' || r.target.toLowerCase().includes(to.toLowerCase())) && (typeof file !== 'string' || r.source.startsWith(file)));
    if (ctx.json) {
      ctx.out(`${JSON.stringify(out)}\n`);
      return out.length ? EXIT_OK : EXIT_FINDINGS;
    }
    if (!out.length) {
      ctx.out('No edges found.\n');
      return EXIT_FINDINGS;
    }
    ctx.out(`${out.map((r) => `${r.source}:${r.line}  ${r.sign < 0 ? '-' : ''}${r.type}  [[${r.target}]]${Object.keys(r.props).length ? ` ${JSON.stringify(r.props)}` : ''}`).join('\n')}\n`);
    return EXIT_OK;
  },
};

register(cypher, edges);
