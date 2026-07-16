import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('dependency boundary', () => {
  it('has no runtime dependencies or lifecycle install scripts', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(Object.keys(packageJson.dependencies ?? {})).toEqual([]);
    expect(packageJson.scripts?.['preinstall']).toBeUndefined();
    expect(packageJson.scripts?.['install']).toBeUndefined();
    expect(packageJson.scripts?.['postinstall']).toBeUndefined();
  });
});
