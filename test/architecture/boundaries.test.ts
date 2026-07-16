import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

describe('architecture boundaries', () => {
  it('passes the repository architecture check', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/architecture-check.mjs'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Architecture check passed');
    expect(result.status).toBe(0);
  });
});
