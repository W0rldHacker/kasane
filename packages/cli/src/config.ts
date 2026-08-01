import { createReadStream } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { env, file, kasane, value } from '@worldhacker/kasane';
import type {
  ConfigSnapshot,
  EnvLayerOptions,
  EnvMap,
  EnvSource,
  KasaneLimits,
  LayerDescriptor,
  MergeRuleDeclarations,
} from '@worldhacker/kasane';

import { CLI_EXIT_CODES, CliError } from './errors.js';

export const CLI_CONFIG_VERSION = 1 as const;
export const DEFAULT_CONFIG_FILE = 'kasane.config.json';
export const DEFAULT_MAX_CONFIG_BYTES = 1_000_000;

interface LayerCommon {
  readonly enabled?: boolean;
  readonly name: string;
  readonly secret?: boolean;
}

export interface CliValueLayer extends LayerCommon {
  readonly data: unknown;
  readonly type: 'value';
}

export interface CliFileLayer extends LayerCommon {
  readonly optional?: boolean;
  readonly path: string;
  readonly type: 'file';
}

export interface CliEnvLayer extends LayerCommon {
  readonly case?: 'lower' | 'preserve';
  readonly coerce?: false | 'json';
  readonly map?: EnvMap;
  readonly prefix?: string;
  readonly separator?: string;
  readonly type: 'env';
}

export type CliLayer = CliEnvLayer | CliFileLayer | CliValueLayer;

export interface CliConfigV1 {
  readonly cwd?: string;
  readonly layers: readonly CliLayer[];
  readonly limits?: KasaneLimits;
  readonly merge?: MergeRuleDeclarations;
  readonly secrets?: readonly string[];
  readonly version: typeof CLI_CONFIG_VERSION;
}

export interface LoadCliConfigOptions {
  readonly configPath?: string;
  readonly cwd?: string;
  readonly environment?: EnvSource;
  readonly maxConfigBytes?: number;
}

export interface LoadedCliConfig {
  readonly config: CliConfigV1;
  readonly configPath: string;
  readonly cwd: string;
  readonly snapshot: ConfigSnapshot<unknown>;
}

function failInvalid(kind: string, field?: string): never {
  throw new CliError(
    'KASANE_CLI_CONFIG_INVALID',
    'Kasane CLI configuration is invalid.',
    CLI_EXIT_CODES.config,
    { kind, ...(field === undefined ? {} : { field }) },
  );
}

