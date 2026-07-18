import { KasaneMergeError, KasaneSecurityError } from '../errors/index.js';
import { isRemoveMarker } from '../merge/remove.js';
import type {
  MergeLayerNode,
  MergeLayerObject,
  RemoveMarker,
} from '../merge/remove.js';
import { boundedUtf8ByteLength, resolveNormalizeLimits } from './limits.js';
import type { NormalizeLimits, ResolvedNormalizeLimits } from './limits.js';
import { isPlainObject } from './plain-object.js';
import { isSafeConfigKey } from './safe-key.js';
import type { ConfigArray, ConfigNode } from './types.js';
import { unwrapSecretValue } from '../secrets/secret-value.js';

type NormalizedNode = ConfigNode | MergeLayerObject | RemoveMarker;
type NormalizedObject = Record<string, NormalizedNode>;

const ARRAY_INDEX = /^(?:0|[1-9][0-9]*)$/u;

interface PreparedChild {
  readonly key: number | string;
  readonly path: string;
  readonly value: unknown;
}

type Assignment =
  | { readonly kind: 'root' }
  | {
      readonly index: number;
      readonly kind: 'array';
      readonly target: ConfigArray;
    }
  | {
      readonly key: string;
      readonly kind: 'object';
      readonly target: NormalizedObject;
    };

interface VisitTask {
  readonly assignment: Assignment;
  readonly depth: number;
  readonly kind: 'visit';
  readonly path: string;
  readonly insideArray: boolean;
  readonly value: unknown;
}

interface ExitTask {
  readonly kind: 'exit';
  readonly value: object;
}

type WorkItem = ExitTask | VisitTask;

interface NormalizeContext {
  readonly allowRemove: boolean;
  readonly ancestors: Set<object>;
  readonly limits: ResolvedNormalizeLimits;
  readonly secretPaths: Set<string>;
  nodes: number;
}

export interface NormalizedLayerResult {
  readonly secretPaths: ReadonlySet<string>;
  readonly value: MergeLayerNode | undefined;
}

function appendPath(parent: string, segment: string): string {
  let escaped = '';
  let index = 0;

  while (index < segment.length) {
    const character = segment[index] ?? '';
    if (character === '\\' || character === '.') escaped += '\\';
    escaped += character;
    index += 1;
  }

  return parent === '' ? escaped : `${parent}.${escaped}`;
}

function failValue(path: string, kind: string): never {
  throw new KasaneMergeError('Unsupported configuration value.', {
    details: {
      path,
      kind,
      operation: 'normalize',
    },
  });
}

function failCycle(path: string): never {
  throw new KasaneMergeError('Circular configuration structure.', {
    details: {
      path,
      kind: 'circular-reference',
      operation: 'normalize',
    },
  });
}

function failDangerousKey(path: string): never {
  throw new KasaneSecurityError('Unsafe configuration key.', {
    details: {
      path,
      kind: 'dangerous-key',
      operation: 'normalize',
    },
  });
}

function failLimit(
  path: string,
  limits: Readonly<Record<string, number>>,
): never {
  throw new KasaneSecurityError('Configuration normalization limit exceeded.', {
    details: {
      path,
      kind: 'limit-exceeded',
      operation: 'normalize',
      limits,
    },
  });
}

function ownKeys(value: object, path: string): readonly PropertyKey[] {
  try {
    return Reflect.ownKeys(value);
  } catch {
    return failValue(path, 'uninspectable-object');
  }
}

function ownDescriptor(
  value: object,
  property: PropertyKey,
  path: string,
): PropertyDescriptor {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, property);
    return descriptor ?? failValue(path, 'unstable-property');
  } catch {
    return failValue(path, 'uninspectable-property');
  }
}

function dataValue(descriptor: PropertyDescriptor): unknown {
  return descriptor.value as unknown;
}

function validateDataProperty(
  descriptor: PropertyDescriptor,
  path: string,
): unknown {
  if (!('value' in descriptor)) return failValue(path, 'accessor-property');
  if (descriptor.enumerable !== true) {
    return failValue(path, 'non-enumerable-property');
  }
  return dataValue(descriptor);
}

function arrayLength(value: unknown[], path: string): number {
  const descriptor = ownDescriptor(value, 'length', path);
  const length = dataValue(descriptor);

  if (
    !('value' in descriptor) ||
    descriptor.enumerable !== false ||
    typeof length !== 'number' ||
    !Number.isSafeInteger(length) ||
    length < 0
  ) {
    return failValue(path, 'invalid-array-length');
  }

  return length;
}

