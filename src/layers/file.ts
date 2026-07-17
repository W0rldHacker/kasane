import { readFile } from 'node:fs/promises';
import nodePath from 'node:path';

import { KasaneLayerError, KasaneSourceError } from '../errors/index.js';
import { sourceMetadata } from '../sources/index.js';
import type {
  SourceContext,
  SourceMetadata,
  SourceWithMetadata,
} from '../sources/index.js';
import type { LayerDescriptor } from './types.js';

export type FileParser<Output = unknown> = (
  source: string,
) => Output | Promise<Output>;

export interface FileLayerOptions<Output = unknown> {
  readonly enabled?: boolean;
  readonly optional?: boolean;
  readonly parse?: FileParser<Output>;
  readonly secret?: boolean;
}

function failFileDeclaration(
  kind: string,
  name: unknown,
  filePath: unknown,
): never {
  throw new KasaneLayerError('File layer declaration is invalid.', {
    details: {
      kind,
      operation: 'create-file-layer',
      ...(typeof name === 'string' ? { layerName: name } : {}),
      ...(typeof filePath === 'string' && filePath.length > 0
        ? { reference: filePath }
        : {}),
    },
  });
}

function errorCode(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function resolvedPath(filePath: string, context: SourceContext): string {
  return nodePath.resolve(context.cwd, filePath);
}

function metadataFor(filePath: string, context: SourceContext): SourceMetadata {
  return Object.freeze({ reference: resolvedPath(filePath, context) });
}

function parseJson(source: string): unknown {
  return JSON.parse(source) as unknown;
}

/** Creates a UTF-8 file source with JSON parsing by default. */
export function file<Output = unknown>(
  name: string,
  filePath: string,
  options: FileLayerOptions<Output> = {},
): LayerDescriptor {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return failFileDeclaration('invalid-file-path', name, filePath);
  }
  if (options.optional !== undefined && typeof options.optional !== 'boolean') {
    return failFileDeclaration('invalid-file-optional', name, filePath);
  }
  if (options.enabled !== undefined && typeof options.enabled !== 'boolean') {
    return failFileDeclaration('invalid-file-enabled', name, filePath);
  }
  if (options.parse !== undefined && typeof options.parse !== 'function') {
    return failFileDeclaration('invalid-file-parser', name, filePath);
  }
  if (options.secret !== undefined && typeof options.secret !== 'boolean') {
    return failFileDeclaration('invalid-file-secret', name, filePath);
  }

  const optional = options.optional === true;
  const parse = options.parse ?? parseJson;
  const source: SourceWithMetadata = Object.freeze({
    kind: 'file',
    [sourceMetadata](context: SourceContext): SourceMetadata {
      return metadataFor(filePath, context);
    },
    async load(context: SourceContext): Promise<unknown> {
      const absolutePath = resolvedPath(filePath, context);
      let contents: string;
      try {
        contents = await readFile(absolutePath, {
          encoding: 'utf8',
          ...(context.signal === undefined ? {} : { signal: context.signal }),
        });
      } catch (cause) {
        if (optional && errorCode(cause) === 'ENOENT') return undefined;
        throw new KasaneSourceError('Configuration file could not be read.', {
          cause,
          details: {
            kind: 'file-read-error',
            operation: 'read-file',
            reference: absolutePath,
          },
        });
      }

      try {
        return await parse(contents);
      } catch (cause) {
        throw new KasaneSourceError('Configuration file could not be parsed.', {
          cause,
          details: {
            kind: 'file-parse-error',
            operation: 'parse-file',
            reference: absolutePath,
          },
        });
      }
    },
  });

  return Object.freeze({
    name,
    source,
    ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
    ...(options.secret === undefined ? {} : { secret: options.secret }),
  });
}
