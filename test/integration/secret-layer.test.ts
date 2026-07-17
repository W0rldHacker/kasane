import { describe, expect, it } from 'vitest';

import { REDACTED_VALUE } from '../../src/secrets/redact.js';
import { kasane, secret, secretValue, value } from '../../src/index.js';

describe('secret layer', () => {
  it('marks scalar, object, and array descendants while preserving raw access', async () => {
    const scalar = await kasane({
      layers: [secret('scalar', 'SCALAR_CANARY')],
    });
    expect(scalar.value).toBe('SCALAR_CANARY');
    expect(scalar.toJSON()).toBe(REDACTED_VALUE);

    const tree = await kasane({
      layers: [
        secret('tree', async () => {
          await Promise.resolve();
          return {
            array: ['ARRAY_CANARY', { nested: 'NESTED_CANARY' }],
            token: 'TOKEN_CANARY',
          };
        }),
      ],
    });
    expect(tree.value).toEqual({
      array: ['ARRAY_CANARY', { nested: 'NESTED_CANARY' }],
      token: 'TOKEN_CANARY',
    });
    expect(tree.toJSON()).toEqual({
      array: [REDACTED_VALUE, { nested: REDACTED_VALUE }],
      token: REDACTED_VALUE,
    });
  });

  it('supports descriptor secret and partial public override semantics', async () => {
    const snapshot = await kasane({
      layers: [
        value(
          'descriptor-secret',
          { auth: { label: 'HIDDEN_LABEL', token: 'TOKEN_CANARY' } },
          { secret: true },
        ),
        value('public-override', { auth: { label: 'visible' } }),
      ],
      provenance: 'full',
    });

    expect(snapshot.value).toEqual({
      auth: { label: 'visible', token: 'TOKEN_CANARY' },
    });
    expect(snapshot.toJSON()).toEqual({
      auth: { label: 'visible', token: REDACTED_VALUE },
    });
  });

  it('marks only nested secretValue subtrees in a public layer', async () => {
    const snapshot = await kasane({
      layers: [
        value('application', {
          credentials: secretValue({
            password: 'PASSWORD_CANARY',
            recovery: ['RECOVERY_CANARY'],
          }),
          public: 'visible',
        }),
      ],
    });

    expect(snapshot.value).toEqual({
      credentials: {
        password: 'PASSWORD_CANARY',
        recovery: ['RECOVERY_CANARY'],
      },
      public: 'visible',
    });
    expect(snapshot.toJSON()).toEqual({
      credentials: {
        password: REDACTED_VALUE,
        recovery: [REDACTED_VALUE],
      },
      public: 'visible',
    });
  });

  it('applies wildcard and escaped path policies to public layers', async () => {
    const snapshot = await kasane({
      layers: [
        value('application', {
          integrations: {
            github: { name: 'public', token: 'GITHUB_CANARY' },
            slack: { token: 'SLACK_CANARY' },
          },
          'service.internal': {
            password: 'PASSWORD_CANARY',
            public: 'visible',
          },
        }),
      ],
      secrets: ['integrations.*.token', 'service\\.internal.password'],
    });

    expect(snapshot.toJSON()).toEqual({
      integrations: {
        github: { name: 'public', token: REDACTED_VALUE },
        slack: { token: REDACTED_VALUE },
      },
      'service.internal': {
        password: REDACTED_VALUE,
        public: 'visible',
      },
    });
  });

  it('does not let a public override clear an applicable path policy', async () => {
    const snapshot = await kasane({
      layers: [
        secret('secret', { auth: { token: 'OLD_SECRET_CANARY' } }),
        value('public', { auth: { token: 'NEW_PUBLIC_CANARY' } }),
      ],
      provenance: 'full',
      secrets: ['auth.token'],
    });

    expect(snapshot.value).toEqual({ auth: { token: 'NEW_PUBLIC_CANARY' } });
    expect(snapshot.toJSON()).toEqual({
      auth: { token: REDACTED_VALUE },
    });
    expect(JSON.stringify(snapshot)).not.toContain('OLD_SECRET_CANARY');
    expect(JSON.stringify(snapshot)).not.toContain('NEW_PUBLIC_CANARY');
  });
});