function prepareArray(
  value: unknown[],
  path: string,
): readonly PreparedChild[] {
  const length = arrayLength(value, path);
  let indexCount = 0;

  for (const key of ownKeys(value, path)) {
    if (typeof key !== 'string') return failValue(path, 'symbol-key');
    if (key === 'length') continue;

    const propertyPath = appendPath(path, key);
    if (!isSafeConfigKey(key)) return failDangerousKey(propertyPath);
    if (!ARRAY_INDEX.test(key))
      return failValue(propertyPath, 'array-property');

    const index = Number(key);
    if (!Number.isSafeInteger(index) || index >= length) {
      return failValue(propertyPath, 'array-property');
    }

    indexCount += 1;
  }

  if (indexCount !== length) return failValue(path, 'sparse-array');

  const children: PreparedChild[] = [];
  for (let index = 0; index < length; index += 1) {
    const indexPath = appendPath(path, String(index));
    const descriptor = ownDescriptor(value, String(index), indexPath);
    const item = validateDataProperty(descriptor, indexPath);
    if (item === undefined) return failValue(indexPath, 'undefined-array-item');
    children.push({ key: index, path: indexPath, value: item });
  }

  return children;
}

function prepareObject(
  value: Record<string, unknown>,
  path: string,
): readonly PreparedChild[] {
  const children: PreparedChild[] = [];

  for (const key of ownKeys(value, path)) {
    if (typeof key !== 'string') return failValue(path, 'symbol-key');

    const propertyPath = appendPath(path, key);
    if (!isSafeConfigKey(key)) return failDangerousKey(propertyPath);

    const descriptor = ownDescriptor(value, key, propertyPath);
    const propertyValue = validateDataProperty(descriptor, propertyPath);
    if (propertyValue === undefined) continue;
    children.push({ key, path: propertyPath, value: propertyValue });
  }

  return children;
}

function defineConfigProperty(
  target: NormalizedObject,
  key: string,
  value: NormalizedNode,
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function assignValue(
  assignment: Assignment,
  value: NormalizedNode,
  setRoot: (value: NormalizedNode) => void,
): void {
  switch (assignment.kind) {
    case 'array':
      assignment.target[assignment.index] = value as ConfigNode;
      return;
    case 'object':
      defineConfigProperty(assignment.target, assignment.key, value);
      return;
    case 'root':
      setRoot(value);
  }
}

function reserveNode(
  context: NormalizeContext,
  path: string,
  depth: number,
): void {
  if (depth > context.limits.maxDepth) {
    return failLimit(path, {
      actualDepth: depth,
      maxDepth: context.limits.maxDepth,
    });
  }

  const nextNodeCount = context.nodes + 1;
  if (nextNodeCount > context.limits.maxNodes) {
    return failLimit(path, {
      actualNodes: nextNodeCount,
      maxNodes: context.limits.maxNodes,
    });
  }

  context.nodes = nextNodeCount;
}

function normalizePrimitive(
  value: null | boolean | number | string,
  path: string,
  limits: ResolvedNormalizeLimits,
): null | boolean | number | string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return failValue(path, 'non-finite-number');
    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value === 'string') {
    const bytes = boundedUtf8ByteLength(value, limits.maxStringLength);
    if (bytes > limits.maxStringLength) {
      return failLimit(path, {
        maxStringLength: limits.maxStringLength,
        observedStringBytes: bytes,
      });
    }
  }

  return value;
}

function childAssignment(
  output: ConfigArray | NormalizedObject,
  child: PreparedChild,
  array: boolean,
): Assignment {
  if (array) {
    return {
      index: child.key as number,
      kind: 'array',
      target: output as ConfigArray,
    };
  }

  return {
    key: child.key as string,
    kind: 'object',
    target: output as NormalizedObject,
  };
}

