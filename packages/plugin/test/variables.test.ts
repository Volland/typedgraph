import { BuiltinEngine, Graph } from '@obsigraph/core';
import { describe, expect, it } from 'vitest';
import { parseBlock } from '../src/query/block';
import { noteContext, substituteVariables } from '../src/query/variables';

const ctx = noteContext('Cust/Proj/PM/WBS Activities/Build.md', { status: 'Active', points: 5, done: false, tags: ['a', 'b'], 'data-domain': '[[Customer]]', nested: { deep: 'x' } });

describe('note variables', () => {
  // @lat: [[tests/graph-query-block#Note variables become literals]]
  it('replaces variables with Cypher literals', () => {
    expect(substituteVariables('{path: {{path}}}', ctx)).toBe('{path: "Cust/Proj/PM/WBS Activities/Build.md"}');
    expect(substituteVariables('{{ title }} {{name}} {{folder}} {{extension}}', ctx)).toBe('"Build" "Build.md" "Cust/Proj/PM/WBS Activities" "md"');
    expect(substituteVariables('{{fm.status}} {{frontmatter.points}} {{fm.done}} {{fm.tags}} {{fm.data-domain}} {{fm.nested.deep}}', ctx)).toBe('"Active" 5 false ["a", "b"] "[[Customer]]" "x"');
  });

  // @lat: [[tests/graph-query-block#Unknown variables are null]]
  it('turns unresolved names and non-literal values into null and never evaluates code', () => {
    expect(substituteVariables('{{missing}} {{fm.nope}} {{fm.nested}} {{path.length}}', ctx)).toBe('null null null null');
    expect(substituteVariables('{{constructor}} {{fm.__proto__}} {{path.constructor}}', ctx)).toBe('null null null');
    // not identifier chains: left alone, so the parser reports them
    expect(substituteVariables('{{ 1 + 1 }} {{path.toString()}} {a: {b: 1}}', ctx)).toBe('{{ 1 + 1 }} {{path.toString()}} {a: {b: 1}}');
  });

  // @lat: [[tests/graph-query-block#Variables substituted before parsing]]
  it('lets a block query use the note it sits in', () => {
    const notes: Record<string, string> = { 'A.md': 'parent_activity:: [[B]]', 'B.md': 'parent_activity:: [[C]]', 'C.md': '' };
    const graph = new Graph((l) => (`${l}.md` in notes ? `${l}.md` : null));
    for (const [path, text] of Object.entries(notes)) graph.upsertNote({ path, text, frontmatter: { type: 'WBS_Activity' } });
    const b = parseBlock('view: graph\nheight: 700\n\nMATCH (w:WBS_Activity {path: {{path}}})-[r:parent_activity*1..3]->(w2)\nRETURN w2');
    expect(b.errors).toEqual([]);
    const result = new BuiltinEngine(graph).run(substituteVariables(b.query, noteContext('A.md')));
    expect(result.rows).toHaveLength(2);
  });
});
