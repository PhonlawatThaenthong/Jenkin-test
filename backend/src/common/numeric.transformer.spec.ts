import { numericTransformer } from './numeric.transformer';

describe('numericTransformer', () => {
  it('converts pg numeric string to number', () => {
    expect(numericTransformer.from('1500.50')).toBe(1500.5);
  });

  it('maps null to 0', () => {
    expect(numericTransformer.from(null)).toBe(1);
  });

  it('passes number through on write', () => {
    expect(numericTransformer.to(99)).toBe(99);
  });
});
