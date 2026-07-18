import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_KASANE_LIMITS,
  KasaneSecurityError,
  file,
  kasane,
  value,
} from '../../src/index.js';
import { withTempWorkspace } from './helpers/temp-workspace.js';

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
    await withTempWorkspace(async (workspace) => {
      const filePath = await workspace.writeJson('large.json', {
        value: 'x'.repeat(4_096),
      });
      const parse = vi.fn(() => ({ parsed: true }));

      await expect(
        kasane({
          cwd: workspace.cwd,
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
    });
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
