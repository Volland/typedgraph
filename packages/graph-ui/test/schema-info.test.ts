import type { TypeSchema } from '@obsigraph/core';
import { describe, expect, it } from 'vitest';
import { schemaInfo } from '../src';

const type = (name: string, over: Partial<TypeSchema>): TypeSchema => ({ type: name, path: '', properties: [], edges: null, style: null, uri: null, template: null, bodyIsTemplate: false, ids: [], ...over });

describe('schema info', () => {
  // @tg: verifies:: [[tests/graph-ui#Schema info of a type]] {since: "2026-10-24", level: unit}
  // @lat: [[tests/graph-ui#Schema info of a type]]
  it('lists properties with data type and cardinality, outgoing edges and who may point at the type', () => {
    const task = type('Task', {
      properties: [
        { name: 'status', kind: 'text', default: null, required: true, many: false, values: ['To Do', 'Done'], uri: null },
        { name: 'tags', kind: 'list', default: null, required: false, many: true, values: null, uri: null },
      ],
      edges: [{ type: 'assignee', targets: ['Person'], many: false, required: true }],
    });
    const person = type('Person', { edges: [{ type: 'owns', targets: ['Task'], many: true, required: false }] });
    const info = schemaInfo(task, [task, person]);
    expect(info.properties).toEqual([
      { name: 'status', type: 'enum', cardinality: '1..1', values: ['To Do', 'Done'], default: null },
      { name: 'tags', type: 'list', cardinality: '0..*', values: [], default: null },
    ]);
    expect(info.outgoing).toEqual([{ type: 'assignee', targets: ['Person'], cardinality: '1..1' }]);
    expect(info.incoming).toEqual([{ type: 'owns', from: ['Person'] }]);
    expect(info.unrestricted).toBe(false);
    expect(schemaInfo(person, [person]).incoming).toEqual([]);
  });

  // @tg: verifies:: [[tests/graph-ui#Schema info of a type]] {since: "2026-10-24", level: unit}
  // @lat: [[tests/graph-ui#Schema info of a type]]
  it('also reads the edge type declarations', () => {
    const task = type('Task', { edges: [{ type: 'assignee', targets: null, many: false, required: false }] });
    const person = type('Person', { edges: [] });
    const edge = (name: string, from: string[] | null, to: string[] | null) => ({ type: name, path: '', from, to, properties: [], uri: null, style: null });
    const declared = [edge('assignee', ['Task'], ['Person']), edge('blocks', ['Task'], ['Task']), edge('related', null, null), edge('owner', ['Person'], ['Task'])];
    const info = schemaInfo(task, [task, person], declared);
    expect(info.outgoing).toEqual([
      { type: 'assignee', targets: ['Person'], cardinality: '0..1' },
      { type: 'blocks', targets: ['Task'], cardinality: null },
    ]);
    expect(info.incoming).toEqual([
      { type: 'blocks', from: ['Task'] },
      { type: 'owner', from: ['Person'] },
    ]);
    expect(schemaInfo(person, [task, person], declared).incoming).toEqual([{ type: 'assignee', from: ['Task'] }]);
    // Without rules of its own a type may use every edge type that has no source restriction.
    expect(schemaInfo(type('Free', {}), [], declared).outgoing.map((e) => e.type)).toEqual(['related']);
  });
});
