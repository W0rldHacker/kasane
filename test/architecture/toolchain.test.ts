import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const fixtureUrl = new URL('../fixtures/toolchain/', import.meta.url);

describe('toolchain failure probes', () => {
  it('rejects an intentional TypeScript error', () => {
    const tscPath = fileURLToPath(
      new URL('../../node_modules/typescript/bin/tsc', import.meta.url),
    );
    const fixtureConfig = fileURLToPath(new URL('tsconfig.json', fixtureUrl));
    const result = spawnSync(process.execPath, [tscPath, '-p', fixtureConfig], {
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('TS2322');
  });

  it('rejects an explicit unsafe any', async () => {
    const source = await readFile(new URL('unsafe-any.ts', fixtureUrl), 'utf8');
    const eslint = new ESLint({ overrideConfigFile: 'eslint.config.js' });
    const [result] = await eslint.lintText(source, {
      filePath: 'test/architecture/unsafe-any.probe.ts',
    });

    expect(
      result?.messages.some(
        ({ ruleId }) => ruleId === '@typescript-eslint/no-explicit-any',
      ),
    ).toBe(true);
  }, 15_000);
});
