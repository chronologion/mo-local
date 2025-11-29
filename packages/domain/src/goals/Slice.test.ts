import { describe, it, expect } from 'vitest';
import { Slice, ALL_SLICES } from './Slice';

describe('Slice', () => {
  describe('static constants', () => {
    it('should provide type-safe static instances', () => {
      expect(Slice.Health).toBeInstanceOf(Slice);
      expect(Slice.Family).toBeInstanceOf(Slice);
      expect(Slice.Work).toBeInstanceOf(Slice);
    });

    it('should have correct values', () => {
      expect(Slice.Health.value).toBe('Health');
      expect(Slice.Family.value).toBe('Family');
      expect(Slice.Relationships.value).toBe('Relationships');
      expect(Slice.Work.value).toBe('Work');
      expect(Slice.Money.value).toBe('Money');
      expect(Slice.Learning.value).toBe('Learning');
      expect(Slice.Mindfulness.value).toBe('Mindfulness');
      expect(Slice.Leisure.value).toBe('Leisure');
    });
  });

  describe('Slice.of()', () => {
    it('should create slice from valid string', () => {
      const slice = Slice.of('Health');
      expect(slice).toBeInstanceOf(Slice);
      expect(slice.value).toBe('Health');
    });

    it('should throw on invalid slice value', () => {
      expect(() => Slice.of('Invalid')).toThrow();
      expect(() => Slice.of('health')).toThrow(); // Case sensitive
    });

    it('should work with all valid slices', () => {
      ALL_SLICES.forEach((sliceValue) => {
        const slice = Slice.of(sliceValue);
        expect(slice.value).toBe(sliceValue);
      });
    });
  });

  describe('equals()', () => {
    it('should return true for same slice', () => {
      const slice1 = Slice.Health;
      const slice2 = Slice.Health;
      expect(slice1.equals(slice2)).toBe(true);
    });

    it('should return true for equivalent slices', () => {
      const slice1 = Slice.of('Work');
      const slice2 = Slice.of('Work');
      expect(slice1.equals(slice2)).toBe(true);
    });

    it('should return false for different slices', () => {
      const slice1 = Slice.Health;
      const slice2 = Slice.Work;
      expect(slice1.equals(slice2)).toBe(false);
    });
  });

  describe('toString()', () => {
    it('should return the slice value', () => {
      expect(Slice.Health.toString()).toBe('Health');
      expect(Slice.Work.toString()).toBe('Work');
    });
  });
});
