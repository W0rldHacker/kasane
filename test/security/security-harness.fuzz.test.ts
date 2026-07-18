import assert from 'node:assert/strict';

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  formatDiagnostic,
  MAX_FORMAT_LENGTH,
} from '../../src/diagnostics/formatter.js';
import { safeStringify } from '../../src/diagnostics/safe-json.js';
import { KasaneError } from '../../src/index.js';
import { normalizeConfigNode } from '../../src/normalize/index.js';
import {
  descriptorCaseArbitrary,
  diagnosticArbitrary,
  objectArbitrary,
  resourceCaseArbitrary,
  secretSuffixArbitrary,
} from './support/fuzz-generators.js';
import {
  allocatedFuzzRuns,
  FUZZ_RUNS,
  FUZZ_TIMEOUT_MS,
  runFuzzProperty,
} from './support/fuzz-runner.js';
import { withPrototypeInvariant } from './support/invariants.js';
import { assertSecretSurfacesSafe } from './support/secret-surfaces.js';

function controlledNormalization(input: unknown): void {
  try {
    normalizeConfigNode(input, {
      maxDepth: 32,
      maxNodes: 2_000,
      maxStringLength: 4_096,
    });
  } catch (error) {
    assert.ok(
      error instanceof KasaneError,
      'normalization crashed unexpectedly',
    );
    assert.equal(error instanceof RangeError, false);
  }
}

function descriptorInput(
  key: string,
  value: string,
  accessor: boolean,
): { readonly input: Record<string, unknown>; readonly calls: () => number } {
  let getterCalls = 0;
  const input: Record<string, unknown> = {};
  Object.defineProperty(input, key, {
    configurable: true,
    enumerable: true,
    ...(accessor
      ? {
          get(): never {
            getterCalls += 1;
            throw new Error('QA004_ACCESSOR_MUST_NOT_RUN');
          },
        }
      : { value, writable: true }),
  });
  return { calls: () => getterCalls, input };
}

function resourceInput(depth: number, breadth: number, text: string): unknown {
  const root: Record<string, unknown> = {};
  let cursor = root;
  for (let index = 0; index < depth; index += 1) {
    const child: Record<string, unknown> = {};
    cursor[`depth-${String(index)}`] = child;
    cursor = child;
  }
  for (let index = 0; index < breadth; index += 1) {
    cursor[`wide-${String(index)}`] = `${text}:${String(index)}`;
  }
  return root;
}

describe('QA-004 security fuzz harness', () => {
  it('allocates exactly the requested number of generated cases', () => {
    const total = Array.from({ length: 5 }, (_, index) =>
      allocatedFuzzRuns(index),
    ).reduce((sum, runs) => sum + runs, 0);
    expect(total).toBe(FUZZ_RUNS);
  });

  it(
    'fuzzes byte, string, array, and object normalization inputs',
    { timeout: FUZZ_TIMEOUT_MS },
    async () => {
      await runFuzzProperty(
        'normalization-data-plane',
        fc.asyncProperty(objectArbitrary, async (input) => {
          await withPrototypeInvariant(() => {
            controlledNormalization(input);
          });
        }),
        allocatedFuzzRuns(0),
      );
    },
  );

  it(
    'rejects accessors and hostile descriptors without invoking them',
    { timeout: FUZZ_TIMEOUT_MS },
    async () => {
      await runFuzzProperty(
        'hostile-descriptors',
        fc.asyncProperty(descriptorCaseArbitrary, async (fixture) => {
          await withPrototypeInvariant(() => {
            const { calls, input } = descriptorInput(
              fixture.key,
              fixture.value,
              fixture.accessor,
            );
            controlledNormalization(input);
            assert.equal(calls(), 0);
          });
        }),
        allocatedFuzzRuns(1),
      );
    },
  );

  it(
    'fuzzes depth, width, node, and UTF-8 string boundaries',
    { timeout: FUZZ_TIMEOUT_MS },
    async () => {
      await runFuzzProperty(
        'resource-limits',
        fc.asyncProperty(resourceCaseArbitrary, async (fixture) => {
          await withPrototypeInvariant(() => {
            try {
              normalizeConfigNode(
                resourceInput(fixture.depth, fixture.breadth, fixture.text),
                {
                  maxDepth: fixture.maxDepth,
                  maxNodes: fixture.maxNodes,
                  maxStringLength: fixture.maxStringLength,
                },
              );
            } catch (error) {
              assert.ok(error instanceof KasaneError);
              assert.equal(error instanceof RangeError, false);
            }
          });
        }),
        allocatedFuzzRuns(2),
      );
    },
  );

  it(
    'keeps diagnostic serialization and formatting bounded and hook-free',
    { timeout: FUZZ_TIMEOUT_MS },
    async () => {
      await runFuzzProperty(
        'diagnostic-formatters',
        fc.asyncProperty(diagnosticArbitrary, async (input) => {
          await withPrototypeInvariant(() => {
            const json = safeStringify(input);
            const formatted = formatDiagnostic(input);
            assert.ok(json.length <= 1_000_000);
            assert.ok(formatted.length <= MAX_FORMAT_LENGTH + 13);
            assert.equal(formatted.includes('\u001B'), false);
          });
        }),
        allocatedFuzzRuns(3),
      );
    },
  );

  it(
    'searches for canaries across errors, inspect, JSON, diff, explain, and events',
    { timeout: FUZZ_TIMEOUT_MS },
    async () => {
      await runFuzzProperty(
        'secret-diagnostic-surfaces',
        fc.asyncProperty(secretSuffixArbitrary, async (suffix) => {
          await withPrototypeInvariant(() => assertSecretSurfacesSafe(suffix));
        }),
        allocatedFuzzRuns(4),
      );
    },
  );
});
