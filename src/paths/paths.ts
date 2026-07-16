import { KasanePathError } from '../errors/index.js';
import type { ConfigNode } from '../normalize/types.js';
import { isSafeConfigKey } from '../normalize/safe-key.js';

const ARRAY_INDEX = /^(?:0|[1-9][0-9]*)$/u;
const ROOT_SEGMENTS: readonly string[] = Object.freeze([]);

export const MAX_PATH_LENGTH = 4_096;
export const MAX_PATH_SEGMENTS = 256;

export interface PathResolution {
  readonly found: boolean;
  readonly value?: ConfigNode;
}

function failPath(path: string | undefined, kind: string): never {
  throw new KasanePathError('Configuration path is invalid.', {
    details: {
      ...(path === undefined ? {} : { path }),
      kind,
      operation: 'parse-path',
    },
  });
}

/** Parses the one canonical dot-and-backslash path grammar. */
export function parsePath(path: string): readonly string[] {
  if (typeof path !== 'string') return failPath(undefined, 'non-string-path');
  if (path.length > MAX_PATH_LENGTH)
    return failPath(undefined, 'path-too-long');
  if (path === '') return ROOT_SEGMENTS;

  const segments: string[] = [];
  let segment = '';

  for (let index = 0; index < path.length; index += 1) {
    const character = path.charAt(index);

    if (character === '.') {
      if (segment.length === 0) return failPath(path, 'empty-segment');
      segments.push(segment);
      if (segments.length >= MAX_PATH_SEGMENTS) {
        return failPath(path, 'too-many-segments');
      }
      segment = '';
      continue;
    }

    if (character !== '\\') {
      segment += character;
      continue;
    }

    const escaped = path[index + 1];
    if (escaped !== '.' && escaped !== '\\') {
      return failPath(
        path,
        escaped === undefined ? 'dangling-escape' : 'invalid-escape',
      );
    }
    segment += escaped;
    index += 1;
  }

  if (segment.length === 0) return failPath(path, 'empty-segment');
  segments.push(segment);
  if (segments.length > MAX_PATH_SEGMENTS) {
    return failPath(path, 'too-many-segments');
  }

  return Object.freeze(segments);
}

/** Produces the unique canonical spelling for a parsed segment sequence. */
export function serializePath(segments: readonly string[]): string {
  if (segments.length > MAX_PATH_SEGMENTS) {
    return failPath(undefined, 'too-many-segments');
  }

  const path = segments
    .map((segment) => {
      if (segment.length === 0) return failPath(undefined, 'empty-segment');
      return segment.replaceAll('\\', '\\\\').replaceAll('.', '\\.');
    })
    .join('.');

  return path.length > MAX_PATH_LENGTH
    ? failPath(undefined, 'path-too-long')
    : path;
}

function arrayIndex(segment: string): number | undefined {
  if (!ARRAY_INDEX.test(segment)) return undefined;
  const index = Number(segment);
  return Number.isSafeInteger(index) ? index : undefined;
}

/** Resolves only own, safe properties and canonical array indices. */
export function resolvePath(
  root: ConfigNode,
  segments: readonly string[],
): PathResolution {
  let current: ConfigNode = root;

  for (const segment of segments) {
    if (!isSafeConfigKey(segment)) return { found: false };

    if (Array.isArray(current)) {
      const index = arrayIndex(segment);
      if (
        index === undefined ||
        index >= current.length ||
        !Object.prototype.hasOwnProperty.call(current, index)
      ) {
        return { found: false };
      }
      current = current[index] as ConfigNode;
      continue;
    }

    if (typeof current !== 'object' || current === null) {
      return { found: false };
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return { found: false };
    }
    current = current[segment] as ConfigNode;
  }

  return { found: true, value: current };
}

/** Small LRU used as instance-owned state by each snapshot. */
export class PathCache {
  readonly #entries = new Map<string, readonly string[]>();
  readonly #limit: number;

  constructor(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError('Path cache limit must be a positive safe integer.');
    }
    this.#limit = limit;
  }

  get size(): number {
    return this.#entries.size;
  }

  has(path: string): boolean {
    return this.#entries.has(path);
  }

  parse(path: string): readonly string[] {
    const cached = this.#entries.get(path);
    if (cached !== undefined) {
      this.#entries.delete(path);
      this.#entries.set(path, cached);
      return cached;
    }

    const parsed = parsePath(path);
    this.#entries.set(path, parsed);
    if (this.#entries.size > this.#limit) {
      const oldest = this.#entries.keys().next().value;
      if (oldest !== undefined) this.#entries.delete(oldest);
    }
    return parsed;
  }
}
