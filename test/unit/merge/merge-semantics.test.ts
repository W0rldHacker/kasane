import { describe, expect, it } from 'vitest';

import { KasaneMergeError } from '../../../src/index.js';
import {
  MERGE_STRATEGIES,
  configNodeKind,
  createMergeRuleIndex,
  isMergeStrategy,
  resolveMergeDecision,
} from '../../../src/merge/index.js';
import type {
  ExistingValueKind,
  IncomingValueKind,
  MergeOutcome,
  MergeStrategy,
} from '../../../src/merge/index.js';

const incomingKinds = [
  'undefined',
  'remove',
  'null',
  'boolean',
  'number',
  'string',
  'array',
  'object',
] as const satisfies readonly IncomingValueKind[];

const defaultRows = [
  {
    existing: 'absent',
    outcomes: ['no-op', 'remove', 'set', 'set', 'set', 'set', 'set', 'set'],
  },
  {
    existing: 'null',
    outcomes: [
      'no-op',
      'remove',
      'replace',
      'replace',
      'replace',
      'replace',
      'replace',
      'replace',
    ],
  },
  {
    existing: 'boolean',
    outcomes: [
      'no-op',
      'remove',
      'replace',
      'replace',
      'replace',
      'replace',
      'replace',
      'replace',
    ],
  },
  {
    existing: 'number',
    outcomes: [
      'no-op',
      'remove',
      'replace',
      'replace',
      'replace',
      'replace',
      'replace',
      'replace',
    ],
  },
  {
    existing: 'string',
    outcomes: [
      'no-op',
      'remove',
      'replace',
      'replace',
      'replace',
      'replace',
      'replace',
      'replace',
    ],
  },
  {
    existing: 'array',
    outcomes: [
      'no-op',
      'remove',
      'replace',
      'replace',
      'replace',
      'replace',
      'replace',
      'replace',
    ],
  },
  {
    existing: 'object',
    outcomes: [
      'no-op',
      'remove',
      'replace',
      'replace',
      'replace',
      'replace',
      'replace',
      'merge',
    ],
  },
] as const satisfies readonly {
  readonly existing: ExistingValueKind;
  readonly outcomes: readonly MergeOutcome[];
}[];

const defaultCells = defaultRows.flatMap((row) =>
  incomingKinds.map((incoming, index) => ({
    existing: row.existing,
    expected: row.outcomes[index],
    incoming,
  })),
);

const explicitCases = [
  ['replace', 'object', 'array', 'replace'],
  ['replace', 'null', 'object', 'replace'],
  ['merge', 'object', 'object', 'merge'],
  ['merge', 'array', 'object', 'merge-requires-object-pair'],
  ['append', 'array', 'array', 'append'],
  ['append', 'array', 'object', 'append-requires-array-pair'],
  ['prepend', 'array', 'array', 'prepend'],
  ['prepend', 'string', 'array', 'prepend-requires-array-pair'],
] as const satisfies readonly (readonly [
  MergeStrategy,
  ExistingValueKind,
  IncomingValueKind,
  string,
])[];

function captureMergeError(run: () => unknown): KasaneMergeError {
  try {
    run();
  } catch (error) {
    if (error instanceof KasaneMergeError) return error;
    throw error;
  }

  throw new Error('Expected merge semantics validation to fail');
}

describe('default merge decision table', () => {
  it('contains every normalized old/incoming combination', () => {
    expect(defaultCells).toHaveLength(7 * 8);
    expect(new Set(defaultRows.map((row) => row.existing)).size).toBe(7);
    expect(new Set(incomingKinds).size).toBe(8);
  });

  it.each(defaultCells)(
    '$existing + $incoming resolves to $expected',
    ({ existing, expected, incoming }) => {
      expect(resolveMergeDecision(existing, incoming)).toEqual({
        outcome: expected,
      });
    },
  );

  it('classifies all canonical ConfigNode runtime kinds', () => {
    expect([
      configNodeKind(null),
      configNodeKind(true),
      configNodeKind(1),
      configNodeKind('value'),
      configNodeKind([]),
      configNodeKind({}),
    ]).toEqual(['null', 'boolean', 'number', 'string', 'array', 'object']);
  });
});

describe('explicit merge strategies', () => {
  it.each(explicitCases)(
    '%s with %s/%s resolves deterministically',
    (strategy, existing, incoming, expected) => {
      const decision = resolveMergeDecision(existing, incoming, strategy);
      if (decision.outcome === 'error') {
        expect(decision.reason).toBe(expected);
      } else {
        expect(decision.outcome).toBe(expected);
      }
    },
  );

  it('resolves undefined, remove, and absent before rule application', () => {
    expect(resolveMergeDecision('array', 'undefined', 'append')).toEqual({
      outcome: 'no-op',
    });
    expect(resolveMergeDecision('object', 'remove', 'merge')).toEqual({
      outcome: 'remove',
    });
    expect(resolveMergeDecision('absent', 'array', 'append')).toEqual({
      outcome: 'set',
    });
  });

  it('contains no remove strategy or custom callback', () => {
    expect(MERGE_STRATEGIES).toEqual(['replace', 'merge', 'append', 'prepend']);
    expect(isMergeStrategy('remove')).toBe(false);
    expect(isMergeStrategy(() => undefined)).toBe(false);
    expect(Object.isFrozen(MERGE_STRATEGIES)).toBe(true);
  });
});

describe('exact merge rule index', () => {
  it('matches an escaped canonical path exactly', () => {
    const index = createMergeRuleIndex([
      { path: 'a\\.b.items', strategy: 'append' },
      { path: '', strategy: 'merge' },
    ]);

    expect(index.size).toBe(2);
    expect(index.get('a\\.b.items')).toBe('append');
    expect(index.get('a.b.items')).toBeUndefined();
    expect(index.get('a\\.b')).toBeUndefined();
    expect(index.get('')).toBe('merge');
    expect(Object.isFrozen(index)).toBe(true);
  });

  it('does not interpret star segments or parent paths as patterns', () => {
    const index = createMergeRuleIndex([
      { path: 'plugins.*', strategy: 'replace' },
    ]);

    expect(index.get('plugins.*')).toBe('replace');
    expect(index.get('plugins.auth')).toBeUndefined();
    expect(index.get('plugins')).toBeUndefined();
  });

  it('rejects duplicate normalized paths during startup', () => {
    const error = captureMergeError(() =>
      createMergeRuleIndex([
        { path: 'database.replicas', strategy: 'append' },
        { path: 'database.replicas', strategy: 'replace' },
      ]),
    );

    expect(error).toMatchObject({
      code: 'KASANE_MERGE_ERROR',
      details: {
        kind: 'duplicate-merge-rule',
        operation: 'index-merge-rules',
        path: 'database.replicas',
      },
    });
  });

  it.each(['.root', 'root.', 'a..b', 'a\\', 'a\\q'])(
    'rejects malformed rule path %s',
    (path) => {
      expect(() =>
        createMergeRuleIndex([{ path, strategy: 'replace' }]),
      ).toThrow(KasaneMergeError);
    },
  );
});
