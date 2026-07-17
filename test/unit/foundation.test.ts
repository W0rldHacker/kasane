import { describe, expect, it } from 'vitest';

import * as kasane from '../../src/index.js';

describe('public entry point', () => {
  it('exports only implemented public contracts', () => {
    expect(Object.keys(kasane).sort()).toEqual([
      'ConfigSnapshot',
      'DEFAULT_KASANE_LIMITS',
      'DEFAULT_MAX_SOURCE_BYTES',
      'KasaneError',
      'KasaneLayerError',
      'KasaneMergeError',
      'KasanePathError',
      'KasaneSecurityError',
      'KasaneSourceError',
      'KasaneValidationError',
      'env',
      'file',
      'kasane',
      'remove',
      'secret',
      'secretValue',
      'value',
    ]);
  });
});
