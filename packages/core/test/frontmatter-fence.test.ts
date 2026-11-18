import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { frontmatterClose, parseEdges, scanHeadings, splitFrontmatter } from '../src/index.js';

describe('splitFrontmatter closing fence', () => {
  // @tg: verifies:: [[openspec:edge-parsing#Frontmatter closing fence#Indented fence in a block scalar]]
  it('keeps an indented --- or ... inside a block scalar as content', () => {
    const text = '---\ntype: question\nrationale: |\n  First paragraph.\n  ---\n  Second paragraph.\n  ...\nconcept:\n  - "[[topic]]"\n---\nBody.\n';
    const { yaml, body } = splitFrontmatter(text);
    expect(parseYaml(yaml!)).toEqual({
      type: 'question',
      rationale: 'First paragraph.\n---\nSecond paragraph.\n...\n',
      concept: ['[[topic]]'],
    });
    expect(body).toBe('Body.\n');
  });

  // @tg: verifies:: [[openspec:edge-parsing#Frontmatter closing fence#Column-0 fence with trailing whitespace]]
  it('still closes at a column-0 fence with trailing spaces or tabs', () => {
    expect(splitFrontmatter('---\ntype: a\n--- \t\nBody.\n')).toEqual({ yaml: 'type: a', body: 'Body.\n' });
    expect(splitFrontmatter('---\ntype: a\n...\nBody.\n')).toEqual({ yaml: 'type: a', body: 'Body.\n' });
  });
});

describe('readers that skip frontmatter use the same closing fence', () => {
  const note = '---\ntype: question\nrationale: |\n  First.\n  ---\n  ## Not a heading\n  Second.\nrelated:: [[x]]\nconcept:\n  - "[[topic]]"\n---\n# Title\n\nBody [[b]].\n';

  it('frontmatterClose ignores an indented fence', () => {
    expect(frontmatterClose(note.split('\n'))).toBe(10);
    expect(frontmatterClose(['no', 'frontmatter'])).toBe(-1);
  });

  // @tg: verifies:: [[openspec:edge-parsing#Frontmatter closing fence#Indented fence in a block scalar]]
  it('parseEdges reads no body edges from frontmatter lines after an indented ---', () => {
    const { edges } = parseEdges(note, 'q.md', { linkEdges: true });
    expect(edges.map((e) => [e.type, e.target])).toEqual([['links_to', 'b']]);
  });

  // @tg: verifies:: [[openspec:edge-parsing#Frontmatter closing fence#Indented fence in a block scalar]]
  it('scanHeadings finds no heading inside the frontmatter', () => {
    expect(scanHeadings(note).map((h) => h.text)).toEqual(['Title']);
  });
});
