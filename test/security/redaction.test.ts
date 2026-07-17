import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  safeDiagnosticValue,
  safeStringify,
} from '../../src/diagnostics/safe-json.js';
import { KasaneSourceError, kasane, secret, value } from '../../src/index.js';
import {
  createMergeRuleIndex,
  mergeConfigNodes,
} from '../../src/merge/index.js';
import { createLayerRegistry } from '../../src/provenance/registry.js';
import { getProvenanceNode } from '../../src/provenance/tree.js';
import { REDACTED_VALUE, Redactor } from '../../src/secrets/redact.js';

const CANARY = 'SEC002_CANARY\n\u001B[31mSECRET\u001B[0m';

describe('central redaction', () => {
  it('keeps public siblings and placeholder-equal public values in JSON and inspect', async () => {
    const snapshot = await kasane({
      layers: [
        value('public', {
          literal: REDACTED_VALUE,
          public: 'visible',
        }),
        secret('secret', {
          credentials: {
            history: [CANARY],
            token: CANARY,
          },
        }),
      ],
      provenance: 'full',
    });

    const json = JSON.stringify(snapshot);
    const rendered = inspect(snapshot, {
      colors: true,
      depth: null,
      getters: true,
      showHidden: true,
    });

    expect(json).not.toContain('SEC002_CANARY');
    expect(json).not.toContain('\u001B[31mSECRET');
    expect(rendered).not.toContain('SEC002_CANARY');
    expect(rendered).not.toContain('SECRET');
    expect(JSON.parse(json)).toEqual({
      credentials: {
        history: [REDACTED_VALUE],
        token: REDACTED_VALUE,
      },
      literal: REDACTED_VALUE,
      public: 'visible',
    });
  });

  it('always returns detached trees', async () => {
    const snapshot = await kasane<{
      private: { token: string };
      public: { label: string };
    }>({
      freeze: false,
      layers: [
        value('public', { public: { label: 'visible' } }),
        secret('secret', { private: { token: CANARY } }),
      ],
    });

    const first = snapshot.toJSON() as {
      private: { token: string };
      public: { label: string };
    };
    expect(first).not.toBe(snapshot.value);
    expect(first.public).not.toBe(snapshot.value.public);
    first.public.label = 'mutated';
    first.private.token = 'mutated';

    expect(snapshot.toJSON()).toEqual({
      private: { token: REDACTED_VALUE },
      public: { label: 'visible' },
    });
  });

  it('does not invoke getters, JSON hooks, custom inspect, or symbol rendering', () => {
    let hookCalls = 0;
    let proxyTrapCalls = 0;
    const symbolKey = Symbol('SYMBOL_KEY_CANARY');
    const input = {
      public: 'visible',
      symbolValue: Symbol('SYMBOL_VALUE_CANARY'),
      toJSON() {
        hookCalls += 1;
        return CANARY;
      },
      [inspect.custom]() {
        hookCalls += 1;
        return CANARY;
      },
      [symbolKey]: CANARY,
    };
    Object.defineProperty(input, 'accessor', {
      enumerable: true,
      get() {
        hookCalls += 1;
        return CANARY;
      },
    });

    const rendered = safeStringify(input);
    expect(hookCalls).toBe(0);
    expect(rendered).toContain('visible');
    expect(rendered).not.toContain('CANARY');

    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          proxyTrapCalls += 1;
          return ['SEC002_PROXY_CANARY'];
        },
      },
    );
    expect(safeStringify(proxy)).toBe('"[UNINSPECTABLE]"');
    expect(proxyTrapCalls).toBe(0);
  });

  it('is cycle-safe and bounded for deeply nested hostile values', () => {
    const circular: { self?: unknown; public: string } = { public: 'visible' };
    circular.self = circular;
    expect(safeStringify(circular)).toContain('[CIRCULAR]');

    const root: Record<string, unknown> = {};
    let cursor = root;
    for (let depth = 0; depth < 60; depth += 1) {
      const child: Record<string, unknown> = {};
      cursor['nested'] = child;
      cursor = child;
    }
    cursor['token'] = CANARY;

    const redactor = new Redactor();
    const output = redactor.redact(root, {
      policy: { matches: () => true },
    });
    expect(JSON.stringify(output)).not.toContain('SEC002_CANARY');
  });

  it('keeps arbitrary error causes out of all serialized surfaces', () => {
    const cause: Error & { payload?: unknown; self?: unknown } = new Error(
      CANARY,
    );
    cause.payload = { token: CANARY };
    cause.self = cause;
    const error = new KasaneSourceError(undefined, { cause });

    for (const output of [
      JSON.stringify(error),
      inspect(error, {
        colors: true,
        depth: null,
        getters: true,
        showHidden: true,
      }),
      error.stack ?? '',
      safeStringify(error),
      JSON.stringify(safeDiagnosticValue(error)),
    ]) {
      expect(output).not.toContain('SEC002_CANARY');
      expect(output).not.toContain('SECRET');
    }
  });

  it('serializes full secret history without retaining an earlier plaintext value', () => {
    const registry = createLayerRegistry([
      { kind: 'value', name: 'public' },
      { kind: 'secret', name: 'secret' },
    ]);
    const publicLayer = registry.getLayerByName('public');
    const secretLayer = registry.getLayerByName('secret');
    if (publicLayer === undefined || secretLayer === undefined) {
      throw new Error('Missing fixture layers');
    }

    const first = mergeConfigNodes({
      base: undefined,
      layer: { token: CANARY },
      layerId: publicLayer.id,
      provenanceMode: 'full',
      registry,
      rules: createMergeRuleIndex([]),
    });
    const second = mergeConfigNodes({
      base: first.value,
      ...(first.provenance === undefined
        ? {}
        : { baseProvenance: first.provenance }),
      layer: { token: CANARY },
      layerId: secretLayer.id,
      provenanceMode: 'full',
      registry,
      rules: createMergeRuleIndex([]),
      secret: true,
    });
    if (second.provenance === undefined) throw new Error('Missing provenance');
    const token = getProvenanceNode(second.provenance, ['token']);

    expect(token?.history?.map((entry) => entry.kind)).toEqual([
      'redacted',
      'redacted',
    ]);
    expect(safeStringify(token?.history)).not.toContain('SEC002_CANARY');
  });
});