function errorCode(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function own(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function exactFields(
  input: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  field: string,
): void {
  const unexpected = Object.keys(input).find((key) => !allowed.has(key));
  if (unexpected !== undefined)
    failInvalid('unknown-field', `${field}.${unexpected}`);
}

function optionalBoolean(
  input: Record<string, unknown>,
  key: string,
  field: string,
): boolean | undefined {
  const result = input[key];
  if (result !== undefined && typeof result !== 'boolean') {
    failInvalid('invalid-boolean', `${field}.${key}`);
  }
  return result;
}

function parseEnvMap(input: unknown, field: string): EnvMap | undefined {
  if (input === undefined) return undefined;
  if (!isRecord(input)) failInvalid('invalid-env-map', field);
  const result: Record<string, string | Readonly<{ path: string }>> = {};
  for (const variable of Object.keys(input).sort()) {
    const declaration = input[variable];
    if (typeof declaration === 'string') {
      result[variable] = declaration;
      continue;
    }
    if (!isRecord(declaration)) failInvalid('invalid-env-map-entry', field);
    exactFields(declaration, new Set(['path']), `${field}.${variable}`);
    const targetPath = declaration['path'];
    if (typeof targetPath !== 'string') {
      failInvalid('invalid-env-map-path', `${field}.${variable}.path`);
    }
    result[variable] = Object.freeze({ path: targetPath });
  }
  return Object.freeze(result);
}

function parseLayer(input: unknown, index: number): CliLayer {
  const field = `layers.${String(index)}`;
  if (!isRecord(input)) failInvalid('invalid-layer', field);
  const name = input['name'];
  const type = input['type'];
  if (typeof name !== 'string' || name.length === 0) {
    failInvalid('invalid-layer-name', `${field}.name`);
  }
  const enabled = optionalBoolean(input, 'enabled', field);
  const secret = optionalBoolean(input, 'secret', field);

  if (type === 'value') {
    exactFields(
      input,
      new Set(['data', 'enabled', 'name', 'secret', 'type']),
      field,
    );
    if (!own(input, 'data')) failInvalid('missing-layer-data', `${field}.data`);
    return Object.freeze({
      data: input['data'],
      ...(enabled === undefined ? {} : { enabled }),
      name,
      ...(secret === undefined ? {} : { secret }),
      type,
    });
  }

  if (type === 'file') {
    exactFields(
      input,
      new Set(['enabled', 'name', 'optional', 'path', 'secret', 'type']),
      field,
    );
    const filePath = input['path'];
    if (typeof filePath !== 'string' || filePath.length === 0) {
      failInvalid('invalid-file-path', `${field}.path`);
    }
    const optional = optionalBoolean(input, 'optional', field);
    return Object.freeze({
      ...(enabled === undefined ? {} : { enabled }),
      name,
      ...(optional === undefined ? {} : { optional }),
      path: filePath,
      ...(secret === undefined ? {} : { secret }),
      type,
    });
  }

  if (type === 'env') {
    exactFields(
      input,
      new Set([
        'case',
        'coerce',
        'enabled',
        'map',
        'name',
        'prefix',
        'secret',
        'separator',
        'type',
      ]),
      field,
    );
    const casing = input['case'];
    const coerce = input['coerce'];
    const prefix = input['prefix'];
    const separator = input['separator'];
    if (casing !== undefined && casing !== 'lower' && casing !== 'preserve') {
      failInvalid('invalid-env-case', `${field}.case`);
    }
    if (coerce !== undefined && coerce !== false && coerce !== 'json') {
      failInvalid('invalid-env-coerce', `${field}.coerce`);
    }
    if (prefix !== undefined && typeof prefix !== 'string') {
      failInvalid('invalid-env-prefix', `${field}.prefix`);
    }
    if (
      separator !== undefined &&
      (typeof separator !== 'string' || separator.length === 0)
    ) {
      failInvalid('invalid-env-separator', `${field}.separator`);
    }
    const map = parseEnvMap(input['map'], `${field}.map`);
    const safePrefix = typeof prefix === 'string' ? prefix : undefined;
    const safeSeparator = typeof separator === 'string' ? separator : undefined;
    return Object.freeze({
      ...(casing === undefined ? {} : { case: casing }),
      ...(coerce === undefined ? {} : { coerce }),
      ...(enabled === undefined ? {} : { enabled }),
      ...(map === undefined ? {} : { map }),
      name,
      ...(safePrefix === undefined ? {} : { prefix: safePrefix }),
      ...(secret === undefined ? {} : { secret }),
      ...(safeSeparator === undefined ? {} : { separator: safeSeparator }),
      type,
    });
  }

  return failInvalid('unsupported-layer-type', `${field}.type`);
}

function parseLimits(input: unknown): KasaneLimits | undefined {
  if (input === undefined) return undefined;
  if (!isRecord(input)) failInvalid('invalid-limits', 'limits');
  exactFields(
    input,
    new Set(['maxDepth', 'maxNodes', 'maxSourceBytes', 'maxStringLength']),
    'limits',
  );
  const result: Record<string, number> = {};
  for (const key of Object.keys(input)) {
    const value = input[key];
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      failInvalid('invalid-limit', `limits.${key}`);
    }
    result[key] = value;
  }
  return Object.freeze(result);
}

function parseMerge(input: unknown): MergeRuleDeclarations | undefined {
  if (input === undefined) return undefined;
  if (!isRecord(input)) failInvalid('invalid-merge', 'merge');
  const result: Record<string, 'append' | 'merge' | 'prepend' | 'replace'> = {};
  for (const key of Object.keys(input)) {
    const strategy = input[key];
    if (
      strategy !== 'append' &&
      strategy !== 'merge' &&
      strategy !== 'prepend' &&
      strategy !== 'replace'
    ) {
      failInvalid('invalid-merge-strategy', `merge.${key}`);
    }
    result[key] = strategy;
  }
  return Object.freeze(result);
}

function parseSecrets(input: unknown): readonly string[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) failInvalid('invalid-secrets', 'secrets');
  const result: string[] = [];
  for (const entry of input) {
    if (typeof entry !== 'string') failInvalid('invalid-secrets', 'secrets');
    result.push(entry);
  }
  return Object.freeze(result);
}

