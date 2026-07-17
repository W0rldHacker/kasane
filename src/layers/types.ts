import type { LayerSource } from '../sources/index.js';
import type { SourceMetadataResolver } from '../sources/index.js';

/** One explicitly ordered configuration layer declaration. */
export interface LayerDescriptor {
  readonly name: string;
  readonly source: LayerSource;
  readonly enabled?: boolean;
  readonly secret?: boolean;
}

/** Validated invocation-local layer used only by orchestration. */
export interface PreparedLayer {
  readonly name: string;
  readonly kind: string;
  readonly source: LayerSource;
  readonly load: LayerSource['load'];
  readonly metadata?: SourceMetadataResolver;
  readonly enabled: boolean;
  readonly secret: boolean;
}
