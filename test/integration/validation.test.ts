import { describe, expect, it } from 'vitest';

import {
  KasaneValidationError,
  kasane,
  secret,
  value,
} from '../../src/index.js';
import type { StandardSchemaV1 } from '../../src/standard-schema.js';

describe('validation pipeline', () => {
  it('runs a sync function on a detached mutable clone', async () => {
    const source = { server: { host: 'localhost', port: '3000' } };
    let received: unknown;
    const snapshot = await kasane({
      layers: [value('defaults', source)],
      validate(input) {
        received = input;
        const config = input as typeof source;
        config.server.host = 'validated';
        return config;
      },
    });

    expect(received).not.toBe(source);
    expect((received as typeof source).server).not.toBe(source.server);
    expect(source).toEqual({ server: { host: 'localhost', port: '3000' } });
    expect(snapshot.value).toEqual({
      server: { host: 'validated', port: '3000' },
    });
  });

  it('awaits an async function validator', async () => {
    const snapshot = await kasane({
      layers: [value('input', { enabled: 'yes' })],
      async validate(input) {
        await Promise.resolve();
        return { enabled: (input as { enabled: string }).enabled === 'yes' };
      },
    });

    expect(snapshot.value).toEqual({ enabled: true });
  });

  it('keeps source identity for coercion and marks only changed paths transformed', async () => {
    const snapshot = await kasane({
      layers: [
        value('defaults', {
          server: { host: 'localhost', port: '3000' },
        }),
      ],
      provenance: 'full',
      validate(input) {
        const config = input as {
          server: { host: string; port: string };
        };
        return {
          server: {
            host: config.server.host,
            port: Number(config.server.port),
          },
        };
      },
    });

    expect(snapshot.value).toEqual({
      server: { host: 'localhost', port: 3000 },
    });
    expect(snapshot.origin('server.port')).toMatchObject({
      layer: { kind: 'value', name: 'defaults' },
      secret: false,
      transformed: true,
    });
    expect(snapshot.origin('server.host')).not.toHaveProperty('transformed');
    expect(snapshot.origin('server')).toMatchObject({
      layer: { name: 'defaults' },
      transformed: true,
    });
    const port = snapshot.explain('server.port');
    expect(port.history?.map((entry) => entry.origin.layer.name)).toEqual([
      'defaults',
      'validation',
    ]);
  });

  it('preserves identity-validation provenance without a transform marker', async () => {
    const snapshot = await kasane({
      layers: [value('input', { nested: { answer: 42 } })],
      provenance: 'full',
      validate: (input) => input,
    });

    expect(snapshot.origin('nested.answer')).toMatchObject({
      layer: { name: 'input' },
    });
    expect(snapshot.origin('nested.answer')).not.toHaveProperty('transformed');
    expect(snapshot.explain('nested.answer').history).toHaveLength(1);
  });

  it('attributes descendants of a structural rewrite conservatively', async () => {
    const snapshot = await kasane({
      layers: [value('input', { setting: 'legacy' })],
      validate: () => ({ setting: { enabled: true } }),
    });

    expect(snapshot.origin('setting')).toMatchObject({
      layer: { name: 'input' },
      transformed: true,
    });
    expect(snapshot.origin('setting.enabled')).toMatchObject({
      layer: { kind: 'validation', name: 'validation' },
      operation: 'set',
    });
  });

  it('retains removal provenance when a container becomes a leaf', async () => {
    const snapshot = await kasane({
      layers: [value('input', { setting: { legacy: 'old' } })],
      provenance: 'full',
      validate: () => ({ setting: 'new' }),
    });

    expect(snapshot.origin('setting')).toMatchObject({
      layer: { name: 'input' },
      transformed: true,
    });
    expect(snapshot.explain('setting.legacy')).toMatchObject({
      found: false,
      nearest: 'setting.legacy',
      removal: {
        layer: { kind: 'validation', name: 'validation' },
        operation: 'remove',
      },
    });
  });

  it('reconciles arrays by exact index paths without inferring moves', async () => {
    const snapshot = await kasane({
      layers: [value('input', { items: ['first', 'second'] })],
      provenance: 'full',
      validate: () => ({ items: ['second'] }),
    });

    expect(snapshot.origin('items.0')).toMatchObject({
      layer: { name: 'input' },
      transformed: true,
    });
    expect(snapshot.explain('items.1')).toMatchObject({
      found: false,
      nearest: 'items.1',
      removal: { layer: { name: 'validation' } },
    });
  });

  it('assigns schema defaults to validation and creates removal tombstones', async () => {
    const snapshot = await kasane({
      layers: [value('file', { keep: 'yes', obsolete: 'remove-me' })],
      provenance: 'full',
      validate(input) {
        return { keep: (input as { keep: string }).keep, retries: 3 };
      },
    });

    expect(snapshot.value).toEqual({ keep: 'yes', retries: 3 });
    expect(snapshot.origin('keep')).toMatchObject({
      layer: { name: 'file' },
    });
    expect(snapshot.origin('retries')).toMatchObject({
      layer: { kind: 'validation', name: 'validation' },
      operation: 'set',
    });
    expect(snapshot.explain('obsolete')).toMatchObject({
      found: false,
      nearest: 'obsolete',
      removal: {
        layer: { kind: 'validation', name: 'validation' },
        operation: 'remove',
      },
    });
  });

  it('supports an asynchronous structural Standard Schema result', async () => {
    interface Output {
      readonly port: number;
      readonly retries: number;
    }
    const schema: StandardSchemaV1<unknown, Output> = {
      '~standard': {
        version: 1,
        vendor: 'fixture',
        async validate(input) {
          await Promise.resolve();
          const value = input as { port: string };
          return { value: { port: Number(value.port), retries: 2 } };
        },
      },
    };
    const snapshot = await kasane({
      layers: [value('environment', { port: '8080' })],
      validate: schema,
    });

    expect(snapshot.value).toEqual({ port: 8080, retries: 2 });
    expect(snapshot.origin('port')).toMatchObject({
      layer: { name: 'environment' },
      transformed: true,
    });
    expect(snapshot.origin('retries')).toMatchObject({
      layer: { name: 'validation' },
    });
  });

  it('allows validation to establish an otherwise absent root', async () => {
    const snapshot = await kasane({
      layers: [],
      validate: () => ({ established: true }),
    });

    expect(snapshot.value).toEqual({ established: true });
    expect(snapshot.origin('established')).toMatchObject({
      layer: { name: 'validation' },
    });
  });

  it('re-normalizes validator output and rejects unsupported values', async () => {
    await expect(
      kasane({
        layers: [value('input', { valid: true })],
        validate: () => ({ invalid: new Date(0) }),
      }),
    ).rejects.toMatchObject({
      code: 'KASANE_VALIDATION_ERROR',
      details: {
        kind: 'invalid-validator-output',
        operation: 'validate',
      },
    });
  });

  it('turns Standard Schema failures into validation errors', async () => {
    const schema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'fixture',
        validate: () => ({ issues: [{ message: 'fixture failure' }] }),
      },
    };

    await expect(
      kasane({ layers: [value('input', { valid: false })], validate: schema }),
    ).rejects.toMatchObject({
      code: 'KASANE_VALIDATION_ERROR',
      details: { kind: 'standard-schema-failure', operation: 'validate' },
    });
  });

  it('keeps transformed secrets redacted even with provenance none', async () => {
    const canary = 'VALIDATED_SECRET_CANARY';
    const snapshot = await kasane({
      layers: [secret('vault', { token: canary })],
      provenance: 'none',
      validate(input) {
        return {
          added: 'schema-default',
          token: `${(input as { token: string }).token}-transformed`,
        };
      },
    });

    expect(snapshot.value).toEqual({
      added: 'schema-default',
      token: `${canary}-transformed`,
    });
    expect(snapshot.origin('token')).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain(canary);
    expect(snapshot.toJSON()).toEqual({
      added: '[REDACTED]',
      token: '[REDACTED]',
    });
  });

  it('uses a safe validation error when a function throws', async () => {
    const cause = new KasaneValidationError('UNTRUSTED_VALIDATOR_MESSAGE');
    let failure: unknown;
    try {
      await kasane({
        layers: [value('input', { valid: true })],
        validate: () => {
          throw cause;
        },
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(KasaneValidationError);
    expect(failure).toMatchObject({
      cause: {
        code: 'KASANE_VALIDATION_ERROR',
        name: 'KasaneValidationError',
      },
      details: { kind: 'validator-threw', operation: 'validate' },
    });
    expect((failure as KasaneValidationError).cause).not.toHaveProperty(
      'message',
    );
    expect(JSON.stringify(failure)).not.toContain(
      'UNTRUSTED_VALIDATOR_MESSAGE',
    );
  });
});
