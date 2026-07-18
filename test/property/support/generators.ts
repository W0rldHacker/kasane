import * as fc from 'fast-check';

import { remove } from '../../../src/index.js';
import type { MergeStrategy } from '../../../src/index.js';
import { provenanceModes, serializeTestPath } from './types.js';
import type {
  CanonicalNode,
  CanonicalObject,
  CanonicalPrimitive,
  GeneratedMergeCase,
  LayerNode,
  LayerObject,
} from './types.js';

const keys = [
  'a',
  'b',
  'items',
  'nested',
  'nullable',
  'removed',
  'ignored',
  '0',
  'a.b',
  'slash\\key',
] as const;

const keyArbitrary = fc.constantFrom(...keys);
const primitiveArbitrary: fc.Arbitrary<CanonicalPrimitive> = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer({ max: 100, min: -100 }),
  fc.string({ maxLength: 8 }),
);

const canonicalNode: (depth: number) => fc.Arbitrary<CanonicalNode> =
  fc.memo<CanonicalNode>((depth): fc.Arbitrary<CanonicalNode> => {
    if (depth <= 1) return primitiveArbitrary;
    return fc.oneof(
      { arbitrary: primitiveArbitrary, weight: 5 },
      {
        arbitrary: fc.array(canonicalNode(depth - 1), { maxLength: 3 }),
        weight: 2,
      },
      {
        arbitrary: fc.dictionary(keyArbitrary, canonicalNode(depth - 1), {
          maxKeys: 4,
        }),
        weight: 3,
      },
    );
  });

const layerNode: (depth: number) => fc.Arbitrary<LayerNode | undefined> =
  fc.memo<LayerNode | undefined>(
    (depth): fc.Arbitrary<LayerNode | undefined> => {
      const controls = fc.oneof(fc.constant(undefined), fc.constant(remove));
      if (depth <= 1) return fc.oneof(primitiveArbitrary, controls);

      return fc.oneof(
        { arbitrary: primitiveArbitrary, weight: 5 },
        { arbitrary: controls, weight: 2 },
        {
          arbitrary: fc.array(canonicalNode(depth - 1), { maxLength: 3 }),
          weight: 2,
        },
        {
          arbitrary: fc.dictionary(keyArbitrary, layerNode(depth - 1), {
            maxKeys: 4,
          }),
          weight: 3,
        },
      );
    },
  );

const canonicalObjectArbitrary: fc.Arbitrary<CanonicalObject> = fc.dictionary(
  keyArbitrary,
  canonicalNode(4),
  { maxKeys: 5 },
);

const randomLayerObjectArbitrary: fc.Arbitrary<LayerObject> = fc.dictionary(
  keyArbitrary,
  layerNode(4),
  { maxKeys: 5 },
);

const layerObjectArbitrary: fc.Arbitrary<LayerObject> = fc
  .tuple(randomLayerObjectArbitrary, fc.boolean())
  .map(([generated, includeControls]) =>
    includeControls
      ? {
          ...generated,
          ignored: undefined,
          removed: remove,
        }
      : generated,
  );

export const provenanceModeArbitrary = fc.constantFrom(...provenanceModes);

export const defaultMergeCaseArbitrary: fc.Arbitrary<GeneratedMergeCase> = fc
  .tuple(
    canonicalObjectArbitrary,
    fc.array(layerObjectArbitrary, { maxLength: 3, minLength: 1 }),
  )
  .map(([base, patches]) => ({
    layers: [base, ...patches].map((value, index) => ({
      name: `layer-${String(index)}`,
      value,
    })),
    rules: {},
  }));

interface Collision {
  readonly incoming: LayerNode;
  readonly old: CanonicalNode;
  readonly path: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectCollisions(
  old: CanonicalNode,
  incoming: LayerNode,
  segments: readonly string[] = [],
): readonly Collision[] {
  const collisions: Collision[] = [
    { incoming, old, path: serializeTestPath(segments) },
  ];

  if (!isObject(old) || !isObject(incoming)) return collisions;
  for (const key of Object.keys(incoming)) {
    if (!Object.prototype.hasOwnProperty.call(old, key)) continue;
    const incomingChild = incoming[key];
    if (incomingChild === undefined || incomingChild === remove) continue;
    collisions.push(
      ...collectCollisions(old[key] as CanonicalNode, incomingChild, [
        ...segments,
        key,
      ]),
    );
  }
  return collisions;
}

function validStrategies(collision: Collision): readonly MergeStrategy[] {
  if (Array.isArray(collision.old) && Array.isArray(collision.incoming)) {
    return ['replace', 'append', 'prepend'];
  }
  if (isObject(collision.old) && isObject(collision.incoming)) {
    return ['replace', 'merge'];
  }
  return ['replace'];
}

export const ruledMergeCaseArbitrary: fc.Arbitrary<GeneratedMergeCase> = fc
  .tuple(canonicalObjectArbitrary, layerObjectArbitrary)
  .chain(([base, patch]) => {
    const choices = collectCollisions(base, patch).flatMap((collision) =>
      validStrategies(collision).map((strategy) => ({
        path: collision.path,
        strategy,
      })),
    );
    const rulesArbitrary = fc.uniqueArray(fc.constantFrom(...choices), {
      maxLength: 3,
      selector: (rule) => rule.path,
    });

    return rulesArbitrary.map((rules) => ({
      layers: [
        { name: 'layer-0', value: base },
        { name: 'layer-1', value: patch },
      ],
      rules: Object.fromEntries(
        rules.map((rule) => [rule.path, rule.strategy]),
      ),
    }));
  });

export const repeatedLayerNameArbitrary = fc
  .tuple(fc.string({ maxLength: 12, minLength: 1 }), canonicalObjectArbitrary)
  .map(([generatedName, value]) => ({
    name: `layer-${generatedName.trim() || 'x'}`,
    value,
  }));