function processContainer(
  task: VisitTask,
  value: object,
  context: NormalizeContext,
  work: WorkItem[],
  setRoot: (value: NormalizedNode) => void,
): void {
  if (context.ancestors.has(value)) return failCycle(task.path);

  let array: boolean;
  try {
    array = Array.isArray(value);
  } catch {
    return failValue(task.path, 'uninspectable-object');
  }
  if (!array && !isPlainObject(value)) {
    return failValue(task.path, 'non-plain-object');
  }

  const children = array
    ? prepareArray(value as unknown[], task.path)
    : prepareObject(value as Record<string, unknown>, task.path);
  const output: ConfigArray | NormalizedObject = array ? [] : {};

  assignValue(task.assignment, output, setRoot);
  context.ancestors.add(value);
  work.push({ kind: 'exit', value });

  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (!child) continue;

    work.push({
      assignment: childAssignment(output, child, array),
      depth: task.depth + 1,
      kind: 'visit',
      path: child.path,
      insideArray: task.insideArray || array,
      value: child.value,
    });
  }
}

/**
 * Converts an untrusted layer value into a detached, bounded canonical tree.
 *
 * Root `undefined` is the only no-op representation. Traversal is iterative;
 * cycle detection tracks only active ancestors so shared subtrees remain valid.
 */
function normalizeNodeWithAnnotations(
  input: unknown,
  limitOverrides: NormalizeLimits | undefined,
  allowRemove: boolean,
): NormalizedLayerResult {
  const limits = resolveNormalizeLimits(limitOverrides);
  if (input === undefined) {
    return Object.freeze({ secretPaths: new Set<string>(), value: undefined });
  }

  const context: NormalizeContext = {
    allowRemove,
    ancestors: new Set(),
    limits,
    secretPaths: new Set(),
    nodes: 0,
  };
  const work: WorkItem[] = [
    {
      assignment: { kind: 'root' },
      depth: 0,
      kind: 'visit',
      path: '',
      insideArray: false,
      value: input,
    },
  ];
  let result: NormalizedNode | undefined;
  const setRoot = (value: NormalizedNode): void => {
    result = value;
  };

  while (work.length > 0) {
    const task = work.pop();
    if (!task) break;

    if (task.kind === 'exit') {
      context.ancestors.delete(task.value);
      continue;
    }

    let taskValue = task.value;
    let annotation = unwrapSecretValue(taskValue);
    while (annotation !== undefined) {
      context.secretPaths.add(task.path);
      taskValue = annotation.value;
      annotation = unwrapSecretValue(taskValue);
    }

    if (taskValue === undefined) {
      if (task.insideArray) failValue(task.path, 'undefined-array-item');
      continue;
    }

    reserveNode(context, task.path, task.depth);

    if (isRemoveMarker(taskValue)) {
      if (!context.allowRemove) failValue(task.path, 'unsupported-symbol');
      if (task.insideArray) failValue(task.path, 'remove-in-array');
      assignValue(task.assignment, taskValue, setRoot);
      continue;
    }

    if (taskValue === null) {
      assignValue(task.assignment, null, setRoot);
      continue;
    }

    switch (typeof taskValue) {
      case 'boolean':
      case 'number':
      case 'string':
        assignValue(
          task.assignment,
          normalizePrimitive(taskValue, task.path, context.limits),
          setRoot,
        );
        break;
      case 'object':
        processContainer(
          { ...task, value: taskValue },
          taskValue,
          context,
          work,
          setRoot,
        );
        break;
      case 'bigint':
      case 'function':
      case 'symbol':
      case 'undefined':
        failValue(task.path, `unsupported-${typeof taskValue}`);
        break;
      default:
        failValue(task.path, 'unsupported-type');
    }
  }

  return Object.freeze({
    secretPaths: new Set(context.secretPaths),
    value: result,
  });
}

function normalizeNode(
  input: unknown,
  limitOverrides: NormalizeLimits | undefined,
  allowRemove: boolean,
): NormalizedNode | undefined {
  return normalizeNodeWithAnnotations(input, limitOverrides, allowRemove).value;
}

/** Normalizes a materialized configuration/validation value. */
export function normalizeConfigNode(
  input: unknown,
  limitOverrides?: NormalizeLimits,
): ConfigNode | undefined {
  return normalizeNode(input, limitOverrides, false) as ConfigNode | undefined;
}

/** Normalizes one merge layer while preserving root/object remove controls. */
export function normalizeLayerNode(
  input: unknown,
  limitOverrides?: NormalizeLimits,
): MergeLayerNode | undefined {
  return normalizeNode(input, limitOverrides, true);
}

/** Normalizes a layer and returns exact subtree roots from `secretValue`. */
export function normalizeAnnotatedLayerNode(
  input: unknown,
  limitOverrides?: NormalizeLimits,
): NormalizedLayerResult {
  return normalizeNodeWithAnnotations(input, limitOverrides, true);
}
