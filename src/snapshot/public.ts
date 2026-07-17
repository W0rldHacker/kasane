import { ConfigSnapshot as InternalConfigSnapshot } from './snapshot.js';
import type { ConfigNode } from '../normalize/types.js';
import type {
  ConfigSnapshot as ConfigSnapshotContract,
  ConfigSnapshotConstructor,
} from '../public-types.js';

/** Stable public instance type for one immutable configuration snapshot. */
export type ConfigSnapshot<T = ConfigNode> = ConfigSnapshotContract<T>;

/** Runtime snapshot constructor with internal metadata options hidden. */
export const ConfigSnapshot: ConfigSnapshotConstructor = InternalConfigSnapshot;
