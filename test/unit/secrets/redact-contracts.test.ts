import { describe, expect, it, vi } from 'vitest';

import { createOriginRecord } from '../../../src/provenance/origin.js';
import {
  createLeafProvenanceNode,
  createProvenanceTree,
  createTombstoneProvenanceNode,
} from '../../../src/provenance/tree.js';
import { createSecretPathMatcher } from '../../../src/secrets/matcher.js';
import { REDACTED_VALUE, Redactor } from '../../../src/secrets/redact.js';
import { createProvenanceFixture } from '../builders/provenance.js';

const markers = {
  circular: '[CIRCULAR]',
  removed: '[REMOVED]',
  truncated: '[TRUNCATED]',
  uninspectable: '[UNINSPECTABLE]',
  unsupported: '[UNSUPPORTED]',
} as const;

describe('Redactor primitive and resource contracts', () => {
  it.each([
    { expected: null, input: null },
    { expected: true, input: true },
    { expected: 42, input: 42 },
    { expected: markers.unsupported, input: Number.NaN },
    { expected: markers.unsupported, input: Number.POSITIVE_INFINITY },
    { expected: 'abc', input: 'abc' },
    { expected: markers.unsupported, input: undefined },
    { expected: markers.unsupported, input: 1n },
    { expected: markers.unsupported, input: Symbol('fixture') },
    { expected: markers.unsupported, input: () => undefined },
  ])(
    'converts $input without invoking user formatting',
    ({ expected, input }) => {
      expect(new Redactor({ maxStringLength: 3 }).redact(input)).toBe(expected);
    },
  );

  it('applies every limit at its exact boundary and at boundary + 1', () => {
    expect(new Redactor({ maxStringLength: 3 }).redact('abcd')).toBe(
      `abc${markers.truncated}`,
    );
    expect(new Redactor({ maxDepth: 0 }).redact({ nested: true })).toBe(
      markers.truncated,
    );
    expect(new Redactor({ maxVisitedNodes: 0 }).redact(true)).toBe(
      markers.truncated,
    );
    expect(new Redactor({ maxArrayLength: 1 }).redact([1, 2])).toEqual([
      1,
      markers.truncated,
    ]);
    expect(new Redactor({ maxObjectKeys: 1 }).redact({ b: 2, a: 1 })).toEqual({
      '[TRUNCATED]': 1,
      a: 1,
    });
  });

  it.each([
    { limits: { maxDepth: -1 }, value: { nested: true } },
    { limits: { maxDepth: 1.5 }, value: { nested: true } },
    {
      limits: { maxDepth: Number.MAX_SAFE_INTEGER + 1 },
      value: { nested: true },
    },
  ])('falls back for invalid numeric limit $limits', ({ limits, value }) => {
    expect(new Redactor(limits).redact(value)).toEqual(value);
  });

  it('is cycle-safe but permits a shared non-ancestor object', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(new Redactor().redact(circular)).toEqual({
      self: markers.circular,
    });

    const shared = { value: true };
    expect(new Redactor().redact({ first: shared, second: shared })).toEqual({
      first: { value: true },
      second: { value: true },
    });
  });
});

describe('Redactor policy and provenance contracts', () => {
  it('redacts exact, wildcard, escaped, inherited, and throwing policies', () => {
    const policy = createSecretPathMatcher([
      'accounts.*.token',
      'literal\\.key',
      'slash\\\\key',
    ]);
    const input = {
      accounts: {
        first: { public: 'visible', token: 'fixture-secret-one' },
        second: { token: 'fixture-secret-two' },
      },
      'literal.key': 'fixture-secret-three',
      'slash\\key': 'fixture-secret-four',
    };
    expect(new Redactor().redact(input, { policy })).toEqual({
      accounts: {
        first: { public: 'visible', token: REDACTED_VALUE },
        second: { token: REDACTED_VALUE },
      },
      'literal.key': REDACTED_VALUE,
      'slash\\key': REDACTED_VALUE,
    });
    expect(
      new Redactor().redact('fixture-secret-five', {
        policy: {
          matches() {
            throw new Error('policy failure');
          },
        },
      }),
    ).toBe(REDACTED_VALUE);
  });

  it.each([
    { expected: markers.removed, secret: false },
    { expected: REDACTED_VALUE, secret: true },
  ])('renders a secret=$secret tombstone safely', ({ expected, secret }) => {
    const fixture = createProvenanceFixture({ name: 'cleanup' });
    const removal = createOriginRecord(
      fixture.registry,
      fixture.layer('cleanup').id,
      { operation: 'remove', scope: 'tombstone', secret },
    );
    const provenance = createProvenanceTree(
      createTombstoneProvenanceNode(removal),
    );

    expect(new Redactor().redact(undefined, { provenance })).toBe(expected);
  });

  it('redacts normalized arrays and objects using provenance inheritance', () => {
    const fixture = createProvenanceFixture(
      { name: 'public' },
      { kind: 'secret', name: 'private' },
    );
    const first = fixture.apply('public', {
      public: 'visible',
      values: ['public-item'],
    });
    const second = fixture.apply(
      'private',
      { private: { token: 'fixture-private-token' } },
      first,
      { secret: true },
    );
    if (second.provenance === undefined) throw new Error('Missing provenance');

    const output = new Redactor().redactNormalizedWithProvenance(
      second.value,
      second.provenance,
      createSecretPathMatcher(['values']),
    );
    expect(output).toEqual({
      private: { token: REDACTED_VALUE },
      public: 'visible',
      values: [REDACTED_VALUE],
    });
  });

  it('redacts normalized merge controls and honors the preserve predicate', () => {
    const preserved = Object.freeze({ marker: true });
    const matcher = createSecretPathMatcher(['array.0', 'nested.token']);
    const input = {
      array: ['fixture-secret'],
      nested: { public: 'visible', token: 'fixture-secret' },
      preserved,
    };
    const output = new Redactor().redactNormalized(
      input,
      matcher,
      (value) => value === preserved,
    );

    expect(output).toEqual({
      array: [REDACTED_VALUE],
      nested: { public: 'visible', token: REDACTED_VALUE },
      preserved,
    });
    expect((output as { preserved: unknown }).preserved).toBe(preserved);
  });

  it('uses leaf provenance when the root itself is secret', () => {
    const fixture = createProvenanceFixture({ name: 'secret' });
    const origin = createOriginRecord(
      fixture.registry,
      fixture.layer('secret').id,
      { operation: 'set', scope: 'leaf', secret: true },
    );
    const provenance = createProvenanceTree(createLeafProvenanceNode(origin));
    expect(
      new Redactor().redactNormalizedWithProvenance(
        'fixture-secret',
        provenance,
      ),
    ).toBe(REDACTED_VALUE);
  });

  it('falls back to inherited public state when provenance is absent', () => {
    expect(
      new Redactor().redactNormalizedWithProvenance(
        { nested: ['visible'] },
        createProvenanceTree(),
      ),
    ).toEqual({ nested: ['visible'] });
  });
});

