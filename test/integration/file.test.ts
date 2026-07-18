import { chmod } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  KasaneMergeError,
  KasaneSourceError,
  file,
  kasane,
  value,
} from '../../src/index.js';
import { withTempWorkspace } from './helpers/temp-workspace.js';

const projectRoot = path.resolve('.');
const fixtureDirectory = path.resolve('test', 'fixtures', 'file');
const fixture = (name: string): string => path.join(fixtureDirectory, name);

describe('file source', () => {
  it('loads UTF-8 JSON through relative and absolute paths', async () => {
    const relative = path.relative(projectRoot, fixture('valid.json'));
    const fromRelative = await kasane({
      cwd: projectRoot,
      layers: [file('relative', relative)],
    });
    const fromAbsolute = await kasane({
      cwd: path.resolve('test'),
      layers: [file('absolute', fixture('valid.json'))],
    });

    expect(fromRelative.value).toEqual({
      features: ['base'],
      server: { host: 'localhost', port: 3000 },
    });
    expect(fromAbsolute.value).toEqual(fromRelative.value);
  });

  it('accepts Windows separators in a relative path on Windows', async () => {
    if (process.platform !== 'win32') return;

    const windowsPath = path
      .relative(projectRoot, fixture('valid.json'))
      .replaceAll('/', '\\');
    const snapshot = await kasane({
      cwd: projectRoot,
      layers: [file('windows-path', windowsPath)],
    });

    expect(snapshot.get('server.port')).toBe(3000);
  });

  it('suppresses only ENOENT for optional files', async () => {
    const missing = fixture('does-not-exist.json');
    const snapshot = await kasane({
      layers: [
        value('defaults', { answer: 42 }),
        file('optional', missing, { optional: true }),
      ],
    });

    expect(snapshot.value).toEqual({ answer: 42 });
    await expect(
      kasane({ layers: [file('required', missing)] }),
    ).rejects.toMatchObject({
      code: 'KASANE_SOURCE_ERROR',
      details: {
        kind: 'file-read-error',
        operation: 'read-file',
        reference: missing,
      },
    });
  });

  it('does not suppress or expose invalid JSON contents', async () => {
    const invalidPath = fixture('invalid.json');
    let failure: unknown;

    try {
      await kasane({
        layers: [file('invalid', invalidPath, { optional: true })],
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(KasaneSourceError);
    expect(failure).toMatchObject({
      details: {
        kind: 'file-parse-error',
        operation: 'parse-file',
        reference: invalidPath,
      },
    });
    expect(JSON.stringify(failure)).not.toContain(
      'invalid-json-contents-canary',
    );
  });

  it('supports async parsers and normalizes their output', async () => {
    const parse = vi.fn(async (contents: string) => {
      await Promise.resolve();
      const parsed = JSON.parse(contents) as { server: { port: number } };
      return { parsedPort: parsed.server.port, zero: -0 };
    });
    const snapshot = await kasane({
      layers: [file('async-parser', fixture('valid.json'), { parse })],
    });

    expect(parse).toHaveBeenCalledOnce();
    expect(snapshot.value).toEqual({ parsedPort: 3000, zero: 0 });
    expect(Object.is(snapshot.get('zero'), -0)).toBe(false);
  });

  it('rejects an untrusted parser class instance during normalization', async () => {
    class ParserResult {
      readonly answer = 42;
    }

    await expect(
      kasane({
        layers: [
          file('class-instance', fixture('valid.json'), {
            parse: () => new ParserResult(),
          }),
        ],
      }),
    ).rejects.toBeInstanceOf(KasaneMergeError);
  });

  it('does not treat a directory read failure as an optional miss', async () => {
    await expect(
      kasane({
        layers: [file('directory', fixtureDirectory, { optional: true })],
      }),
    ).rejects.toMatchObject({
      code: 'KASANE_SOURCE_ERROR',
      details: { kind: 'file-read-error', operation: 'read-file' },
    });
  });

  it('passes AbortSignal to readFile', async () => {
    const controller = new AbortController();
    controller.abort();
    const descriptor = file('aborted', fixture('large.json'));

    await expect(
      descriptor.source.load({
        cwd: projectRoot,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: 'KASANE_SOURCE_ERROR',
      details: { kind: 'file-read-error', operation: 'read-file' },
    });
  });

  it('publishes only the resolved path through public provenance', async () => {
    const absolutePath = fixture('valid.json');
    const snapshot = await kasane({
      cwd: projectRoot,
      layers: [file('metadata', absolutePath)],
    });
    const origin = snapshot.origin('server.host');

    expect(origin).toMatchObject({
      layer: { id: 0, kind: 'file', name: 'metadata' },
      sourceReference: absolutePath,
    });
    expect(JSON.stringify(origin)).not.toContain('localhost');
  });

  it('loads a larger JSON fixture without a separate merge path', async () => {
    const snapshot = await kasane({
      layers: [file('large', fixture('large.json'))],
    });

    expect(snapshot.get('payload.0')).toBe(0);
    expect(snapshot.get('payload.99')).toBe(99);
  });

  it('reports permission errors where the platform enforces chmod', async () => {
    if (process.platform === 'win32') return;

    await withTempWorkspace(async (workspace) => {
      const permissionPath = await workspace.writeJson('permission.json', {
        inaccessible: true,
      });
      await chmod(permissionPath, 0o000);
      try {
        let failure: unknown;
        try {
          await kasane({
            cwd: workspace.cwd,
            layers: [file('permission', permissionPath, { optional: true })],
          });
        } catch (error) {
          failure = error;
        }

        if (failure !== undefined) {
          expect(failure).toBeInstanceOf(KasaneSourceError);
          expect(failure).toMatchObject({
            details: { kind: 'file-read-error', operation: 'read-file' },
          });
        }
      } finally {
        await chmod(permissionPath, 0o644);
      }
    });
  });
});
