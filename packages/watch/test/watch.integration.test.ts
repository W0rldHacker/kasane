import { EventEmitter, on } from 'node:events';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { file, kasane, secret, value } from '@worldhacker/kasane';
import { afterEach, describe, expect, it } from 'vitest';

import { watchFiles, watchProvider, watchSnapshots } from '../src/index.js';
import type { SnapshotWatchEvent, SnapshotWatcher } from '../src/index.js';

const cleanup: (() => void | Promise<void>)[] = [];

afterEach(async () => {
  for (const dispose of cleanup.splice(0)) await dispose();
});

async function nextEvent<T>(
  iterator: AsyncIterator<SnapshotWatchEvent<T>>,
): Promise<IteratorResult<SnapshotWatchEvent<T>, undefined>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      iterator.next(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('Timed out waiting for a watch event'));
        }, 8_000);
      }),
    ]);
    return result.done
      ? { done: true, value: undefined }
      : { done: false, value: result.value };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function providerAdapter(emitter: EventEmitter) {
  return watchProvider(
    (signal) => on(emitter, 'change', { close: ['close'], signal }),
    { adapter: 'fixture-provider' },
  );
}

async function stop<T>(watcher: SnapshotWatcher<T>): Promise<void> {
  await watcher.close();
}

describe('@worldhacker/kasane-watch snapshot lifecycle', () => {
  it('debounces rapid writes and requires an explicit application decision', async () => {
    const emitter = new EventEmitter();
    let revision = 0;
    let builds = 0;
    const initial = await kasane({ layers: [value('revision', { revision })] });
    const watcher = watchSnapshots({
      adapters: [providerAdapter(emitter)],
      build() {
        builds += 1;
        return { layers: [value('revision', { revision })] };
      },
      debounceMs: 30,
      initial,
    });
    cleanup.push(() => stop(watcher));
    const iterator = watcher[Symbol.asyncIterator]();

    revision = 3;
    emitter.emit('change');
    emitter.emit('change');
    emitter.emit('change');
    const first = await nextEvent(iterator);
    expect(first.done).toBe(false);
    expect(first.value?.type).toBe('snapshot');
    if (first.value?.type !== 'snapshot') throw new Error('Expected snapshot');
    expect(builds).toBe(1);
    expect(first.value.triggers).toEqual([
      { adapter: 'fixture-provider', kind: 'provider' },
    ]);
    expect(first.value.previous).toBe(initial);
    expect(first.value.snapshot).not.toBe(initial);
    expect(first.value.snapshot.require('revision')).toBe(3);
    expect(initial.require('revision')).toBe(0);
    expect(watcher.lastKnownGood).toBe(initial);

    expect(first.value.reject()).toBe(true);
    revision = 4;
    emitter.emit('change');
    const second = await nextEvent(iterator);
    if (second.value?.type !== 'snapshot') throw new Error('Expected snapshot');
    expect(second.value.previous).toBe(initial);
    expect(second.value.accept()).toBe(true);
    expect(second.value.accept()).toBe(false);
    expect(watcher.lastKnownGood).toBe(second.value.snapshot);
    expect(initial.require('revision')).toBe(0);
  });

  it('emits invalid replacements as safe errors and retains last-known-good', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'kasane-watch-invalid-'),
    );
    cleanup.push(() => rm(directory, { force: true, recursive: true }));
    const configPath = path.join(directory, 'config.json');
    await writeFile(configPath, '{"port":3000}', 'utf8');
    const load = () => ({
      cwd: directory,
      layers: [file('config', 'config.json')],
    });
    const initial = await kasane(load());
    const watcher = watchSnapshots({
      adapters: [watchFiles(['config.json'], { cwd: directory })],
      build: load,
      debounceMs: 60,
      initial,
    });
    cleanup.push(() => stop(watcher));
    const iterator = watcher[Symbol.asyncIterator]();

    await writeFile(configPath, '{invalid', 'utf8');
    const failed = await nextEvent(iterator);
    expect(failed.done).toBe(false);
    expect(failed.value?.type).toBe('error');
    if (failed.value?.type !== 'error') throw new Error('Expected error event');
    expect(failed.value.stage).toBe('reload');
    expect(failed.value.error.code).toBe('KASANE_SOURCE_ERROR');
    expect(JSON.stringify(failed.value)).not.toContain('{invalid');
    expect(failed.value.previous).toBe(initial);
    expect(watcher.lastKnownGood).toBe(initial);
    expect(initial.require('port')).toBe(3000);

    await writeFile(configPath, '{"port":4000}', 'utf8');
    const recovered = await nextEvent(iterator);
    if (recovered.value?.type !== 'snapshot') {
      throw new Error('Expected recovered snapshot');
    }
    expect(recovered.value.previous).toBe(initial);
    expect(recovered.value.snapshot.require('port')).toBe(4000);
    expect(recovered.value.accept()).toBe(true);
  });

  it('survives deleted and recreated optional files on Windows-style events', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'kasane-watch-optional-'),
    );
    cleanup.push(() => rm(directory, { force: true, recursive: true }));
    const configPath = path.join(directory, 'optional.json');
    await writeFile(configPath, '{"feature":true}', 'utf8');
    const load = () => ({
      cwd: directory,
      layers: [
        value('defaults', { base: true }),
        file('optional', 'optional.json', { optional: true }),
      ],
    });
    const initial = await kasane(load());
    const watcher = watchSnapshots({
      adapters: [watchFiles(['optional.json'], { cwd: directory })],
      build: load,
      debounceMs: 60,
      initial,
    });
    cleanup.push(() => stop(watcher));
    const iterator = watcher[Symbol.asyncIterator]();

    await unlink(configPath);
    const deleted = await nextEvent(iterator);
    if (deleted.value?.type !== 'snapshot')
      throw new Error('Expected snapshot');
    expect(deleted.value.snapshot.value).toEqual({ base: true });
    expect(deleted.value.previous.require('feature')).toBe(true);
    expect(deleted.value.accept()).toBe(true);

    await writeFile(configPath, '{"feature":false}', 'utf8');
    const recreated = await nextEvent(iterator);
    if (recreated.value?.type !== 'snapshot')
      throw new Error('Expected snapshot');
    expect(recreated.value.previous).toBe(deleted.value.snapshot);
    expect(recreated.value.snapshot.require('feature')).toBe(false);
    expect(recreated.value.accept()).toBe(true);
  });

  it('keeps secret diffs and serialized events redacted', async () => {
    const emitter = new EventEmitter();
    let token = 'WATCH_SECRET_BEFORE_CANARY';
    const load = () => ({
      fingerprintKey: 'watch-test-fingerprint-key',
      layers: [secret('provider-secret', { token })],
      provenance: 'full' as const,
    });
    const initial = await kasane(load());
    const watcher = watchSnapshots({
      adapters: [providerAdapter(emitter)],
      build: load,
      debounceMs: 10,
      initial,
    });
    cleanup.push(() => stop(watcher));
    const iterator = watcher[Symbol.asyncIterator]();

    token = 'WATCH_SECRET_AFTER_CANARY';
    emitter.emit('change');
    const changed = await nextEvent(iterator);
    if (changed.value?.type !== 'snapshot')
      throw new Error('Expected snapshot');
    expect(changed.value.diff.changes).toHaveLength(1);
    const serialized = JSON.stringify(changed.value);
    expect(serialized).not.toContain('WATCH_SECRET_BEFORE_CANARY');
    expect(serialized).not.toContain('WATCH_SECRET_AFTER_CANARY');
    expect(serialized).toContain('[REDACTED]');
    expect(initial.require('token')).toBe('WATCH_SECRET_BEFORE_CANARY');
    expect(changed.value.snapshot.require('token')).toBe(
      'WATCH_SECRET_AFTER_CANARY',
    );
  });

  it('stops a pending async iterator through AbortSignal', async () => {
    const emitter = new EventEmitter();
    const controller = new AbortController();
    const initial = await kasane({
      layers: [value('initial', { ready: true })],
    });
    let startedResolve: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    const watcher = watchSnapshots({
      adapters: [providerAdapter(emitter)],
      build: () => ({
        layers: [
          {
            name: 'blocked-provider',
            source: {
              kind: 'blocked-provider',
              load(context) {
                startedResolve?.();
                return new Promise<never>((_resolve, reject) => {
                  const fail = () => {
                    reject(new Error(String(context.signal?.reason)));
                  };
                  if (context.signal?.aborted === true) fail();
                  else
                    context.signal?.addEventListener('abort', fail, {
                      once: true,
                    });
                });
              },
            },
          },
        ],
      }),
      debounceMs: 0,
      initial,
      signal: controller.signal,
    });
    cleanup.push(() => stop(watcher));
    const iterator = watcher[Symbol.asyncIterator]();
    const pending = iterator.next();

    emitter.emit('change');
    await started;
    controller.abort('test-complete');
    await expect(pending).resolves.toEqual({ done: true, value: undefined });
    expect(watcher.lastKnownGood).toBe(initial);
  });
});
