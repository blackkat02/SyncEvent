import { describe, it, expect } from 'vitest';
import {
  KNIGHT_OFFSETS,
  KING_OFFSETS,
  ROOK_DIRECTIONS,
  BISHOP_DIRECTIONS,
  QUEEN_DIRECTIONS,
} from './pieceGeometry.js';

describe('pieceGeometry', () => {
  it('кінь має 8 унікальних зміщень', () => {
    expect(KNIGHT_OFFSETS).toHaveLength(8);
    const unique = new Set(KNIGHT_OFFSETS.map(([r, c]) => `${r},${c}`));
    expect(unique.size).toBe(8);
  });

  it('зміщення коня відповідають L-подібному руху (|dRow|+|dCol| === 3, обидва ненульові)', () => {
    KNIGHT_OFFSETS.forEach(([dRow, dCol]) => {
      expect(dRow).not.toBe(0);
      expect(dCol).not.toBe(0);
      expect(Math.abs(dRow) + Math.abs(dCol)).toBe(3);
    });
  });

  it('король має 8 унікальних сусідніх зміщень, без (0,0)', () => {
    expect(KING_OFFSETS).toHaveLength(8);
    const unique = new Set(KING_OFFSETS.map(([r, c]) => `${r},${c}`));
    expect(unique.size).toBe(8);
    expect(KING_OFFSETS).not.toContainEqual([0, 0]);
    KING_OFFSETS.forEach(([dRow, dCol]) => {
      expect(Math.abs(dRow)).toBeLessThanOrEqual(1);
      expect(Math.abs(dCol)).toBeLessThanOrEqual(1);
    });
  });

  it('тура має 4 ортогональні напрямки', () => {
    expect(ROOK_DIRECTIONS).toHaveLength(4);
    ROOK_DIRECTIONS.forEach(([dRow, dCol]) => {
      expect(dRow === 0 || dCol === 0).toBe(true);
      expect(dRow === 0 && dCol === 0).toBe(false);
    });
  });

  it('слон має 4 діагональні напрямки', () => {
    expect(BISHOP_DIRECTIONS).toHaveLength(4);
    BISHOP_DIRECTIONS.forEach(([dRow, dCol]) => {
      expect(Math.abs(dRow)).toBe(1);
      expect(Math.abs(dCol)).toBe(1);
    });
  });

  it('ферзь об\'єднує напрямки тури й слона (8 напрямків)', () => {
    expect(QUEEN_DIRECTIONS).toHaveLength(8);
    ROOK_DIRECTIONS.forEach((dir) => expect(QUEEN_DIRECTIONS).toContainEqual(dir));
    BISHOP_DIRECTIONS.forEach((dir) => expect(QUEEN_DIRECTIONS).toContainEqual(dir));
  });
});
