import { describe, expect, it } from 'vitest';

import type { ConfigNode } from '../../../src/normalize/types.js';
import {
  createConfigDiff,
  createSecretFingerprintIndex,
} from '../../../src/snapshot/diff.js';
import type { SnapshotDiffInput } from '../../../src/snapshot/diff.js';
import { REDACTED_VALUE } from '../../../src/secrets/redact.js';
import { createProvenanceFixture } from '../builders/provenance.js';

function input(value: ConfigNode): SnapshotDiffInput {
  return { value };
}

describe('pure diff value comparison', () => {
  it.each([
    { left: null, right: null },
    { left: [1, { nested: true }], right: [1, { nested: true }] },
    {
      left: { a: 1, nested: { b: true } },
      right: { nested: { b: true }, a: 1 },
    },
    { left: {}, right: {} },
  ] satisfies readonly Readonly<{ left: ConfigNode; right: ConfigNode }>[])(
    'treats equal fixture %# as unchanged',
    ({ left, right }) => {
      expect(createConfigDiff(input(left), input(right))).toEqual({
        changes: [],
      });
    },
  );

  it.each([
    { left: [1], right: [1, 2] },
    { left: [1, 2], right: [1, 3] },
    { left: [], right: {} },
    { left: null, right: {} },
    { left: { a: 1 }, right: { a: 1, b: 2 } },
    { left: { a: 1 }, right: { b: 1 } },
  ] satisfies readonly Readonly<{ left: ConfigNode; right: ConfigNode }>[])(
    'reports unequal root fixture %#',
    ({ left, right }) => {
      const diff = createConfigDiff(input(left), input(right));
      expect(diff.changes.length).toBeGreaterThan(0);
      expect(diff.changes.every((change) => Object.isFrozen(change))).toBe(
        true,
      );
    },
  );

  it('flattens non-empty object additions/removals but preserves empty objects', () => {
    const empty = createConfigDiff(
      input({}),
      input({ empty: {}, nested: { value: 1 } }),
    );
    expect(empty.changes.map(({ path, type }) => [path, type])).toEqual([
      ['empty', 'added'],
      ['nested.value', 'added'],
    ]);

    const removed = createConfigDiff(
      input({ empty: {}, nested: { value: 1 } }),
      input({}),
    );
    expect(removed.changes.map(({ path, type }) => [path, type])).toEqual([
      ['empty', 'removed'],
      ['nested.value', 'removed'],
    ]);
  });

  it('uses and deeply freezes an explicitly redacted diagnostic tree', () => {
    const before = {
      redactedValue: { nested: { values: [REDACTED_VALUE] } },
      value: { nested: { values: ['fixture-private-before'] } },
    } satisfies SnapshotDiffInput;
    const after = {
      redactedValue: { nested: { values: [REDACTED_VALUE] } },
      value: { nested: { values: ['fixture-private-after'] } },
    } satisfies SnapshotDiffInput;
    const change = createConfigDiff(before, after).changes[0];

    expect(change).toMatchObject({
      after: { value: [REDACTED_VALUE] },
      before: { value: [REDACTED_VALUE] },
      path: 'nested.values',
      type: 'value-changed',
    });
    if (
      change === undefined ||
      change.type === 'added' ||
      change.type === 'removed'
    ) {
      throw new Error('Expected two-sided change');
    }
    expect(Object.isFrozen(change.before.value)).toBe(true);
    expect(
      Object.isFrozen((change.before.value as readonly unknown[])[0]),
    ).toBe(true);
    expect(JSON.stringify(change)).not.toContain('fixture-private');
  });

  it('falls back safely when a supplied redacted tree lacks the changed path', () => {
    const diff = createConfigDiff(
      { redactedValue: {}, value: { token: 'before' } },
      { redactedValue: {}, value: { token: 'after' } },
    );
    expect(diff.changes[0]).toMatchObject({
      after: { value: 'after' },
      before: { value: 'before' },
      path: 'token',
    });
  });
});

describe('secret fingerprint diff index', () => {
  it('indexes every secret container and descendant using canonical paths', () => {
    const fixture = createProvenanceFixture({ kind: 'secret', name: 'secret' });
    const merged = fixture.apply(
      'secret',
      { 'escaped.key': { items: ['first', { token: 'second' }] } },
      undefined,
      { mode: 'origin-only', secret: true },
    );
    const fingerprints = createSecretFingerprintIndex(
      merged.value as ConfigNode,
      merged.provenance,
      'fixture-key',
    );

    expect([...fingerprints.keys()].sort()).toEqual([
      '',
      'escaped\\.key',
      'escaped\\.key.items',
      'escaped\\.key.items.0',
      'escaped\\.key.items.1',
      'escaped\\.key.items.1.token',
    ]);
    expect(new Set(fingerprints.values()).size).toBe(fingerprints.size);
  });

  it('returns no invented fingerprints without provenance', () => {
    expect(
      createSecretFingerprintIndex({ token: 'public' }, undefined).size,
    ).toBe(0);
  });

  it('attaches a supplied fingerprint to the exact changed side', () => {
    const fingerprints = new Map([['token', 'v1:sha256:fixture' as const]]);
    const before = {
      fingerprints,
      redactedValue: { token: REDACTED_VALUE },
      value: { token: 'fixture-before' },
    } satisfies SnapshotDiffInput;
    const after = {
      fingerprints,
      redactedValue: { token: REDACTED_VALUE },
      value: { token: 'fixture-after' },
    } satisfies SnapshotDiffInput;

    expect(createConfigDiff(before, after).changes[0]).toMatchObject({
      after: { fingerprint: 'v1:sha256:fixture', value: REDACTED_VALUE },
      before: { fingerprint: 'v1:sha256:fixture', value: REDACTED_VALUE },
    });
  });
});
