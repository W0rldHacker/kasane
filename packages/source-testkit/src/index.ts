import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  file,
  kasane,
  KasaneSecurityError,
  KasaneSourceError,
  value,
} from '@worldhacker/kasane';
import type {
  FileParser,
  LayerDescriptor,
  SourceContext,
} from '@worldhacker/kasane';

export interface SafeProviderReference {
  readonly provider: string;
  readonly resource: string;
  readonly fields?: readonly string[];
}

export type SourceConformanceCase =
  | { readonly mode: 'value'; readonly value: unknown }
  | { readonly failureCanary: string; readonly mode: 'failure' }
  | { readonly mode: 'abort' }
  | { readonly mode: 'dangerous-keys' }
  | { readonly mode: 'secret'; readonly secretCanary: string };

export interface SourceConformanceSubject {
  readonly layer: LayerDescriptor;
  readonly reference?: SafeProviderReference;
  readonly dispose?: () => void | Promise<void>;
}

export interface SourceConformanceAdapter {
  readonly name: string;
  readonly create: (
    fixture: SourceConformanceCase,
  ) => SourceConformanceSubject | Promise<SourceConformanceSubject>;
}

export interface ParserConformanceAdapter {
  readonly dangerousSource: string;
  readonly failureCanary: string;
  readonly invalidSource: string;
  readonly name: string;
  readonly parse: FileParser;
  readonly secretCanary: string;
  readonly secretPath?: string;
  readonly secretSource: string;
  readonly validSource: string;
  readonly validValue: unknown;
}

export interface ConformanceReport {
  readonly adapter: string;
  readonly scenarios: readonly string[];
}

function nonEmptyString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== 'string') {
    assert.fail(`${label} must be a string`);
  }
  assert(value.length > 0, `${label} cannot be empty`);
  assert(value.length <= 512, `${label} exceeds the safe reference limit`);
}

export function assertSafeProviderReference(
  reference: unknown,
  forbiddenValues: readonly string[] = [],
): asserts reference is SafeProviderReference {
  assert(
    typeof reference === 'object' && reference !== null,
    'Provider reference must be an object',
  );
  const prototype = Reflect.getPrototypeOf(reference);
  assert(
    prototype === Object.prototype || prototype === null,
    'Provider reference must be a plain object',
  );
  const candidate = reference as Record<PropertyKey, unknown>;
  const keys = Reflect.ownKeys(reference);
  assert(
    keys.every(
      (key) =>
        typeof key === 'string' &&
        ['fields', 'provider', 'resource'].includes(key),
    ),
    'Provider reference contains an unsupported field',
  );
  nonEmptyString(candidate['provider'], 'reference.provider');
  nonEmptyString(candidate['resource'], 'reference.resource');
  if (candidate['fields'] !== undefined) {
    assert(
      Array.isArray(candidate['fields']),
      'reference.fields must be an array',
    );
    for (const field of candidate['fields']) {
      nonEmptyString(field, 'reference.fields entry');
    }
  }
  const serialized = JSON.stringify(reference);
  for (const forbidden of forbiddenValues) {
    assert(
      forbidden.length === 0 || !serialized.includes(forbidden),
      'Provider reference contains a forbidden value',
    );
  }
}

function assertLayer(layer: unknown): asserts layer is LayerDescriptor {
  assert(
    typeof layer === 'object' && layer !== null,
    'layer must be an object',
  );
  const candidate = layer as Record<PropertyKey, unknown>;
  nonEmptyString(candidate['name'], 'layer.name');
  assert(
    typeof candidate['source'] === 'object' && candidate['source'] !== null,
    'layer.source must be an object',
  );
  const source = candidate['source'] as Record<PropertyKey, unknown>;
  nonEmptyString(source['kind'], 'layer.source.kind');
  assert.equal(
    typeof source['load'],
    'function',
    'layer.source.load must be a function',
  );
}

function withObservedLoad(
  layer: LayerDescriptor,
  observe: (context: SourceContext) => void,
): LayerDescriptor {
  const original = layer.source.load;
  return Object.freeze({
    name: layer.name,
    source: Object.freeze({
      kind: layer.source.kind,
      load(context: SourceContext) {
        observe(context);
        return original(context);
      },
    }),
    ...(layer.enabled === undefined ? {} : { enabled: layer.enabled }),
    ...(layer.secret === undefined ? {} : { secret: layer.secret }),
  });
}

