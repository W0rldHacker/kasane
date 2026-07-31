import { realpathSync, watch as nodeWatch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import path from 'node:path';

import { AsyncQueue } from './queue.js';
import type { WatchAdapter, WatchTrigger } from './types.js';

export interface FileWatchOptions {
  /** Value-free identifier included in watch events. */
  readonly adapter?: string;
  readonly cwd?: string;
  readonly signal?: AbortSignal;
}

function requireIdentifier(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new TypeError(
      `${label} must be a non-empty string of at most 128 characters`,
    );
  }
}

function requirePath(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 32_768
  ) {
    throw new TypeError(
      'files entry must be a non-empty path of at most 32768 characters',
    );
  }
}

function filenameText(filename: string | Buffer | null): string | undefined {
  if (filename === null) return undefined;
  return Buffer.isBuffer(filename) ? filename.toString('utf8') : filename;
}

/**
 * Watches parent directories so delete/rename/recreate sequences keep working.
 * It emits value-free triggers; reading and parsing stay inside a fresh Kasane
 * invocation.
 */
export function watchFiles(
  files: readonly string[],
  options: FileWatchOptions = {},
): WatchAdapter {
  if (!Array.isArray(files) || files.length === 0) {
    throw new TypeError('files must contain at least one path');
  }
  const adapter = options.adapter ?? 'files';
  requireIdentifier(adapter, 'options.adapter');
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const byDirectory = new Map<string, Set<string>>();
  for (const file of files) {
    requirePath(file);
    const absolute = path.resolve(cwd, file);
    const directory = path.dirname(absolute);
    const basename = path.basename(absolute);
    const comparable =
      process.platform === 'win32' ? basename.toLowerCase() : basename;
    const names = byDirectory.get(directory) ?? new Set<string>();
    names.add(comparable);
    byDirectory.set(directory, names);
  }

  const queue = new AsyncQueue<WatchTrigger>();
  const watchers: FSWatcher[] = [];
  let closed = false;

  const finish = (failure?: unknown): void => {
    if (closed) return;
    closed = true;
    for (const watcher of watchers.splice(0)) watcher.close();
    if (failure === undefined) queue.close();
    else queue.fail(failure);
  };

  if (options.signal?.aborted === true) {
    finish();
  } else {
    try {
      for (const [directory, names] of byDirectory) {
        const watchedDirectory = realpathSync.native(directory);
        const watcher = nodeWatch(
          watchedDirectory,
          { persistent: false },
          (_eventType, filename) => {
            const text = filenameText(filename);
            const comparable =
              text === undefined
                ? undefined
                : process.platform === 'win32'
                  ? text.toLowerCase()
                  : text;
            if (comparable === undefined || names.has(comparable)) {
              queue.push(Object.freeze({ adapter, kind: 'file' }));
            }
          },
        );
        watcher.on('error', (error) => {
          finish(error);
        });
        watchers.push(watcher);
      }
    } catch (error) {
      finish(error);
    }
  }

  const abort = (): void => {
    finish();
  };
  options.signal?.addEventListener('abort', abort, { once: true });

  return Object.freeze({
    close(): void {
      options.signal?.removeEventListener('abort', abort);
      finish();
    },
    [Symbol.asyncIterator](): AsyncIterator<WatchTrigger> {
      return queue;
    },
  });
}
