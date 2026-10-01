import { describe, it, expect } from 'vitest';
import { algebraicToCoords, coordsToAlgebraic } from './boardUtils.js';

describe('boardUtils', () => {
  describe('algebraicToCoords', () => {
    it('конвертує кути дошки', () => {
      expect(algebraicToCoords('a1')).toEqual({ row: 7, col: 0 });
      expect(algebraicToCoords('h1')).toEqual({ row: 7, col: 7 });
      expect(algebraicToCoords('a8')).toEqual({ row: 0, col: 0 });
      expect(algebraicToCoords('h8')).toEqual({ row: 0, col: 7 });
    });

    it('конвертує клітинки в центрі дошки', () => {
      expect(algebraicToCoords('e2')).toEqual({ row: 6, col: 4 });
      expect(algebraicToCoords('d4')).toEqual({ row: 4, col: 3 });
    });

    it('не залежить від регістру літери файлу', () => {
      expect(algebraicToCoords('E2')).toEqual(algebraicToCoords('e2'));
    });

    it('кидає помилку для нерядкового аргументу', () => {
      expect(() => algebraicToCoords(11)).toThrow(/формат/);
      expect(() => algebraicToCoords(null)).toThrow(/формат/);
      expect(() => algebraicToCoords(undefined)).toThrow(/формат/);
    });

    it('кидає помилку, якщо довжина рядка не дорівнює 2', () => {
      expect(() => algebraicToCoords('')).toThrow(/формат/);
      expect(() => algebraicToCoords('a')).toThrow(/формат/);
      expect(() => algebraicToCoords('a10')).toThrow(/формат/);
    });

    it('кидає помилку для файлу поза межами a-h', () => {
      expect(() => algebraicToCoords('i1')).toThrow(/Недійсні координати/);
      expect(() => algebraicToCoords('z1')).toThrow(/Недійсні координати/);
    });

    it('кидає помилку для рангу поза межами 1-8', () => {
      expect(() => algebraicToCoords('a9')).toThrow(/Недійсні координати/);
      expect(() => algebraicToCoords('a0')).toThrow(/Недійсні координати/);
    });

    it('кидає помилку для нечислового рангу', () => {
      expect(() => algebraicToCoords('aa')).toThrow(/Недійсні координати/);
    });
  });

  describe('coordsToAlgebraic', () => {
    it('конвертує кути дошки', () => {
      expect(coordsToAlgebraic(7, 0)).toBe('a1');
      expect(coordsToAlgebraic(7, 7)).toBe('h1');
      expect(coordsToAlgebraic(0, 0)).toBe('a8');
      expect(coordsToAlgebraic(0, 7)).toBe('h8');
    });

    it('конвертує клітинки в центрі дошки', () => {
      expect(coordsToAlgebraic(6, 4)).toBe('e2');
      expect(coordsToAlgebraic(4, 3)).toBe('d4');
    });

    it('кидає помилку для координат поза межами 0-7', () => {
      expect(() => coordsToAlgebraic(-1, 0)).toThrow(/Недійсні координати масиву/);
      expect(() => coordsToAlgebraic(8, 0)).toThrow(/Недійсні координати масиву/);
      expect(() => coordsToAlgebraic(0, -1)).toThrow(/Недійсні координати масиву/);
      expect(() => coordsToAlgebraic(0, 8)).toThrow(/Недійсні координати масиву/);
    });
  });

  describe('round-trip', () => {
    it('algebraicToCoords → coordsToAlgebraic повертає вихідну нотацію', () => {
      const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      for (const file of files) {
        for (let rank = 1; rank <= 8; rank += 1) {
          const square = `${file}${rank}`;
          const { row, col } = algebraicToCoords(square);
          expect(coordsToAlgebraic(row, col)).toBe(square);
        }
      }
    });
  });
});
