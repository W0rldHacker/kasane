import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import { kasane, secret, value } from '../../src/index.js';
import {
  createMergeRuleIndex,
  mergeConfigNodes,
} from '../../src/merge/index.js';
import { createLayerRegistry } from '../../src/provenance/registry.js';
import { getProvenanceNode } from '../../src/provenance/tree.js';
import {
  applySecretPathPolicy,
  createSecretPathMatcher,
} from '../../src/secrets/index.js';

describe('secret fingerprint security', () => {
  it('replaces earlier public history plaintext during policy conversion', () => {
    const canary = 'PUBLIC_TO_POLICY_SECRET_CANARY';
    const registry = createLayerRegistry([{ kind: 'value', name: 'public' }]);
    const layer = registry.getLayerByName('public');
    if (layer === undefined) throw new Error('Missing fixture layer');

    const publicResult = mergeConfigNodes({
      base: undefined,
      layer: { token: canary },
      layerId: layer.id,
      provenanceMode: 'full',
      registry,
      rules: createMergeRuleIndex([]),
    });
    if (publicResult.provenance === undefined) {
      throw new Error('Missing fixture provenance');
    }
    const converted = applySecretPathPolicy(
      publicResult.provenance,
      registry,
      createSecretPathMatcher(['token']),
      'history-key',
    );
    const token = getProvenanceNode(converted, ['token']);

    expect(token?.secret).toBe(true);
    const convertedEntry = token?.history?.[0];
    expect(convertedEntry?.kind).toBe('redacted');
    if (convertedEntry?.kind !== 'redacted') {
      throw new Error('Expected redacted history');
    }
    expect(convertedEntry.redacted).toBe(true);
    expect(convertedEntry.fingerprint).toMatch(
      /^v1:hmac-sha256:[A-Za-z0-9_-]{43}$/u,
    );
    expect(JSON.stringify(token)).not.toContain(canary);
    expect(token?.history?.some((entry) => 'value' in entry)).toBe(false);
  });

  it('exposes equality fingerprints without retaining public or secret plaintext', async () => {
    const canary = 'EQUAL_HISTORY_SECRET_CANARY';
    const snapshot = await kasane({
      fingerprintKey: 'application-specific-key',
      layers: [
        value('defaults', { token: canary }),
        secret('vault', { token: canary }),
      ],
      provenance: 'full',
    });
    const explanation = snapshot.explain('token');
    if (!explanation.found) throw new Error('Expected found explanation');
    const redacted = explanation.history?.filter(
      (entry) => entry.kind === 'redacted',
    );

    expect(redacted).toHaveLength(2);
    expect(redacted?.[0]?.fingerprint).toBe(redacted?.[1]?.fingerprint);
    for (const output of [
      JSON.stringify(explanation),
      explanation.format(),
      inspect(explanation, { depth: null, showHidden: true }),
    ]) {
      expect(output).not.toContain(canary);
    }
  });

  it('handles a maximum-sized normalized secret without history plaintext', async () => {
    const largeSecret = `LARGE_SECRET_CANARY_${'x'.repeat(999_980)}`;
    const snapshot = await kasane({
      layers: [secret('vault', { token: largeSecret })],
      provenance: 'full',
    });
    const explanation = snapshot.explain('token');
    if (!explanation.found) throw new Error('Expected found explanation');
    const entry = explanation.history?.[0];

    expect(entry?.kind).toBe('redacted');
    if (entry?.kind !== 'redacted') {
      throw new Error('Expected redacted history');
    }
    expect(entry.redacted).toBe(true);
    expect(entry.fingerprint).toMatch(/^v1:sha256:[A-Za-z0-9_-]{43}$/u);
    expect(JSON.stringify(explanation)).not.toContain('LARGE_SECRET_CANARY');
  });

  it('does not retain the HMAC key in snapshot metadata or diagnostics', async () => {
    const key = 'FINGERPRINT_KEY_METADATA_CANARY';
    const snapshot = await kasane({
      fingerprintKey: key,
      layers: [secret('vault', { token: 'secret-value' })],
      provenance: 'full',
    });

    expect(Reflect.ownKeys(snapshot)).toEqual([]);
    for (const output of [
      JSON.stringify(snapshot),
      JSON.stringify(snapshot.explain('token')),
      inspect(snapshot, { depth: null, getters: true, showHidden: true }),
    ]) {
      expect(output).not.toContain(key);
    }
  });
});
