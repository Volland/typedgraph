import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { splitFrontmatter } from '../src/index.js';

describe('splitFrontmatter closing fence', () => {
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

  it('still closes at a column-0 fence with trailing spaces or tabs', () => {
    expect(splitFrontmatter('---\ntype: a\n--- \t\nBody.\n')).toEqual({ yaml: 'type: a', body: 'Body.\n' });
    expect(splitFrontmatter('---\ntype: a\n...\nBody.\n')).toEqual({ yaml: 'type: a', body: 'Body.\n' });
  });
});
