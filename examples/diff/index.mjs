import { kasane, value } from '@w0rldhacker/kasane';

const before = await kasane({
  layers: [value('project-file', { mode: 'stable' })],
});
const after = await kasane({
  layers: [
    {
      name: 'runtime-source',
      source: { kind: 'custom', load: () => ({ mode: 'stable' }) },
    },
  ],
});
const [change] = before.diff(after).changes;

if (
  change === undefined ||
  change.type === 'added' ||
  change.type === 'removed'
) {
  throw new Error('Expected a two-sided source-only change.');
}

console.log(
  JSON.stringify({
    afterSource: change.after.source.available
      ? change.after.source.name
      : undefined,
    beforeSource: change.before.source.available
      ? change.before.source.name
      : undefined,
    path: change.path,
    type: change.type,
  }),
);
