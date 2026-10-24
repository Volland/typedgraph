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
      { name: 'status', type: 'enum (To Do, Done)', cardinality: '1..1' },
      { name: 'tags', type: 'list', cardinality: '0..*' },
    ]);
    expect(info.outgoing).toEqual([{ type: 'assignee', targets: ['Person'], cardinality: '1..1' }]);
    expect(info.incoming).toEqual([{ type: 'owns', from: ['Person'] }]);
    expect(info.unrestricted).toBe(false);
    expect(schemaInfo(person, [person]).incoming).toEqual([]);
  });
});
