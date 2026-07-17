import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import { kasane, secret, secretValue, value } from '../../src/index.js';

const CANARY = 'EXPLAIN_CANARY\n\u001B[31mSECRET\u001B[0m';

describe('safe explanation diagnostics', () => {
  it('keeps secret current/history values out of objects, JSON, inspect, and format', async () => {
    const snapshot = await kasane({
      layers: [
        value('defaults', {
          credentials: { label: 'visible', token: 'old-public-token' },
        }),
        secret('vault', { credentials: { token: CANARY } }),
      ],
      provenance: 'full',
    });

    const explanation = snapshot.explain('credentials');
    const leaf = snapshot.explain('credentials.token');
    const outputs = [
      JSON.stringify(explanation),
      JSON.stringify(leaf),
      inspect(explanation, {
        colors: true,
        depth: null,
        getters: true,
        showHidden: true,
      }),
      explanation.format(),
      leaf.format(),
    ];
    for (const output of outputs) {
      expect(output).not.toContain('EXPLAIN_CANARY');
      expect(output).not.toContain('old-public-token');
      expect(output).not.toContain('\u001B[31mSECRET');
    }
    expect(explanation).toMatchObject({
      found: true,
      mixed: true,
    });
    if (!explanation.found) throw new Error('Expected found explanation');
    expect(explanation.value).toEqual({
      label: 'visible',
      token: '[REDACTED]',
    });
    if (!leaf.found) throw new Error('Expected found leaf explanation');
    expect(leaf.history?.map((entry) => entry.kind)).toEqual([
      'redacted',
      'redacted',
    ]);
  });

  it('escapes public ANSI controls and formats fields deterministically', async () => {
    const snapshot = await kasane({
      layers: [value('public', { text: '\u001B[32mvisible\u001B[0m' })],
      provenance: 'full',
    });
    const explanation = snapshot.explain('text');
    const first = explanation.format();
    const second = explanation.format();

    expect(first).toBe(second);
    expect(first).not.toContain('\u001B');
    expect(first).toContain('\\u001b[32mvisible\\u001b[0m');
    const topLevelKeys = first
      .split('\n')
      .filter((line) => /^ {2}"[^"]+":/u.test(line))
      .map((line) => line.trim().split(':', 1)[0]);
    expect(topLevelKeys).toEqual([...topLevelKeys].sort());
  });

  it('returns an immutable detached structured value', async () => {
    const snapshot = await kasane<{ nested: { label: string } }>({
      freeze: false,
      layers: [value('public', { nested: { label: 'visible' } })],
    });
    const explanation = snapshot.explain('nested');
    if (!explanation.found) throw new Error('Expected found explanation');

    expect(explanation.value).not.toBe(snapshot.value.nested);
    expect(Object.isFrozen(explanation)).toBe(true);
    expect(Object.isFrozen(explanation.value)).toBe(true);
    expect(() => {
      (explanation.value as { label: string }).label = 'mutated';
    }).toThrow(TypeError);
    expect(snapshot.get('nested.label')).toBe('visible');
  });

  it('redacts without retaining a provenance tree in none mode', async () => {
    const snapshot = await kasane({
      layers: [
        secret('vault', {
          credentials: { label: 'hidden', token: CANARY },
        }),
        value('public-override', {
          credentials: { label: 'visible' },
          marker: secretValue(CANARY),
          policy: CANARY,
        }),
      ],
      provenance: 'none',
      secrets: ['policy'],
    });
    const explanation = snapshot.explain('credentials');

    expect(snapshot.origin('credentials.token')).toBeUndefined();
    expect(explanation).toMatchObject({
      found: true,
      value: { label: 'visible', token: '[REDACTED]' },
    });
    expect('origin' in explanation).toBe(false);
    expect(snapshot.explain('marker')).toMatchObject({
      found: true,
      value: '[REDACTED]',
    });
    expect(snapshot.explain('policy')).toMatchObject({
      found: true,
      value: '[REDACTED]',
    });
    for (const output of [
      JSON.stringify(snapshot),
      inspect(snapshot, { depth: null, showHidden: true }),
      JSON.stringify(explanation),
      inspect(explanation, { depth: null, showHidden: true }),
      explanation.format(),
    ]) {
      expect(output).not.toContain('EXPLAIN_CANARY');
      expect(output).not.toContain('hidden');
    }
  });
});
