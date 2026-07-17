import { describe, expect, it } from 'vitest';

import { encodeCanonicalConfigNode } from '../../src/secrets/canonical.js';
import { fingerprintSecretValue } from '../../src/secrets/fingerprint.js';

describe('secret fingerprint canonical encoding', () => {
  it('sorts object keys recursively while preserving array order', () => {
    const left = {
      nested: { z: true, a: null },
      values: [1, 'two', false],
    };
    const right = {
      values: [1, 'two', false],
      nested: { a: null, z: true },
    };

    expect(encodeCanonicalConfigNode(left)).toBe(
      encodeCanonicalConfigNode(right),
    );
    expect(fingerprintSecretValue(left)).toBe(fingerprintSecretValue(right));
    expect(fingerprintSecretValue([1, 'two', false])).not.toBe(
      fingerprintSecretValue([false, 'two', 1]),
    );
  });

  it('frames primitive types and values distinctly', () => {
    const fixtures = [null, false, true, 0, 1, '0', '1'] as const;
    const fingerprints = fixtures.map((value) => fingerprintSecretValue(value));

    expect(new Set(fingerprints)).toHaveLength(fixtures.length);
    expect(fingerprintSecretValue('1')).not.toBe(fingerprintSecretValue(1));
  });

  it('uses stable full base64url SHA-256 and HMAC-SHA-256 vectors', () => {
    expect(fingerprintSecretValue('1')).toBe(
      'v1:sha256:kDgVX2bdI9cWgEUxEfGSo0d3fz3E89kBDGu1BCsy-H4',
    );
    expect(fingerprintSecretValue('1', 'fixture-key')).toBe(
      'v1:hmac-sha256:15qTbqROs4dKVfsNNsp1tx33vu1S27DynIuKqrIHe_U',
    );
  });

  it('distinguishes keyed, unkeyed, same, and different values', () => {
    const value = { credentials: ['same', 1] };
    const unkeyed = fingerprintSecretValue(value);
    const first = fingerprintSecretValue(value, 'first-key');

    expect(fingerprintSecretValue(value)).toBe(unkeyed);
    expect(first).toBe(fingerprintSecretValue(value, 'first-key'));
    expect(first).not.toBe(unkeyed);
    expect(first).not.toBe(fingerprintSecretValue(value, 'second-key'));
    expect(first).not.toBe(
      fingerprintSecretValue({ credentials: ['different', 1] }, 'first-key'),
    );
  });
});
