import { describe, expect, it } from 'vitest';

import { kasane, value } from '../../src/index.js';
import { sourceMetadata } from '../../src/sources/index.js';

describe('source-aware snapshot diff', () => {
  it('emits all five mutually exclusive change types in path order', async () => {
    const before = await kasane({
      layers: [
        value('shared', { removed: 'gone', valueOnly: 1 }),
        value('old-source', { both: 'before', sourceOnly: 7 }),
      ],
    });
    const after = await kasane({
      layers: [
        value('shared', { added: 'new', valueOnly: 2 }),
        value('new-source', { both: 'after', sourceOnly: 7 }),
      ],
    });
    const beforeValue = JSON.stringify(before.value);
    const afterValue = JSON.stringify(after.value);

    const diff = before.diff(after);

    expect(diff.changes.map((change) => [change.path, change.type])).toEqual([
      ['added', 'added'],
      ['both', 'value-and-source-changed'],
      ['removed', 'removed'],
      ['sourceOnly', 'source-changed'],
      ['valueOnly', 'value-changed'],
    ]);
    const added = diff.changes[0];
    const removed = diff.changes[2];
    expect(added).toMatchObject({
      after: {
        source: { available: true, kind: 'value', name: 'shared' },
        value: 'new',
      },
      type: 'added',
    });
    expect(added).not.toHaveProperty('before');
    expect(removed).toMatchObject({
      before: { value: 'gone' },
      type: 'removed',
    });
    expect(removed).not.toHaveProperty('after');
    expect(JSON.stringify(before.value)).toBe(beforeValue);
    expect(JSON.stringify(after.value)).toBe(afterValue);
    expect(Object.isFrozen(diff)).toBe(true);
    expect(Object.isFrozen(diff.changes)).toBe(true);
  });

  it('compares stable source identity instead of registry layer ids', async () => {
    const before = await kasane({
      layers: [value('stable-source', { answer: 42 })],
    });
    const after = await kasane({
      layers: [value('id-padding', {}), value('stable-source', { answer: 42 })],
    });

    expect(before.origin('answer')?.layer.id).not.toBe(
      after.origin('answer')?.layer.id,
    );
    expect(before.diff(after)).toEqual({ changes: [] });
  });

  it('includes the safe source reference in stable identity', async () => {
    const referencedLayer = (reference: string) => ({
      name: 'configuration',
      source: {
        kind: 'custom',
        load: () => ({ answer: 42 }),
        [sourceMetadata]: () => ({ reference }),
      },
    });
    const before = await kasane({ layers: [referencedLayer('first-input')] });
    const after = await kasane({ layers: [referencedLayer('second-input')] });

    expect(before.diff(after).changes).toMatchObject([
      {
        after: {
          source: { name: 'configuration', reference: 'second-input' },
        },
        before: {
          source: { name: 'configuration', reference: 'first-input' },
        },
        path: 'answer',
        type: 'source-changed',
      },
    ]);
  });

  it('treats arrays as atomic values', async () => {
    const before = await kasane({
      layers: [value('input', { items: [1, 2] })],
    });
    const after = await kasane({
      layers: [value('input', { items: [0, 1, 2] })],
    });

    expect(before.diff(after).changes).toEqual([
      {
        after: {
          source: { available: true, kind: 'value', name: 'input' },
          value: [0, 1, 2],
        },
        before: {
          source: { available: true, kind: 'value', name: 'input' },
          value: [1, 2],
        },
        path: 'items',
        type: 'value-changed',
      },
    ]);
  });

  it('marks sources unavailable when provenance is none', async () => {
    const before = await kasane({
      layers: [value('old-source', { answer: 1 })],
      provenance: 'none',
    });
    const sameValue = await kasane({
      layers: [value('new-source', { answer: 1 })],
      provenance: 'none',
    });
    const changed = await kasane({
      layers: [value('new-source', { answer: 2 })],
      provenance: 'none',
    });

    expect(before.diff(sameValue)).toEqual({ changes: [] });
    expect(before.diff(changed).changes).toMatchObject([
      {
        after: { source: { available: false }, value: 2 },
        before: { source: { available: false }, value: 1 },
        path: 'answer',
        type: 'value-changed',
      },
    ]);
  });

  it('keeps schema-transformed paths attributed to their input source', async () => {
    const before = await kasane({
      layers: [value('input', { port: '3000' })],
      validate(input) {
        return { port: Number((input as { port: string }).port) };
      },
    });
    const after = await kasane({
      layers: [value('input', { port: '8080' })],
      validate(input) {
        return { port: Number((input as { port: string }).port) };
      },
    });

    expect(before.diff(after).changes).toMatchObject([
      {
        after: { source: { name: 'input' }, value: 8080 },
        before: { source: { name: 'input' }, value: 3000 },
        path: 'port',
        type: 'value-changed',
      },
    ]);
  });
});
