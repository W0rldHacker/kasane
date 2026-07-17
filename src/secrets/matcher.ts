import { KasaneLayerError } from '../errors/index.js';
import { isSafeConfigKey } from '../normalize/safe-key.js';
import { parsePath, serializePath } from '../paths/index.js';

export interface SecretPathMatcher {
  matches(path: string): boolean;
}

interface CompiledPattern {
  readonly segments: readonly string[];
}

const NEVER_MATCHES: SecretPathMatcher = Object.freeze({
  matches(): boolean {
    return false;
  },
});

function failPattern(kind: string, path?: string, cause?: unknown): never {
  throw new KasaneLayerError('Secret path policy is invalid.', {
    ...(cause === undefined ? {} : { cause }),
    details: {
      kind,
      operation: 'compile-secret-paths',
      ...(path === undefined ? {} : { path }),
    },
  });
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Compiles exact and single-segment-wildcard subtree policies. */
export function createSecretPathMatcher(
  declarations: unknown,
): SecretPathMatcher {
  if (declarations === undefined) return NEVER_MATCHES;
  if (!Array.isArray(declarations)) return failPattern('invalid-secret-paths');

  const canonical = new Map<string, CompiledPattern>();
  const sortedDeclarations: string[] = [];
  for (const declaration of declarations as readonly unknown[]) {
    if (typeof declaration !== 'string') {
      return failPattern('non-string-secret-path');
    }
    sortedDeclarations.push(declaration);
  }

  for (const declaration of sortedDeclarations.sort()) {
    let segments: readonly string[];
    try {
      segments = parsePath(declaration);
    } catch (cause) {
      return failPattern('invalid-secret-path', declaration, cause);
    }
    for (const segment of segments) {
      if (segment === '**') {
        return failPattern(
          'unsupported-recursive-secret-wildcard',
          declaration,
        );
      }
      if (segment !== '*' && !isSafeConfigKey(segment)) {
        return failPattern('dangerous-secret-segment', declaration);
      }
    }

    const path = serializePath(segments);
    canonical.set(path, Object.freeze({ segments }));
  }

  const patterns = Object.freeze(
    [...canonical.entries()]
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([, pattern]) => pattern),
  );
  return Object.freeze({
    matches(path: string): boolean {
      const segments = parsePath(path);
      return patterns.some((pattern) => {
        if (pattern.segments.length > segments.length) return false;
        return pattern.segments.every(
          (segment, index) => segment === '*' || segment === segments[index],
        );
      });
    },
  });
}

function parentPath(path: string): string {
  for (let index = path.length - 1; index >= 0; index -= 1) {
    if (path[index] !== '.') continue;

    let escapes = 0;
    for (let escape = index - 1; escape >= 0; escape -= 1) {
      if (path[escape] !== '\\') break;
      escapes += 1;
    }
    if (escapes % 2 === 0) return path.slice(0, index);
  }
  return '';
}

/** Tests exact marker roots as subtrees without interpreting `*` specially. */
export function isInSecretSubtree(
  roots: ReadonlySet<string> | undefined,
  path: string,
): boolean {
  if (roots === undefined) return false;

  let candidate = path;
  while (candidate.length > 0) {
    if (roots.has(candidate)) return true;
    candidate = parentPath(candidate);
  }
  return roots.has('');
}
