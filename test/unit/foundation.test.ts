import { describe, expect, it } from 'vitest';

import * as kasane from '../../src/index.js';

describe('public entry point', () => {
  it('is a valid empty ESM module', () => {
    expect(Object.keys(kasane)).toEqual([]);
  });
});
