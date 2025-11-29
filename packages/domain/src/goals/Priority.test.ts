import { describe, it, expect } from 'vitest';
import { Priority } from './Priority';

describe('Priority', () => {
  describe('static constants', () => {
    it('should provide type-safe static instances', () => {
      expect(Priority.Must).toBeInstanceOf(Priority);
      expect(Priority.Should).toBeInstanceOf(Priority);
      expect(Priority.Maybe).toBeInstanceOf(Priority);
    });

    it('should have correct values', () => {
      expect(Priority.Must.level).toBe('must');
      expect(Priority.Should.level).toBe('should');
      expect(Priority.Maybe.level).toBe('maybe');
    });
  });

  describe('Priority.of()', () => {
    it('should create priority from valid string', () => {
      const priority = Priority.of('must');
      expect(priority).toBeInstanceOf(Priority);
      expect(priority.level).toBe('must');
    });

    it('should throw on invalid priority level', () => {
      expect(() => Priority.of('high')).toThrow();
      expect(() => Priority.of('Must')).toThrow(); // Case sensitive
    });
  });

  describe('isMust() / isShould() / isMaybe()', () => {
    it('should correctly identify priority levels', () => {
      expect(Priority.Must.isMust()).toBe(true);
      expect(Priority.Must.isShould()).toBe(false);
      expect(Priority.Must.isMaybe()).toBe(false);

      expect(Priority.Should.isMust()).toBe(false);
      expect(Priority.Should.isShould()).toBe(true);
      expect(Priority.Should.isMaybe()).toBe(false);

      expect(Priority.Maybe.isMust()).toBe(false);
      expect(Priority.Maybe.isShould()).toBe(false);
      expect(Priority.Maybe.isMaybe()).toBe(true);
    });
  });

  describe('isHigherThan()', () => {
    it('should correctly compare priorities', () => {
      expect(Priority.Must.isHigherThan(Priority.Should)).toBe(true);
      expect(Priority.Must.isHigherThan(Priority.Maybe)).toBe(true);
      expect(Priority.Should.isHigherThan(Priority.Maybe)).toBe(true);

      expect(Priority.Maybe.isHigherThan(Priority.Should)).toBe(false);
      expect(Priority.Maybe.isHigherThan(Priority.Must)).toBe(false);
      expect(Priority.Should.isHigherThan(Priority.Must)).toBe(false);
    });

    it('should return false for same priority', () => {
      expect(Priority.Must.isHigherThan(Priority.Must)).toBe(false);
      expect(Priority.Should.isHigherThan(Priority.Should)).toBe(false);
      expect(Priority.Maybe.isHigherThan(Priority.Maybe)).toBe(false);
    });
  });

  describe('equals()', () => {
    it('should return true for same priority', () => {
      expect(Priority.Must.equals(Priority.Must)).toBe(true);
      expect(Priority.Should.equals(Priority.Should)).toBe(true);
    });

    it('should return false for different priorities', () => {
      expect(Priority.Must.equals(Priority.Should)).toBe(false);
      expect(Priority.Should.equals(Priority.Maybe)).toBe(false);
    });
  });
});
