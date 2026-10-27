import { describe, expect, it } from 'vitest';
import { coerceInput, fieldSpec, formatInput, fromLinkItems, linkItems, suggestLinks } from '../src';

const prop = (over: Partial<{ kind: 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'link' | 'list'; many: boolean; values: unknown[] | null }>) => ({ kind: 'text' as const, many: false, values: null, ...over });

describe('editing a property', () => {
  // @tg: verifies:: [[tests/graph-ui#Editor chosen by schema]] {since: "2026-10-24", level: unit}
  // @lat: [[tests/graph-ui#Editor chosen by schema]]
  // @tg: verifies:: [[openspec:graph-view#Editable details#Enum property]]
  it('offers a dropdown for an enum property and checkboxes for a list of enum values', () => {
    expect(fieldSpec('To Do', prop({ values: ['To Do', 'Done'] }))).toEqual({ kind: 'enum', options: ['To Do', 'Done'] });
    expect(fieldSpec(['a'], prop({ values: ['a', 'b'], many: true }))).toMatchObject({ kind: 'enum-list' });
    expect(fieldSpec(null, prop({ kind: 'number' })).kind).toBe('number');
    expect(fieldSpec(null, prop({ kind: 'list' })).kind).toBe('list');
    expect(fieldSpec(null, prop({ kind: 'date' })).kind).toBe('date');
  });

  // @tg: verifies:: [[tests/graph-ui#Editor chosen by value]] {since: "2026-10-24", level: unit}
  // @lat: [[tests/graph-ui#Editor chosen by value]]
  // @tg: verifies:: [[openspec:graph-view#Editable details#Undeclared property]]
  it('falls back to the type of the current value without a declaration', () => {
    expect(fieldSpec(3).kind).toBe('number');
    expect(fieldSpec(true).kind).toBe('boolean');
    expect(fieldSpec(['x']).kind).toBe('list');
    expect(fieldSpec('short').kind).toBe('text');
    expect(fieldSpec('x'.repeat(100)).kind).toBe('longtext');
    expect(fieldSpec(null).kind).toBe('text');
  });

  // @tg: verifies:: [[tests/graph-ui#Edited values written back]] {since: "2026-10-24", level: unit}
  // @lat: [[tests/graph-ui#Edited values written back]]
  // @tg: verifies:: [[openspec:graph-view#Editable details#Save an edit]]
  it('turns entries into frontmatter values: numbers, lists, enum members and empty entries', () => {
    expect(coerceInput({ kind: 'number', options: [] }, ' 4.5 ')).toEqual({ ok: true, value: 4.5 });
    expect(coerceInput({ kind: 'number', options: [] }, '')).toEqual({ ok: true, value: null });
    expect(coerceInput({ kind: 'number', options: [] }, 'abc')).toMatchObject({ ok: false });
    expect(coerceInput({ kind: 'list', options: [] }, 'a, b,, c')).toEqual({ ok: true, value: ['a', 'b', 'c'] });
    expect(coerceInput({ kind: 'text', options: [] }, '  ')).toEqual({ ok: true, value: null });
    expect(coerceInput({ kind: 'boolean', options: [] }, true)).toEqual({ ok: true, value: true });
    // Enum values keep their schema type.
    expect(coerceInput({ kind: 'enum', options: [1, 2, 3] }, '2')).toEqual({ ok: true, value: 2 });
    expect(coerceInput({ kind: 'enum', options: ['a'] }, '')).toEqual({ ok: true, value: null });
    expect(coerceInput({ kind: 'enum-list', options: ['a', 'b'] }, ['b'])).toEqual({ ok: true, value: ['b'] });
    expect(formatInput({ kind: 'list', options: [] }, ['a', 'b'])).toBe('a, b');
    expect(formatInput({ kind: 'text', options: [] }, null)).toBe('');
  });

  // @tg: verifies:: [[tests/graph-ui#Link suggestions by type and text]] {since: "2026-10-24", level: unit}
  // @lat: [[tests/graph-ui#Link suggestions by type and text]]
  // @tg: verifies:: [[openspec:graph-view#Editable details#Link suggestions]]
  it('suggests notes of the allowed types whose name contains the typed text, prefix matches first', () => {
    const n = (id: string, labels: string[], title?: string) => ({ id, labels, props: title ? { title } : {}, stub: false });
    const nodes = [n('People/Eulalius.md', ['Person'], 'Eulálius'), n('People/Ruth.md', ['Person']), n('Tasks/Rue task.md', ['Task']), n('People/Bruce.md', ['Person'])];
    expect(suggestLinks(nodes, 'ru', ['Person']).map((x) => x.id)).toEqual(['People/Ruth.md', 'People/Bruce.md']);
    expect(suggestLinks(nodes, 'ru', null).map((x) => x.id)).toEqual(['Tasks/Rue task.md', 'People/Ruth.md', 'People/Bruce.md']);
    expect(suggestLinks(nodes, '', ['Task'])).toHaveLength(1);
    expect(suggestLinks(nodes, 'zzz', null)).toEqual([]);
    expect(linkItems(['[[A]]', '', '[[B]]'])).toEqual(['[[A]]', '[[B]]']);
    expect(linkItems(null)).toEqual([]);
    expect(fromLinkItems(['[[A]]'], false)).toBe('[[A]]');
    expect(fromLinkItems([], false)).toBeNull();
    expect(fromLinkItems([], true)).toEqual([]);
  });
});
