import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { pathResolver, validateVault, type NoteInput } from '../src/index.js';

const paths = ['topics/thiopentone.md', 'topics/sub/q.md', 'objectives/P1.i.md', 'objectives/P1.i.adoc', 'book/ch01.adoc', 'notes/a.md'];
const resolve = pathResolver(() => paths);

describe('pathResolver relative links (#15)', () => {
  it('resolves ../ against the source note folder', () => {
    expect(resolve('../thiopentone', 'topics/sub/q.md')).toBe('topics/thiopentone.md');
    expect(resolve('../../notes/a', 'topics/sub/q.md')).toBe('notes/a.md');
  });

  it('resolves ./ and mixed ./.. segments', () => {
    expect(resolve('./q', 'topics/sub/q.md')).toBe('topics/sub/q.md');
    expect(resolve('./../thiopentone', 'topics/sub/q.md')).toBe('topics/thiopentone.md');
    expect(resolve('../sub/./q', 'topics/sub/q.md')).toBe('topics/sub/q.md');
  });

  it('keeps explicit extensions and reports bare relative links matching both formats as ambiguous', () => {
    expect(resolve('../../book/ch01.adoc', 'topics/sub/q.md')).toBe('book/ch01.adoc');
    expect(resolve('../../objectives/P1.i.md', 'topics/sub/q.md')).toBe('objectives/P1.i.md');
    expect(resolve('../../objectives/P1.i', 'topics/sub/q.md')).toBeNull();
    expect(resolve.ambiguous?.('../../objectives/P1.i', 'topics/sub/q.md')).toEqual(['objectives/P1.i.md', 'objectives/P1.i.adoc']);
  });

  it('does not fall back to suffix matching or escape the vault root', () => {
    expect(resolve('../thiopentone', 'q-at-root.md')).toBeNull();
    expect(resolve('../../../notes/a', 'topics/sub/q.md')).toBeNull();
    expect(resolve('./thiopentone', 'topics/sub/q.md')).toBeNull();
  });

  it('leaves bare and vault-path links unchanged', () => {
    expect(resolve('thiopentone', 'topics/sub/q.md')).toBe('topics/thiopentone.md');
    expect(resolve('notes/a', 'topics/sub/q.md')).toBe('notes/a.md');
  });
});

describe('validateVault with relative frontmatter links (#15)', () => {
  // Frontmatter arrives pre-parsed, as `readNote` in node-vault supplies it to the CLI.
  const note = (path: string, content: string): NoteInput => ({ path, text: content, frontmatter: parseYaml(content.split('---\n')[1]!) });
  const notes: NoteInput[] = [
    note('Types/Schema.md', '---\ntgs: "0.6"\nedgeTypes:\n  concept: {from: question, to: concept}\n---\n'),
    note('topics/thiopentone.md', '---\ntype: concept\n---\n'),
    note('objectives/P1.i.md', '---\ntype: objective\n---\n'),
    note('topics/sub/q-relative.md', '---\ntype: question\nconcept:\n  - "[[../../objectives/P1.i]]"\n---\n'),
    note('topics/sub/q-root.md', '---\ntype: question\nconcept:\n  - "[[objectives/P1.i]]"\n---\n'),
    note('topics/sub/q-relative-ok.md', '---\ntype: question\nconcept:\n  - "[[./../thiopentone]]"\n---\n'),
  ];

  it('checks the target type of a relative link like any other link', () => {
    const wrong = validateVault(notes, { frontmatterEdges: true, parseYaml })
      .filter((f) => f.code === 'wrong-target-type')
      .map((f) => f.path)
      .sort();
    expect(wrong).toEqual(['topics/sub/q-relative.md', 'topics/sub/q-root.md']);
  });
});
