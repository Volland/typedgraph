import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { run, VERSION, EXIT_ERROR, type Io } from '../cli.mjs';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/** Run one CLI command in-process and return its text; the MCP tools are the CLI commands. */
// @tg: implements:: [[openspec:tg-agent-integration#MCP server]]
async function call(root: string, io: Io, args: string[]): Promise<{ text: string; isError: boolean }> {
  let out = '';
  let err = '';
  const code = await run(['--dir', root, ...args], { ...io, out: (t) => (out += t), err: (t) => (err += t) });
  return { text: out || err, isError: code === EXIT_ERROR };
}

/** MCP server exposing the lattice and its graph; every tool wraps the matching `tg` command. */
// @tg: implements:: [[cli#Agent integration]] {since: "2026-10-04"}
// @lat: [[cli#Agent integration]]
// @tg: implements:: [[openspec:tg-agent-integration#MCP server]]
export function createTgMcpServer(root: string, io: Io): McpServer {
  const server = new McpServer({ name: 'tg', version: VERSION });
  // Arguments are validated by each tool's zod shape before the callback runs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Args = Record<string, any>;
  const tool = (name: string, description: string, schema: z.ZodRawShape, argv: (a: Args) => string[]) =>
    server.registerTool(name, { description, inputSchema: schema, annotations: READ_ONLY }, (async (args: Args) => {
      const r = await call(root, io, argv(args));
      return { content: [{ type: 'text' as const, text: r.text }], ...(r.isError ? { isError: true } : {}) };
    }) as never);
  tool('tg_locate', 'Find sections by name (exact, fuzzy, subsequence matching)', { query: z.string().describe('Section name or id') }, (a) => ['locate', a.query]);
  tool('tg_section', 'Show a section with its content, outgoing references and incoming references', { query: z.string().describe('Section id or name') }, (a) => ['section', a.query]);
  tool('tg_search', 'Search sections: lexical by default, hybrid when embeddings are configured', { query: z.string(), limit: z.number().int().min(1).max(50).optional() }, (a) => ['search', ...(a.limit ? ['--limit', String(a.limit)] : []), a.query]);
  tool('tg_expand', 'Expand [[refs]] in text to resolved section locations', { text: z.string().describe('Text containing [[refs]]') }, (a) => ['expand', a.text]);
  tool('tg_check', 'Validate links, code references, annotations, indexes and section structure', { scope: z.enum(['md', 'code-refs', 'index', 'sections']).optional() }, (a) => ['check', ...(a.scope ? [a.scope] : [])]);
  tool('tg_refs', 'Find sections and code that reference a section', { query: z.string(), scope: z.enum(['md', 'code', 'md+code']).optional() }, (a) => ['refs', ...(a.scope ? ['--scope', a.scope] : []), a.query]);
  tool('tg_cypher', 'Run a read-only openCypher query over the section graph (nodes labeled Section, Requirement and Scenario, plus CodeFile and CodeSymbol for annotated code; edges contains, references and annotation types such as implements and verifies). Results are JSON.', { query: z.string().describe('openCypher read query') }, (a) => ['cypher', '--json', a.query]);
  tool('tg_edges', 'List @lat and @tg annotation edges from code to sections, with type, sign and properties', { type: z.string().optional(), to: z.string().optional(), file: z.string().optional() }, (a) => ['edges', '--json', ...(a.type ? ['--type', a.type] : []), ...(a.to ? ['--to', a.to] : []), ...(a.file ? ['--file', a.file] : [])]);
  tool('tg_ontology', 'The project ontology from its schema folder (Types/): types with their descriptions, properties, allowed edges, and the headings and XML elements their documents hold, and edge types with endpoints and properties. check=true lists typed edges and document elements in docs and code that the ontology does not allow.', { check: z.boolean().optional() }, (a) => ['ontology', ...(a.check ? ['check'] : []), '--json']);
  tool('tg_trace', 'OpenSpec traceability: for each requirement, the code that implements it, the tests that verify its scenarios and the lat.md files that explain it. gaps=true lists only incomplete requirements.', { capabilities: z.array(z.string()).optional(), gaps: z.boolean().optional() }, (a) => ['trace', '--json', ...(a.gaps ? ['--gaps'] : []), ...(a.capabilities ?? [])]);
  return server;
}
