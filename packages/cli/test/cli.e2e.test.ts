import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const binary = path.join(packageRoot, 'dist', 'bin.js');
const fixtures = path.join(packageRoot, 'test', 'fixtures');
const base = path.join(fixtures, 'base');
const secretCanaries = ['POST_003_SECRET_CANARY_A', 'POST_003_SECRET_CANARY_B'];
const cleanup: string[] = [];

afterEach(async () => {
  for (const directory of cleanup.splice(0)) {
    await rm(directory, { force: true, recursive: true });
  }
});

function cli(arguments_: readonly string[], cwd = base) {
  return spawnSync(process.execPath, [binary, ...arguments_], {
    cwd,
    encoding: 'utf8',
  });
}

function expectSecretSafe(output: string): void {
  for (const canary of secretCanaries) expect(output).not.toContain(canary);
}

describe('@worldhacker/kasane-cli end-to-end diagnostics', () => {
  it('explains a path and reports a missing path with its stable exit code', () => {
    const found = cli(['explain', 'server.port']);
    expect(found.status).toBe(0);
    expect(found.stdout).toContain('server.port');
    expect(found.stdout).toContain('3000');

    const missing = cli(['--json', 'explain', 'server.missing']);
    expect(missing.status).toBe(4);
    expect(missing.stderr).toBe('');
    expect(JSON.parse(missing.stdout)).toMatchObject({
      error: {
        code: 'KASANE_CLI_PATH_MISSING',
        details: { nearest: 'server', path: 'server.missing' },
      },
      ok: false,
      schema: '@worldhacker/kasane-cli-output',
      schemaVersion: 1,
    });
  });

  it('keeps explain, print, diff, and sources secret-safe', () => {
    for (const arguments_ of [
      ['explain', 'token'],
      ['print'],
      ['sources'],
      ['diff', 'other.config.json'],
    ]) {
      const result = cli(arguments_);
      expect(result.status, result.stderr).toBe(0);
      expectSecretSafe(`${result.stdout}${result.stderr}`);
    }
    expect(cli(['print']).stdout).toContain('[REDACTED]');
    expect(cli(['explain', 'token']).stdout).toContain('[REDACTED]');
    expect(cli(['diff', 'other.config.json']).stdout).toContain('[REDACTED]');
    expect(cli(['sources']).stdout).toContain('[secret]');
  });

  it('emits one versioned JSON document for every machine command', () => {
    for (const arguments_ of [
      ['--json', 'print'],
      ['--json', 'explain', 'server.port'],
      ['--json', 'sources'],
      ['--json', 'diff', 'other.config.json'],
    ]) {
      const result = cli(arguments_);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toBe('');
      const document = JSON.parse(result.stdout) as unknown;
      expect(document).toMatchObject({
        ok: true,
        schema: '@worldhacker/kasane-cli-output',
        schemaVersion: 1,
      });
      expectSecretSafe(result.stdout);
    }
  });

  it('rejects invalid config and never executes JavaScript config', async () => {
    const invalid = cli(['print'], path.join(fixtures, 'invalid'));
    expect(invalid.status).toBe(3);
    expect(invalid.stderr).toContain('KASANE_CLI_CONFIG_INVALID');

    const directory = await mkdtemp(path.join(os.tmpdir(), 'kasane-cli-js-'));
    cleanup.push(directory);
    const marker = path.join(directory, 'executed.txt');
    const executable = path.join(directory, 'kasane.config.mjs');
    await writeFile(
      executable,
      `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'executed'); export default {};`,
      'utf8',
    );
    const rejected = cli(['--config', executable, 'print'], directory);
    expect(rejected.status).toBe(3);
    await expect(readFile(marker, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('has no simple secret reveal option', () => {
    const result = cli(['--show-secrets', 'print']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('KASANE_CLI_USAGE');
    expectSecretSafe(`${result.stdout}${result.stderr}`);
  });

  it.runIf(process.platform === 'win32')(
    'runs through the Windows command shell',
    () => {
      const quote = (input: string) => input.replaceAll("'", "''");
      const command = `& '${quote(process.execPath)}' '${quote(binary)}' explain server.port`;
      const result = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', command],
        {
          cwd: base,
          encoding: 'utf8',
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('server.port');
    },
    30_000,
  );
});
