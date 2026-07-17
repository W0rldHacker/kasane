/** The complete context available to every built-in or custom source. */
export interface SourceContext {
  readonly cwd: string;
  readonly signal?: AbortSignal;
}

/** Provider-neutral source port. Returned data is normalized by orchestration. */
export interface LayerSource<Output = unknown> {
  readonly kind: string;
  /** May return a value directly or a promise; orchestration awaits both. */
  load(context: SourceContext): Output | Promise<Output>;
}

/** Safe source metadata never contains configuration values. */
export interface SourcePathReference {
  /** Canonical configuration path produced from this input. */
  readonly path: string;
  /** Safe provider identifier, such as an environment variable name. */
  readonly reference: string;
}

export interface SourceMetadata {
  readonly reference?: string;
  readonly inputReferences?: readonly string[];
  readonly pathReferences?: readonly SourcePathReference[];
}

/** Invocation-local result produced after one source has completed loading. */
export interface LoadedLayer {
  readonly name: string;
  readonly kind: string;
  readonly value: unknown;
  readonly metadata?: SourceMetadata;
}
