import { describe, it } from 'vitest';
import { assert, property, string } from 'fast-check';

describe('property-test harness', () => {
  it('runs deterministic fast-check properties', () => {
    assert(
      property(string(), (value) => {
        const reversed = Array.from(value).reverse().join('');
        return Array.from(reversed).reverse().join('') === value;
      }),
      { numRuns: 100 },
    );
  });
});
