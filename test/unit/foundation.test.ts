import { describe, expect, it } from 'vitest';

import * as kasane from '../../src/index.js';

describe('public entry point', () => {
  it('exports only implemented public contracts', () => {
    expect(Object.keys(kasane).sort()).toEqual([
      'KasaneError',
      'KasaneLayerError',
      'KasaneMergeError',
      'KasanePathError',
      'KasaneSecurityError',
      'KasaneSourceError',
      'KasaneValidationError',
      'remove',
    ]);
  });
});
