import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspect } from 'node:util';

import { beforeAll, describe, expect, it } from 'vitest';

import { formatDiagnostic } from '../../src/diagnostics/formatter.js';
import { env, KasaneError, kasane } from '../../src/index.js';
import { normalizeConfigNode } from '../../src/normalize/index.js';
import { parsePath } from '../../src/paths/index.js';
import { withPrototypeInvariant } from './support/invariants.js';
import { assertSecretSurfacesSafe } from './support/secret-surfaces.js';

interface TreeCorpusEntry {
  readonly breadth: number;
  readonly depth: number;
  readonly maxDepth: number;
  readonly maxNodes: number;
}

interface EnvCorpusEntry {
  readonly case: 'lower' | 'preserve';
  readonly expectedKind: string;
  readonly prefix: string;
  readonly source: readonly (readonly [string, string])[];
}

interface PathCorpusEntry {
  readonly kind: string;
  readonly repeat: number;
  readonly token: string;
}

interface SecurityCorpus {
  readonly controlStrings: readonly string[];
  readonly deepWideTrees: readonly TreeCorpusEntry[];
  readonly encodedDangerousKeys: readonly string[];
  readonly envCollisions: readonly EnvCorpusEntry[];
  readonly invalidUtf16: readonly string[];
  readonly paths: readonly PathCorpusEntry[];
}

let corpus: SecurityCorpus;

beforeAll(async () => {
  const raw = await readFile(
    new URL('../fuzz-corpus/curated.json', import.meta.url),
    'utf8',
  );
  corpus = JSON.parse(raw) as SecurityCorpus;
});

function hostileTree(depth: number, breadth: number): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let cursor = root;
  for (let index = 0; index < depth; index += 1) {
    const child: Record<string, unknown> = {};
    cursor[`depth-${String(index)}`] = child;
    cursor = child;
  }
  for (let index = 0; index < breadth; index += 1) {
    cursor[`wide-${String(index)}`] = index;
  }
  return root;
}

function errorKind(error: unknown): unknown {
  return error instanceof KasaneError ? error.details.kind : undefined;
}

describe('curated QA-004 security regression corpus', () => {
  it('replays encoded dangerous keys without prototype mutation', async () => {
    for (const encoded of corpus.encodedDangerousKeys) {
      await withPrototypeInvariant(() => {
        const input: unknown = JSON.parse(encoded);
        assert.throws(
          () => normalizeConfigNode(input),
          (error: unknown) => errorKind(error) === 'dangerous-key',
        );
      });
    }
  });

  it('rejects throwing accessors without invoking them', async () => {
    await withPrototypeInvariant(() => {
      let calls = 0;
      const input = {};
      Object.defineProperty(input, 'token', {
        enumerable: true,
        get(): never {
          calls += 1;
          throw new Error('QA004_ACCESSOR_CANARY');
        },
      });

      assert.throws(
        () => normalizeConfigNode(input),
        (error: unknown) => errorKind(error) === 'accessor-property',
      );
      assert.equal(calls, 0);
    });
  });

  it('fails deep and wide trees with controlled limit errors', async () => {
    for (const fixture of corpus.deepWideTrees) {
      await withPrototypeInvariant(() => {
        assert.throws(
          () =>
            normalizeConfigNode(hostileTree(fixture.depth, fixture.breadth), {
              maxDepth: fixture.maxDepth,
              maxNodes: fixture.maxNodes,
            }),
          (error: unknown) => {
            assert.ok(error instanceof KasaneError);
            assert.equal(error instanceof RangeError, false);
            assert.equal(error.details.kind, 'limit-exceeded');
            return true;
          },
        );
      });
    }
  });

  it('bounds huge and malformed paths from the corpus', async () => {
    for (const fixture of corpus.paths) {
      await withPrototypeInvariant(() => {
        const path = fixture.token.repeat(fixture.repeat);
        assert.throws(
          () => parsePath(path),
          (error: unknown) => errorKind(error) === fixture.kind,
        );
      });
    }
  });

  it('handles invalid UTF-16 and escapes ANSI/control characters', async () => {
    for (const value of [...corpus.invalidUtf16, ...corpus.controlStrings]) {
      await withPrototypeInvariant(() => {
        expect(normalizeConfigNode(value)).toBe(value);
        const formatted = formatDiagnostic({ value });
        expect(formatted).not.toContain('\u001B');
        assert.doesNotThrow(() => {
          const parsed: unknown = JSON.parse(JSON.stringify({ value }));
          void parsed;
        });
      });
    }
  });

  it('rejects env collisions deterministically for either enumeration order', async () => {
    for (const fixture of corpus.envCollisions) {
      const kinds: unknown[] = [];
      for (const entries of [fixture.source, [...fixture.source].reverse()]) {
        await withPrototypeInvariant(async () => {
          const source = Object.fromEntries(entries);
          try {
            await kasane({
              layers: [
                env('hostile-env', {
                  case: fixture.case,
                  prefix: fixture.prefix,
                  source,
                }),
              ],
            });
            assert.fail('Expected environment mapping to fail.');
          } catch (error) {
            kinds.push(errorKind(error));
            const output = `${JSON.stringify(error)}\n${inspect(error)}`;
            for (const value of Object.values(source)) {
              assert.equal(output.includes(value), false);
            }
          }
        });
      }
      expect(kinds).toEqual([fixture.expectedKind, fixture.expectedKind]);
    }
  });

  it('covers cycles and every secret diagnostic surface', async () => {
    await withPrototypeInvariant(() => {
      const direct: Record<string, unknown> = {};
      direct['self'] = direct;
      assert.throws(
        () => normalizeConfigNode(direct),
        (error: unknown) => errorKind(error) === 'circular-reference',
      );
    });
    await withPrototypeInvariant(() => assertSecretSurfacesSafe('curated'));
  });
});
