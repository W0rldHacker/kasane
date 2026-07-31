import { describe, expect, it } from 'vitest';

import type { LayerDescriptor, LayerSource } from '@worldhacker/kasane';

import {
  assertSafeProviderReference,
  runParserConformance,
  runSourceConformance,
} from '../src/index.js';
import type {
  ParserConformanceAdapter,
  SourceConformanceAdapter,
  SourceConformanceCase,
} from '../src/index.js';

function dangerousPayload(): Record<string, unknown> {
  const nested: Record<string, unknown> = {};
  Object.defineProperty(nested, '__proto__', {
    enumerable: true,
    value: { sourceTestkitPolluted: true },
  });
  return { nested };
}

function fixtureSource(fixture: SourceConformanceCase): LayerSource {
  return {
    kind: 'fixture-provider',
    load(context) {
      switch (fixture.mode) {
        case 'value':
          return fixture.value;
        case 'failure':
          throw new Error(fixture.failureCanary);
        case 'abort':
          return new Promise<never>((_resolve, reject) => {
            const fail = () => {
              reject(new Error(String(context.signal?.reason)));
            };
            if (context.signal?.aborted === true) fail();
            else
              context.signal?.addEventListener('abort', fail, { once: true });
          });
        case 'secret':
          return { token: fixture.secretCanary };
        case 'dangerous-keys':
          return dangerousPayload();
      }
    },
  };
}

const sourceAdapter: SourceConformanceAdapter = {
  name: 'source-testkit-self-fixture',
  create(fixture) {
    const layer: LayerDescriptor = Object.freeze({
      name: `fixture-${fixture.mode}`,
      source: Object.freeze(fixtureSource(fixture)),
      ...(fixture.mode === 'secret' || fixture.mode === 'failure'
        ? { secret: true }
        : {}),
    });
    return {
      layer,
      reference: Object.freeze({
        fields: Object.freeze(['token']),
        provider: 'fixture',
        resource: `resource-${fixture.mode}`,
      }),
    };
  },
};

const parserAdapter: ParserConformanceAdapter = {
  dangerousSource: 'DANGEROUS',
  failureCanary: 'PARSER_FAILURE_CANARY',
  invalidSource: 'INVALID',
  name: 'source-testkit-self-parser',
  async parse(source) {
    await Promise.resolve();
    if (source === 'VALID') return { nested: { parser: true } };
    if (source === 'SECRET') return { token: 'PARSER_SECRET_CANARY' };
    if (source === 'DANGEROUS') return dangerousPayload();
    throw new Error('PARSER_FAILURE_CANARY');
  },
  secretCanary: 'PARSER_SECRET_CANARY',
  secretSource: 'SECRET',
  validSource: 'VALID',
  validValue: { nested: { parser: true } },
};

describe('public source testkit', () => {
  it('runs the complete provider source contract', async () => {
    const report = await runSourceConformance(sourceAdapter);
    expect(report.scenarios).toEqual([
      'plain-data-and-core-merge',
      'provider-failure',
      'abort',
      'secret-annotation',
      'dangerous-keys',
      'safe-reference',
      'no-source-owned-merge',
    ]);
  });

  it('runs the complete parser contract', async () => {
    const report = await runParserConformance(parserAdapter);
    expect(report.scenarios).toContain('parser-failure-sanitized');
    expect(report.scenarios).toContain('secret-layer-redaction');
  });

  it('rejects secret-bearing or executable provider references', () => {
    expect(() => {
      assertSafeProviderReference(
        {
          provider: 'fixture',
          resource: 'SECRET_REFERENCE_CANARY',
        },
        ['SECRET_REFERENCE_CANARY'],
      );
    }).toThrow(/forbidden value/u);

    expect(() => {
      assertSafeProviderReference({
        provider: 'fixture',
        resource: 'safe',
        token: 'not-allowed',
      });
    }).toThrow(/unsupported field/u);
  });
});