describe('Redactor hostile descriptor contracts', () => {
  it.each([
    {
      expected: markers.uninspectable,
      detector: () => true,
      name: 'detected unsafe object',
    },
    {
      expected: markers.uninspectable,
      detector: () => {
        throw new Error('detector failure');
      },
      name: 'throwing unsafe detector',
    },
  ])('$name is never traversed', ({ detector, expected }) => {
    let calls = 0;
    const input = new Proxy(
      {},
      {
        ownKeys() {
          calls += 1;
          return [];
        },
      },
    );
    expect(new Redactor({ unsafeObject: detector }).redact(input)).toBe(
      expected,
    );
    expect(calls).toBe(0);
  });

  it('handles array detection and object enumeration failures', () => {
    const arrayCheck = vi.spyOn(Array, 'isArray').mockImplementationOnce(() => {
      throw new Error('array detection failed');
    });
    expect(new Redactor().redact({ value: true })).toBe(markers.uninspectable);
    arrayCheck.mockRestore();

    const uninspectable = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('ownKeys failed');
        },
      },
    );
    expect(new Redactor().redact(uninspectable)).toBe(markers.uninspectable);
  });

  it.each([
    { descriptor: undefined, name: 'absent length' },
    {
      descriptor: { configurable: true, enumerable: false, get: () => 1 },
      name: 'accessor length',
    },
    {
      descriptor: { configurable: true, enumerable: false, value: '1' },
      name: 'non-number length',
    },
    {
      descriptor: { configurable: true, enumerable: false, value: -1 },
      name: 'negative length',
    },
    {
      descriptor: { configurable: true, enumerable: false, value: 1.5 },
      name: 'fractional length',
    },
  ])('rejects $name from an array-like hostile object', ({ descriptor }) => {
    const arrayCheck = vi.spyOn(Array, 'isArray').mockReturnValueOnce(true);
    const input = new Proxy(
      {},
      {
        getOwnPropertyDescriptor(_target, key) {
          return key === 'length' ? descriptor : undefined;
        },
      },
    );
    expect(new Redactor().redact(input)).toBe(markers.uninspectable);
    arrayCheck.mockRestore();
  });

  it('distinguishes dense, sparse, accessor, and uninspectable array items', () => {
    const accessor = [1];
    Object.defineProperty(accessor, '0', {
      configurable: true,
      enumerable: true,
      get: () => 'must-not-run',
    });
    const throwing = new Proxy([1], {
      getOwnPropertyDescriptor(target, key) {
        if (key === '0') throw new Error('item descriptor failed');
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });

    expect(new Redactor().redact([1])).toEqual([1]);
    expect(new Redactor().redact(Array(1))).toEqual([markers.unsupported]);
    expect(new Redactor().redact(accessor)).toEqual([markers.unsupported]);
    expect(new Redactor().redact(throwing)).toEqual([markers.uninspectable]);
  });

  it('does not read a descriptor that changes after key enumeration', () => {
    let calls = 0;
    const changing = new Proxy(
      { value: 'fixture-secret' },
      {
        getOwnPropertyDescriptor(target, key) {
          calls += 1;
          if (calls > 1) throw new Error('descriptor changed');
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    expect(new Redactor().redact(changing)).toEqual({
      value: markers.uninspectable,
    });
  });
});