async function disposeSubjects(
  subjects: readonly SourceConformanceSubject[],
): Promise<void> {
  await Promise.all(subjects.map(async (subject) => subject.dispose?.()));
}

function assertControlledSourceFailure(
  error: unknown,
  forbidden: string,
): boolean {
  assert(error instanceof KasaneSourceError, 'Expected KasaneSourceError');
  assert.equal(error.code, 'KASANE_SOURCE_ERROR');
  assert(
    !JSON.stringify(error).includes(forbidden),
    'Source failure leaked data',
  );
  return true;
}

export async function runSourceConformance(
  adapter: SourceConformanceAdapter,
): Promise<ConformanceReport> {
  nonEmptyString(adapter.name, 'adapter.name');
  assert.equal(typeof adapter.create, 'function', 'adapter.create is required');
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'kasane-source-conformance-'),
  );
  const subjects: SourceConformanceSubject[] = [];
  const create = async (
    fixture: SourceConformanceCase,
  ): Promise<SourceConformanceSubject> => {
    const subject = await adapter.create(Object.freeze(fixture));
    assertLayer(subject.layer);
    if (subject.reference !== undefined) {
      assertSafeProviderReference(
        subject.reference,
        'secretCanary' in fixture ? [fixture.secretCanary] : [],
      );
    }
    subjects.push(subject);
    return subject;
  };

  try {
    const observedContexts: SourceContext[] = [];
    const normal = await create({
      mode: 'value',
      value: { nested: { provider: true }, providerOnly: 'loaded' },
    });
    const observedLayer = withObservedLoad(normal.layer, (context) => {
      observedContexts.push(context);
    });
    const normalSnapshot = await kasane({
      cwd: temporaryRoot,
      layers: [
        value('testkit-defaults', { nested: { defaults: true } }),
        observedLayer,
      ],
      provenance: 'full',
    });
    assert.deepEqual(normalSnapshot.value, {
      nested: { defaults: true, provider: true },
      providerOnly: 'loaded',
    });
    assert.equal(observedContexts.length, 1, 'Source must load exactly once');
    const context = observedContexts[0];
    assert(context !== undefined);
    assert(Object.isFrozen(context), 'SourceContext must be frozen');
    assert(Object.isFrozen(context.limits), 'SourceLimits must be frozen');
    assert.deepEqual(Reflect.ownKeys(context), ['cwd', 'limits']);
    for (const forbidden of [
      'merge',
      'previous',
      'provenance',
      'redactor',
      'snapshot',
      'value',
    ]) {
      assert(!(forbidden in context), `SourceContext exposed ${forbidden}`);
    }
    assert.equal(
      normalSnapshot.origin('providerOnly')?.layer.name,
      normal.layer.name,
      'Core must own provider provenance',
    );

    const failureCanary = 'SOURCE_TESTKIT_FAILURE_CANARY';
    const failing = await create({ failureCanary, mode: 'failure' });
    let laterLoads = 0;
    await assert.rejects(
      kasane({
        layers: [
          failing.layer,
          {
            name: 'testkit-later',
            source: {
              kind: 'testkit-later',
              load() {
                laterLoads += 1;
                return { later: true };
              },
            },
          },
        ],
      }),
      (error: unknown) => assertControlledSourceFailure(error, failureCanary),
    );
    assert.equal(laterLoads, 0, 'A failed source must stop later layers');

    const abortCanary = 'SOURCE_TESTKIT_ABORT_CANARY';
    const aborting = await create({ mode: 'abort' });
    const controller = new AbortController();
    let startedResolve: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    const abortLayer = withObservedLoad(aborting.layer, () => {
      startedResolve?.();
    });
    const aborted = kasane({
      layers: [abortLayer],
      signal: controller.signal,
    });
    await started;
    controller.abort(abortCanary);
    await assert.rejects(aborted, (error: unknown) =>
      assertControlledSourceFailure(error, abortCanary),
    );

    const secretCanary = 'SOURCE_TESTKIT_SECRET_CANARY';
    const secretSubject = await create({ mode: 'secret', secretCanary });
    assert.equal(
      secretSubject.layer.secret,
      true,
      'Provider secret fixture must annotate the complete layer',
    );
    const secretSnapshot = await kasane({
      layers: [secretSubject.layer],
      provenance: 'full',
    });
    assert.equal(secretSnapshot.require('token'), secretCanary);
    const explanation = secretSnapshot.explain('token');
    assert.equal(explanation.found, true);
    assert.equal(explanation.value, '[REDACTED]');
    assert(!JSON.stringify(explanation).includes(secretCanary));
    assert(!JSON.stringify(secretSnapshot).includes(secretCanary));

    const dangerous = await create({ mode: 'dangerous-keys' });
    await assert.rejects(
      kasane({ layers: [dangerous.layer] }),
      (error: unknown) => {
        assert(
          error instanceof KasaneSecurityError,
          'Dangerous source output must fail in core normalization',
        );
        assert.equal(error.details.kind, 'dangerous-key');
        return true;
      },
    );
    assert.equal(
      Reflect.get({}, 'sourceTestkitPolluted'),
      undefined,
      'Dangerous source output changed Object.prototype',
    );

    return Object.freeze({
      adapter: adapter.name,
      scenarios: Object.freeze([
        'plain-data-and-core-merge',
        'provider-failure',
        'abort',
        'secret-annotation',
        'dangerous-keys',
        'safe-reference',
        'no-source-owned-merge',
      ]),
    });
  } finally {
    await disposeSubjects(subjects);
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

export async function runParserConformance(
  adapter: ParserConformanceAdapter,
): Promise<ConformanceReport> {
  nonEmptyString(adapter.name, 'adapter.name');
  assert.equal(typeof adapter.parse, 'function', 'adapter.parse is required');
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'kasane-parser-conformance-'),
  );
  const writeFixture = async (
    name: string,
    source: string,
  ): Promise<string> => {
    const fixture = path.join(temporaryRoot, name);
    await writeFile(fixture, source, 'utf8');
    return fixture;
  };

  try {
    assert.deepEqual(
      await adapter.parse(adapter.validSource),
      adapter.validValue,
      'Parser direct result differs from its declared fixture',
    );
    const validPath = await writeFixture('valid.conf', adapter.validSource);
    const validSnapshot = await kasane({
      layers: [file('testkit-parser', validPath, { parse: adapter.parse })],
    });
    assert.deepEqual(validSnapshot.value, adapter.validValue);

    const invalidPath = await writeFixture(
      'invalid.conf',
      adapter.invalidSource,
    );
    await assert.rejects(
      kasane({
        layers: [
          file('testkit-invalid', invalidPath, { parse: adapter.parse }),
        ],
      }),
      (error: unknown) => {
        assert(error instanceof KasaneSourceError);
        const serialized = JSON.stringify(error);
        assert(!serialized.includes(adapter.failureCanary));
        assert(!serialized.includes(adapter.invalidSource));
        return true;
      },
    );

    const dangerousPath = await writeFixture(
      'dangerous.conf',
      adapter.dangerousSource,
    );
    await assert.rejects(
      kasane({
        layers: [
          file('testkit-dangerous', dangerousPath, { parse: adapter.parse }),
        ],
      }),
      (error: unknown) => {
        assert(error instanceof KasaneSecurityError);
        assert.equal(error.details.kind, 'dangerous-key');
        return true;
      },
    );

    const secretPath = adapter.secretPath ?? 'token';
    const secretFile = await writeFixture('secret.conf', adapter.secretSource);
    const secretSnapshot = await kasane({
      layers: [
        file('testkit-secret-parser', secretFile, {
          parse: adapter.parse,
          secret: true,
        }),
      ],
      provenance: 'full',
    });
    assert.equal(secretSnapshot.require(secretPath), adapter.secretCanary);
    assert(
      !JSON.stringify(secretSnapshot.explain(secretPath)).includes(
        adapter.secretCanary,
      ),
    );
    assert(!JSON.stringify(secretSnapshot).includes(adapter.secretCanary));

    return Object.freeze({
      adapter: adapter.name,
      scenarios: Object.freeze([
        'plain-parser-data',
        'async-parser-compatible',
        'parser-failure-sanitized',
        'dangerous-keys-normalized-by-core',
        'secret-layer-redaction',
      ]),
    });
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}
