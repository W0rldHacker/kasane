import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import { kasane, secret } from '../../src/index.js';

function rendered(value: unknown): string {
  return `${JSON.stringify(value)}\n${inspect(value, { depth: null, getters: true, showHidden: true })}`;
}

describe('secret-safe snapshot diff', () => {
  it('distinguishes unchanged and changed secrets without plaintext', async () => {
    const unchangedCanary = 'DIFF_UNCHANGED_SECRET_CANARY';
    const changedBeforeCanary = 'DIFF_CHANGED_BEFORE_SECRET_CANARY';
    const changedAfterCanary = 'DIFF_CHANGED_AFTER_SECRET_CANARY';
    const beforeUnchanged = await kasane({
      fingerprintKey: 'diff-fixture-key',
      layers: [secret('old-vault', { token: unchangedCanary })],
    });
    const afterUnchanged = await kasane({
      fingerprintKey: 'diff-fixture-key',
      layers: [secret('new-vault', { token: unchangedCanary })],
    });
    const identical = await kasane({
      fingerprintKey: 'diff-fixture-key',
      layers: [secret('old-vault', { token: unchangedCanary })],
    });
    const beforeChanged = await kasane({
      fingerprintKey: 'diff-fixture-key',
      layers: [secret('vault', { token: changedBeforeCanary })],
    });
    const afterChanged = await kasane({
      fingerprintKey: 'diff-fixture-key',
      layers: [secret('vault', { token: changedAfterCanary })],
    });

    expect(beforeUnchanged.diff(identical)).toEqual({ changes: [] });
    const sourceChange = beforeUnchanged.diff(afterUnchanged);
    expect(sourceChange.changes).toMatchObject([
      {
        after: { value: '[REDACTED]' },
        before: { value: '[REDACTED]' },
        path: 'token',
        type: 'source-changed',
      },
    ]);
    const sourceEntry = sourceChange.changes[0];
    if (sourceEntry?.type !== 'source-changed') {
      throw new Error('Expected source change.');
    }
    expect(sourceEntry.before.fingerprint).toMatch(/^v1:hmac-sha256:/u);
    expect(sourceEntry.before.fingerprint).toBe(sourceEntry.after.fingerprint);

    const valueChange = beforeChanged.diff(afterChanged);
    expect(valueChange.changes).toMatchObject([
      {
        after: { value: '[REDACTED]' },
        before: { value: '[REDACTED]' },
        path: 'token',
        type: 'value-changed',
      },
    ]);
    const valueEntry = valueChange.changes[0];
    if (valueEntry?.type !== 'value-changed') {
      throw new Error('Expected value change.');
    }
    expect(valueEntry.before.fingerprint).not.toBe(
      valueEntry.after.fingerprint,
    );

    const output = `${rendered(sourceChange)}\n${rendered(valueChange)}`;
    expect(output).not.toContain(unchangedCanary);
    expect(output).not.toContain(changedBeforeCanary);
    expect(output).not.toContain(changedAfterCanary);
  });

  it('keeps secret arrays atomic and redacted', async () => {
    const beforeCanary = 'DIFF_ARRAY_BEFORE_SECRET_CANARY';
    const afterCanary = 'DIFF_ARRAY_AFTER_SECRET_CANARY';
    const before = await kasane({
      layers: [secret('vault', { tokens: [beforeCanary, 'shared'] })],
    });
    const after = await kasane({
      layers: [secret('vault', { tokens: [afterCanary, 'shared'] })],
    });

    const diff = before.diff(after);
    expect(diff.changes).toMatchObject([
      {
        after: { value: ['[REDACTED]', '[REDACTED]'] },
        before: { value: ['[REDACTED]', '[REDACTED]'] },
        path: 'tokens',
        type: 'value-changed',
      },
    ]);
    expect(diff.changes[0]).toHaveProperty('after.fingerprint');
    expect(rendered(diff)).not.toContain(beforeCanary);
    expect(rendered(diff)).not.toContain(afterCanary);
  });

  it('retains secret fingerprints but no sources with provenance none', async () => {
    const beforeCanary = 'DIFF_NONE_BEFORE_SECRET_CANARY';
    const afterCanary = 'DIFF_NONE_AFTER_SECRET_CANARY';
    const before = await kasane({
      fingerprintKey: 'diff-none-key',
      layers: [secret('vault', { token: beforeCanary })],
      provenance: 'none',
    });
    const after = await kasane({
      fingerprintKey: 'diff-none-key',
      layers: [secret('vault', { token: afterCanary })],
      provenance: 'none',
    });

    const diff = before.diff(after);
    expect(diff.changes).toMatchObject([
      {
        after: {
          source: { available: false },
          value: '[REDACTED]',
        },
        before: {
          source: { available: false },
          value: '[REDACTED]',
        },
        path: 'token',
        type: 'value-changed',
      },
    ]);
    const entry = diff.changes[0];
    if (entry?.type !== 'value-changed') {
      throw new Error('Expected value change.');
    }
    expect(entry.before.fingerprint).toMatch(/^v1:hmac-sha256:/u);
    expect(entry.after.fingerprint).toMatch(/^v1:hmac-sha256:/u);
    expect(rendered(diff)).not.toContain(beforeCanary);
    expect(rendered(diff)).not.toContain(afterCanary);
  });
});
