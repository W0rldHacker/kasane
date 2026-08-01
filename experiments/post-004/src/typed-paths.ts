import type { ConfigSnapshot } from '@worldhacker/kasane';

export type TypedPathDepth = 1 | 2 | 3 | 4 | 5 | 6;

type PreviousDepth = [never, 0, 1, 2, 3, 4, 5];
type StringKey<Value> = Extract<keyof Value, string>;

type ChildPath<Value, Depth extends TypedPathDepth | 0> = Depth extends 0
  ? never
  : Value extends readonly (infer Item)[]
    ? | `${number}`
      | (TypedPath<Item, PreviousDepth[Depth]> extends infer Rest extends string
          ? `${number}.${Rest}`
          : never)
    : Value extends object
      ? {
          [Key in StringKey<Value>]:
            | Key
            | (TypedPath<
                Value[Key],
                PreviousDepth[Depth]
              > extends infer Rest extends string
                ? `${Key}.${Rest}`
                : never);
        }[StringKey<Value>]
      : never;

/** Experimental only: bounded string paths without escaped-key support. */
export type TypedPath<Value, Depth extends TypedPathDepth | 0 = 4> = ChildPath<
  Value,
  Depth
>;

export type TypedPathValue<
  Value,
  Path extends string,
> = Path extends `${infer Head}.${infer Tail}`
  ? Value extends readonly (infer Item)[]
    ? Head extends `${number}`
      ? TypedPathValue<Item, Tail>
      : never
    : Head extends keyof Value
      ? TypedPathValue<Value[Head], Tail>
      : never
  : Value extends readonly (infer Item)[]
    ? Path extends `${number}`
      ? Item
      : never
    : Path extends keyof Value
      ? Value[Path]
      : never;

export interface TypedPathReader<Value, Depth extends TypedPathDepth> {
  readonly get: <Path extends TypedPath<Value, Depth>>(
    path: Path,
  ) => TypedPathValue<Value, Path> | undefined;
  readonly require: <Path extends TypedPath<Value, Depth>>(
    path: Path,
  ) => TypedPathValue<Value, Path>;
}

export interface TypedPathOptions<Depth extends TypedPathDepth> {
  readonly depth?: Depth;
}

/**
 * Removable prototype. Runtime behavior delegates to the stable snapshot API;
 * the cast exists only at this opt-in type boundary.
 */
export function typedPaths<Value, Depth extends TypedPathDepth = 4>(
  snapshot: ConfigSnapshot<Value>,
  options: TypedPathOptions<Depth> = {},
): TypedPathReader<Value, Depth> {
  const depth = options.depth ?? 4;
  if (!Number.isInteger(depth) || depth < 1 || depth > 6) {
    throw new TypeError('Typed path depth must be an integer from 1 through 6');
  }
  return Object.freeze({
    get: (path: TypedPath<Value, Depth>) => snapshot.get(path),
    require: (path: TypedPath<Value, Depth>) => snapshot.require(path),
  }) as TypedPathReader<Value, Depth>;
}
