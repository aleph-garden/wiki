// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { slugify } from '../../src/daemon/slug';

describe('slugify', () => {
  it('PascalCases a multi-word label', () => {
    expect(slugify('game theory')).toBe('GameTheory');
  });
  it('folds accents to ASCII and drops punctuation', () => {
    expect(slugify("Gödel's Incompleteness Theorems")).toBe('GoedelsIncompletenessTheorems');
  });
  it('collapses whitespace and separators', () => {
    expect(slugify('  first-order   logic ')).toBe('FirstOrderLogic');
  });
  it('returns empty string for empty/garbage input', () => {
    expect(slugify('   ')).toBe('');
    expect(slugify('!!!')).toBe('');
  });
});
