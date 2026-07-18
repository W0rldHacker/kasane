export function createNestedLayer(leafCount, depth, layerIndex) {
  const leaves = {};
  for (let index = 0; index < leafCount; index += 1) {
    leaves[`key-${String(index)}`] = layerIndex * leafCount + index;
  }

  let value = { values: leaves };
  for (let level = depth - 2; level >= 0; level -= 1) {
    value = { [`level-${String(level)}`]: value };
  }
  return value;
}

export function nestedLeafPath(depth, index) {
  const segments = [];
  for (let level = 0; level < depth - 1; level += 1) {
    segments.push(`level-${String(level)}`);
  }
  segments.push('values', `key-${String(index)}`);
  return segments.join('.');
}

export function createLayers(layerCount, leafCount, depth, factory) {
  return Array.from({ length: layerCount }, (_, index) =>
    factory(
      `layer-${String(index)}`,
      createNestedLayer(leafCount, depth, index),
    ),
  );
}

export function createLargeArray(length, offset = 0) {
  return Array.from({ length }, (_, index) => index + offset);
}

export function deterministicPaths(depth, leafCount, count) {
  return Array.from({ length: count }, (_, index) =>
    nestedLeafPath(depth, (index * 37) % leafCount),
  );
}
