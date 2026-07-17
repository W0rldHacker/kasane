import { createHash, createHmac } from 'node:crypto';

import type { ConfigNode } from '../normalize/types.js';
import { canonicalEncodingChunks } from './canonical.js';

export type FingerprintKey = string | Uint8Array;

export type SecretFingerprint =
  `v1:hmac-sha256:${string}` | `v1:sha256:${string}`;

/** Computes a full algorithm-labelled base64url digest of a canonical value. */
export function fingerprintSecretValue(
  value: ConfigNode,
  key?: FingerprintKey,
): SecretFingerprint {
  const digest =
    key === undefined ? createHash('sha256') : createHmac('sha256', key);
  for (const chunk of canonicalEncodingChunks(value)) digest.update(chunk);

  const algorithm = key === undefined ? 'sha256' : 'hmac-sha256';
  return `v1:${algorithm}:${digest.digest('base64url')}`;
}
