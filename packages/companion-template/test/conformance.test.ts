import { describe, expect, it } from 'vitest';

import { runSourceConformance } from '@worldhacker/kasane-source-testkit';
import type {
  SourceConformanceAdapter,
  SourceConformanceCase,
} from '@worldhacker/kasane-source-testkit';

import { companionProvider } from '../src/index.js';
import type { ProviderClient } from '../src/index.js';

function dangerousPayload(): Record<string, unknown> {
  const nested: Record<string, unknown> = {};
  Object.defineProperty(nested, '__proto__', {
    enumerable: true,
    value: { sourceTestkitPolluted: true },
  });
  return { nested };
}

function clientFor(fixture: SourceConformanceCase): ProviderClient {
  return {
    load(_resource, options) {
      switch (fixture.mode) {
        case 'value':
          return fixture.value;
        case 'failure':
          throw new Error(fixture.failureCanary);
        case 'abort':
          return new Promise<never>((_resolve, reject) => {
            const fail = () => {
              reject(new Error(String(options.signal?.reason)));
            };
            if (options.signal?.aborted === true) fail();
            else
              options.signal?.addEventListener('abort', fail, { once: true });
          });
        case 'secret':
          return { token: fixture.secretCanary };
        case 'dangerous-keys':
          return dangerousPayload();
      }
    },
  };
}

const adapter: SourceConformanceAdapter = {
  name: 'companion-template',
  create(fixture) {
    return companionProvider(`template-${fixture.mode}`, {
      client: clientFor(fixture),
      resource: `fixture/${fixture.mode}`,
      ...(fixture.mode === 'secret' || fixture.mode === 'failure'
        ? { secret: true }
        : {}),
    });
  },
};

describe('companion package template', () => {
  it('passes the reusable public source contract', async () => {
    const report = await runSourceConformance(adapter);
    expect(report.adapter).toBe('companion-template');
    expect(report.scenarios).toContain('no-source-owned-merge');
    expect(report.scenarios).toContain('secret-annotation');
  });
});
