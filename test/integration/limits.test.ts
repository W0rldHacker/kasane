import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_KASANE_LIMITS,
  KasaneSecurityError,
  file,
  kasane,
  value,
} from '../../src/index.js';

describe('pipeline limits', () => {
  it('defines immutable security defaults', () => {
    expect(DEFAULT_KASANE_LIMITS).toEqual({
      maxDepth: 64,
      maxNodes: 100_000,
      maxSourceBytes: 10_000_000,
      maxStringLength: 1_000_000,
    });
    expect(Object.isFrozen(DEFAULT_KASANE_LIMITS)).toBe(true);
  });

  it('rejects a large file before invoking its parser', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'kasane-limits-'));
    const filePath = path.join(directory, 'large.json');
    const parse = vi.fn(() => ({ parsed: true }));
    await writeFile(filePath, JSON.stringify({ value: 'x'.repeat(4_096) }));

    try {
      await expect(
        kasane({
          layers: [file('large', filePath, { parse })],
          limits: { maxSourceBytes: 128 },
        }),
      ).rejects.toMatchObject({
        code: 'KASANE_SECURITY_ERROR',
        details: {
          kind: 'source-too-large',
          operation: 'read-file',
          limits: { maxSourceBytes: 128 },
        },
      });
      expect(parse).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('applies limits independently to every source result', async () => {
    await expect(
      kasane({
        layers: [
          value('small', { accepted: true }),
          value('large', { first: 1, second: 2, third: 3 }),
        ],
        limits: { maxNodes: 3 },
      }),
    ).rejects.toBeInstanceOf(KasaneSecurityError);
  });

  it('re-normalizes a huge validator output with invocation limits', async () => {
    await expect(
      kasane({
        layers: [value('input', { accepted: true })],
        limits: { maxNodes: 8 },
        validate() {
          return Array.from({ length: 20 }, (_, index) => index);
        },
      }),
    ).rejects.toMatchObject({
      code: 'KASANE_VALIDATION_ERROR',
      details: { kind: 'invalid-validator-output', operation: 'validate' },
    });
  });

  it('rejects malformed limit options without invoking accessors', async () => {
    let getterCalls = 0;
    const limits = Object.defineProperty({}, 'maxSourceBytes', {
      get() {
        getterCalls += 1;
        return 128;
      },
    });

    await expect(
      kasane({ layers: [value('input', true)], limits }),
    ).rejects.toBeInstanceOf(KasaneSecurityError);
    expect(getterCalls).toBe(0);
  });
});
