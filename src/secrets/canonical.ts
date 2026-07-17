import type { ConfigNode } from '../normalize/types.js';

type EncodingTask =
  | Readonly<{ kind: 'node'; value: ConfigNode }>
  | Readonly<{ kind: 'text'; value: string }>;

function quoted(value: string): string {
  return JSON.stringify(value);
}

function encodedString(tag: 'k' | 's', value: string): string {
  const encoded = quoted(value);
  return `${tag}${String(encoded.length)}:${encoded};`;
}

function encodedNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new TypeError('Canonical numbers must be finite.');
  }
  return `n${String(Object.is(value, -0) ? 0 : value)};`;
}

/**
 * Emits the versioned canonical representation without materializing the
 * complete byte sequence. Values are expected to have passed normalization.
 */
export function* canonicalEncodingChunks(
  value: ConfigNode,
): Generator<string, void> {
  yield 'kasane-canonical-v1|';

  const pending: EncodingTask[] = [{ kind: 'node', value }];
  while (pending.length > 0) {
    const task = pending.pop();
    if (task === undefined) break;
    if (task.kind === 'text') {
      yield task.value;
      continue;
    }

    const node = task.value;
    if (node === null) {
      yield 'z;';
      continue;
    }
    switch (typeof node) {
      case 'boolean':
        yield node ? 'b1;' : 'b0;';
        break;
      case 'number':
        yield encodedNumber(node);
        break;
      case 'string':
        yield encodedString('s', node);
        break;
      case 'object': {
        if (Array.isArray(node)) {
          yield `a${String(node.length)}[`;
          pending.push({ kind: 'text', value: ']' });
          for (let index = node.length - 1; index >= 0; index -= 1) {
            pending.push({ kind: 'node', value: node[index] as ConfigNode });
          }
          break;
        }

        const keys = Object.keys(node).sort();
        yield `o${String(keys.length)}{`;
        pending.push({ kind: 'text', value: '}' });
        for (let index = keys.length - 1; index >= 0; index -= 1) {
          const key = keys[index];
          if (key === undefined) continue;
          pending.push({ kind: 'node', value: node[key] as ConfigNode });
          pending.push({ kind: 'text', value: encodedString('k', key) });
        }
        break;
      }
    }
  }
}

/** Materializes the canonical form for fixtures and diagnostics-free tests. */
export function encodeCanonicalConfigNode(value: ConfigNode): string {
  return [...canonicalEncodingChunks(value)].join('');
}