export function parseCliConfig(input: unknown): CliConfigV1 {
  if (!isRecord(input)) failInvalid('invalid-root');
  exactFields(
    input,
    new Set(['cwd', 'layers', 'limits', 'merge', 'secrets', 'version']),
    'config',
  );
  if (input['version'] !== CLI_CONFIG_VERSION) {
    failInvalid('unsupported-version', 'version');
  }
  if (!Array.isArray(input['layers']) || input['layers'].length === 0) {
    failInvalid('invalid-layers', 'layers');
  }
  if (input['cwd'] !== undefined && typeof input['cwd'] !== 'string') {
    failInvalid('invalid-cwd', 'cwd');
  }
  const layers = Object.freeze(input['layers'].map(parseLayer));
  const limits = parseLimits(input['limits']);
  const merge = parseMerge(input['merge']);
  const secrets = parseSecrets(input['secrets']);
  const configuredCwd = input['cwd'];
  return Object.freeze({
    ...(configuredCwd === undefined ? {} : { cwd: configuredCwd }),
    layers,
    ...(limits === undefined ? {} : { limits }),
    ...(merge === undefined ? {} : { merge }),
    ...(secrets === undefined ? {} : { secrets }),
    version: CLI_CONFIG_VERSION,
  });
}

async function readBoundedConfig(
  configPath: string,
  maxConfigBytes: number,
): Promise<string> {
  if (!Number.isSafeInteger(maxConfigBytes) || maxConfigBytes < 0) {
    return failInvalid('invalid-max-config-bytes');
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for await (const chunk of createReadStream(configPath, {
      highWaterMark: 64 * 1024,
    }) as AsyncIterable<Buffer>) {
      bytes += chunk.byteLength;
      if (bytes > maxConfigBytes) failInvalid('config-too-large');
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    if (errorCode(error) === 'ENOENT') {
      throw new CliError(
        'KASANE_CLI_CONFIG_NOT_FOUND',
        'Kasane CLI configuration file was not found.',
        CLI_EXIT_CODES.config,
        { configPath },
      );
    }
    throw new CliError(
      'KASANE_CLI_CONFIG_INVALID',
      'Kasane CLI configuration file could not be read.',
      CLI_EXIT_CODES.config,
      { configPath, kind: 'config-read-error' },
    );
  }
  return Buffer.concat(chunks, bytes).toString('utf8');
}

function descriptors(
  layers: readonly CliLayer[],
  environment: EnvSource | undefined,
): readonly LayerDescriptor[] {
  return layers.map((layer) => {
    const common = {
      ...(layer.enabled === undefined ? {} : { enabled: layer.enabled }),
      ...(layer.secret === undefined ? {} : { secret: layer.secret }),
    };
    if (layer.type === 'value') return value(layer.name, layer.data, common);
    if (layer.type === 'file') {
      return file(layer.name, layer.path, {
        ...common,
        ...(layer.optional === undefined ? {} : { optional: layer.optional }),
      });
    }
    const options: EnvLayerOptions = {
      ...common,
      ...(layer.case === undefined ? {} : { case: layer.case }),
      ...(layer.coerce === undefined ? {} : { coerce: layer.coerce }),
      ...(layer.map === undefined ? {} : { map: layer.map }),
      ...(layer.prefix === undefined ? {} : { prefix: layer.prefix }),
      ...(layer.separator === undefined ? {} : { separator: layer.separator }),
      ...(environment === undefined ? {} : { source: environment }),
    };
    return env(layer.name, options);
  });
}

export async function loadCliConfig(
  options: LoadCliConfigOptions = {},
): Promise<LoadedCliConfig> {
  const invocationCwd = path.resolve(options.cwd ?? process.cwd());
  const configPath = path.resolve(
    invocationCwd,
    options.configPath ?? DEFAULT_CONFIG_FILE,
  );
  const source = await readBoundedConfig(
    configPath,
    options.maxConfigBytes ?? DEFAULT_MAX_CONFIG_BYTES,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return failInvalid('invalid-json');
  }
  const config = parseCliConfig(parsed);
  const configDirectory = path.dirname(configPath);
  const cwd = path.resolve(configDirectory, config.cwd ?? '.');
  const snapshot = await kasane({
    cwd,
    layers: descriptors(config.layers, options.environment),
    ...(config.limits === undefined ? {} : { limits: config.limits }),
    ...(config.merge === undefined ? {} : { merge: config.merge }),
    provenance: 'full',
    ...(config.secrets === undefined ? {} : { secrets: config.secrets }),
  });
  return Object.freeze({ config, configPath, cwd, snapshot });
}
