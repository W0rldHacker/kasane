import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('package foundation', () => {
  it('declares the supported runtime and ESM mode', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      engines?: { node?: string };
      type?: string;
    };

    expect(packageJson.type).toBe('module');
    expect(packageJson.engines?.node).toBe('>=22');
  });
});
