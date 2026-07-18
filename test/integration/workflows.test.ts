import { access } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { env, file, kasane, secret, value } from '../../src/index.js';
import type { KasaneEvent, LayerDescriptor } from '../../src/index.js';
import { withTempWorkspace } from './helpers/temp-workspace.js';

const FINGERPRINT_KEY = 'integration-fingerprint-key';

describe('public API workflows', () => {
  it('loads a backend configuration with validation and safe provenance', async () => {
    const secretCanary = 'BACKEND_SECRET_CANARY';
    let cleanedCwd = '';

    await withTempWorkspace(async (workspace) => {
      cleanedCwd = workspace.cwd;
      const configurationPath = await workspace.writeJson(
        'config/backend.json',
        {
          logging: { format: 'json' },
          server: { host: 'backend.internal', port: '4000' },
        },
      );
      const runtime: LayerDescriptor = {
        name: 'runtime',
        source: {
          kind: 'custom',
          async load() {
            await Promise.resolve();
            return { service: { region: 'test-region-1' } };
          },
        },
      };
      const snapshot = await kasane({
        cwd: workspace.cwd,
        fingerprintKey: FINGERPRINT_KEY,
        layers: [
          value('defaults', {
            logging: { format: 'text', level: 'info' },
            server: { host: '127.0.0.1', port: '3000' },
          }),
          file('configuration', 'config/backend.json'),
          env('environment', {
            map: {
              APP_LOG_LEVEL: 'logging.level',
              APP_SERVER_PORT: 'server.port',
            },
            source: {
              APP_LOG_LEVEL: 'debug',
              APP_SERVER_PORT: '8080',
            },
          }),
          runtime,
          secret('runtime-secrets', async () => {
            await Promise.resolve();
            return { database: { token: secretCanary } };
          }),
        ],
        provenance: 'full',
        validate(input) {
          const config = input as {
            database: { token: string };
            logging: { format: string; level: string };
            server: { host: string; port: string };
            service: { region: string };
          };
          return {
            ...config,
            server: { ...config.server, port: Number(config.server.port) },
            validated: true,
          };
        },
      });

      expect(snapshot.value).toEqual({
        database: { token: secretCanary },
        logging: { format: 'json', level: 'debug' },
        server: { host: 'backend.internal', port: 8080 },
        service: { region: 'test-region-1' },
        validated: true,
      });
      expect(snapshot.origin('server.host')).toMatchObject({
        layer: { id: 1, kind: 'file', name: 'configuration' },
        sourceReference: configurationPath,
      });
      expect(snapshot.origin('server.port')).toMatchObject({
        inputReference: 'APP_SERVER_PORT',
        layer: { id: 2, kind: 'env', name: 'environment' },
        transformed: true,
      });
      expect(snapshot.origin('service.region')).toMatchObject({
        layer: { id: 3, kind: 'custom', name: 'runtime' },
      });
      expect(snapshot.origin('database.token')).toMatchObject({
        layer: { id: 4, kind: 'secret', name: 'runtime-secrets' },
        secret: true,
      });
      expect(
        snapshot
          .explain('server.port')
          .history?.map((entry) => entry.origin.layer.name),
      ).toEqual(['defaults', 'configuration', 'environment', 'validation']);

      const publicOutputs = JSON.stringify({
        diff: snapshot.diff(snapshot),
        explanation: snapshot.explain('database.token'),
        json: snapshot.toJSON(),
      });
      expect(publicOutputs).not.toContain(secretCanary);
      expect(publicOutputs).toContain('[REDACTED]');
    });

    await expect(access(cleanedCwd)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('applies CLI-like precedence and ignores an optional missing file', async () => {
    await withTempWorkspace(async (workspace) => {
      const configurationPath = await workspace.writeJson('config.json', {
        mode: 'file',
        server: { host: 'file.internal', port: 4000 },
      });
      const snapshot = await kasane({
        cwd: workspace.cwd,
        layers: [
          value('defaults', {
            logging: { level: 'info' },
            mode: 'default',
            server: { host: 'localhost', port: 3000 },
          }),
          file('configuration', 'config.json'),
          file('local-optional', 'config.local.json', { optional: true }),
          env('environment', {
            map: {
              APP_LOG_LEVEL: 'logging.level',
              APP_PORT: { parse: Number, path: 'server.port' },
            },
            source: { APP_LOG_LEVEL: 'warn', APP_PORT: '5000' },
          }),
          value('cli', { server: { port: 6000 } }),
        ],
        provenance: 'full',
      });

      expect(snapshot.value).toEqual({
        logging: { level: 'warn' },
        mode: 'file',
        server: { host: 'file.internal', port: 6000 },
      });
      expect(snapshot.origin('mode')).toMatchObject({
        layer: { id: 1, kind: 'file', name: 'configuration' },
        sourceReference: configurationPath,
      });
      expect(snapshot.origin('logging.level')).toMatchObject({
        inputReference: 'APP_LOG_LEVEL',
        layer: { id: 3, kind: 'env', name: 'environment' },
      });
      expect(snapshot.origin('server.port')).toMatchObject({
        layer: { id: 4, kind: 'value', name: 'cli' },
      });
      expect(
        snapshot
          .explain('server.port')
          .history?.map((entry) => entry.origin.layer.name),
      ).toEqual(['defaults', 'configuration', 'environment', 'cli']);
    });
  });

  it('does not publish a partial snapshot after a layer failure', async () => {
    await withTempWorkspace(async (workspace) => {
      await workspace.writeJson('config.json', { loaded: true });
      const events: KasaneEvent[] = [];
      const laterLoad = vi.fn(() => ({ later: true }));
      const failureCanary = 'FAILED_LAYER_SECRET_CANARY';
      const layers: LayerDescriptor[] = [
        file('configuration', 'config.json'),
        {
          name: 'broken-provider',
          source: {
            kind: 'custom',
            async load() {
              await Promise.resolve();
              throw new Error(failureCanary);
            },
          },
        },
        { name: 'later', source: { kind: 'custom', load: laterLoad } },
      ];

      let caught: unknown;
      try {
        await kasane({
          cwd: workspace.cwd,
          layers,
          onEvent: (event) => events.push(event),
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toMatchObject({
        code: 'KASANE_SOURCE_ERROR',
        details: { layerName: 'broken-provider', operation: 'load-layer' },
      });
      expect(laterLoad).not.toHaveBeenCalled();
      expect(events).toContainEqual(
        expect.objectContaining({
          layer: 'broken-provider',
          success: false,
          type: 'source:end',
        }),
      );
      expect(events).not.toContainEqual(
        expect.objectContaining({ type: 'snapshot:created' }),
      );
      expect(JSON.stringify({ caught, events })).not.toContain(failureCanary);
    });
  });

  it('does not publish a partial snapshot after validation fails', async () => {
    await withTempWorkspace(async (workspace) => {
      await workspace.writeJson('config.json', { port: 'invalid' });
      const events: KasaneEvent[] = [];
      const failureCanary = 'FAILED_VALIDATION_SECRET_CANARY';

      let caught: unknown;
      try {
        await kasane({
          cwd: workspace.cwd,
          layers: [file('configuration', 'config.json')],
          onEvent: (event) => events.push(event),
          validate() {
            throw new Error(failureCanary);
          },
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toMatchObject({
        code: 'KASANE_VALIDATION_ERROR',
        details: { operation: 'validate' },
      });
      expect(events).toContainEqual(
        expect.objectContaining({ success: false, type: 'validation:end' }),
      );
      expect(events).not.toContainEqual(
        expect.objectContaining({ type: 'snapshot:created' }),
      );
      expect(JSON.stringify({ caught, events })).not.toContain(failureCanary);
    });
  });

  it('diffs two public snapshots in a reload simulation', async () => {
    const beforeCanary = 'RELOAD_SECRET_BEFORE_CANARY';
    const afterCanary = 'RELOAD_SECRET_AFTER_CANARY';

    await withTempWorkspace(async (workspace) => {
      const configurationPath = await workspace.writeJson('config.json', {
        feature: { enabled: false },
        removed: 'old',
      });
      let token = beforeCanary;
      const load = () =>
        kasane({
          cwd: workspace.cwd,
          fingerprintKey: FINGERPRINT_KEY,
          layers: [
            file('configuration', 'config.json'),
            secret('secrets', async () => {
              await Promise.resolve();
              return { token };
            }),
          ],
          provenance: 'full',
        });

      const before = await load();
      await workspace.writeJson('config.json', {
        added: 'new',
        feature: { enabled: true },
      });
      token = afterCanary;
      const after = await load();
      const diff = before.diff(after);

      expect(diff.changes.map(({ path, type }) => [path, type])).toEqual([
        ['added', 'added'],
        ['feature.enabled', 'value-changed'],
        ['removed', 'removed'],
        ['token', 'value-changed'],
      ]);
      expect(before.origin('feature.enabled')).toMatchObject({
        layer: { kind: 'file', name: 'configuration' },
        sourceReference: configurationPath,
      });
      expect(after.origin('feature.enabled')).toMatchObject({
        layer: { kind: 'file', name: 'configuration' },
        sourceReference: configurationPath,
      });
      const tokenChange = diff.changes.find(({ path }) => path === 'token');
      expect(tokenChange).toMatchObject({
        after: { value: '[REDACTED]' },
        before: { value: '[REDACTED]' },
        type: 'value-changed',
      });
      if (
        tokenChange === undefined ||
        tokenChange.type === 'added' ||
        tokenChange.type === 'removed'
      ) {
        throw new Error('Expected a two-sided token change.');
      }
      expect(tokenChange.after.fingerprint).toMatch(/^v1:hmac-sha256:/);
      expect(tokenChange.before.fingerprint).toMatch(/^v1:hmac-sha256:/);
      expect(JSON.stringify(diff)).not.toContain(beforeCanary);
      expect(JSON.stringify(diff)).not.toContain(afterCanary);
    });
  });
});
