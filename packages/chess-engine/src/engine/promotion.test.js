import { describe, it, expect } from 'vitest';
import {
  requiresPromotion,
  isValidPromotionPiece,
  resolvePromotionPiece,
  DEFAULT_PROMOTION_PIECE,
} from './promotion.js';

// Крок 6 (docs/move-validation.md, розділ 5): промоція пішака.
describe('requiresPromotion', () => {
  it('білий пішак на 8-му ряді вимагає промоції', () => {
    expect(requiresPromotion('P', 'e8')).toBe(true);
  });

  it('чорний пішак на 1-му ряді вимагає промоції', () => {
    expect(requiresPromotion('p', 'e1')).toBe(true);
  });

  it('пішак не на останньому ряді — не вимагає', () => {
    expect(requiresPromotion('P', 'e7')).toBe(false);
  });

  it('не пішак — ніколи не вимагає промоції, навіть на останньому ряді', () => {
    expect(requiresPromotion('Q', 'e8')).toBe(false);
  });

  it('білий пішак на 1-му ряді ("чужий" останній ряд) — не вимагає', () => {
    expect(requiresPromotion('P', 'e1')).toBe(false);
  });

  it('чорний пішак на 8-му ряді ("чужий" останній ряд) — не вимагає', () => {
    expect(requiresPromotion('p', 'e8')).toBe(false);
  });
});

describe('isValidPromotionPiece', () => {
  it('Q/R/B/N у будь-якому регістрі — дійсні', () => {
    expect(isValidPromotionPiece('Q')).toBe(true);
    expect(isValidPromotionPiece('r')).toBe(true);
    expect(isValidPromotionPiece('B')).toBe(true);
    expect(isValidPromotionPiece('n')).toBe(true);
  });

  it('король, пішак, порожнє чи відсутнє значення — недійсні', () => {
    expect(isValidPromotionPiece('K')).toBe(false);
    expect(isValidPromotionPiece('P')).toBe(false);
    expect(isValidPromotionPiece('')).toBe(false);
    expect(isValidPromotionPiece(undefined)).toBe(false);
  });
});

describe('resolvePromotionPiece', () => {
  it('використовує дефолт (ферзь), якщо promotion не вказано', () => {
    expect(resolvePromotionPiece('P', undefined)).toBe(DEFAULT_PROMOTION_PIECE);
  });

  it('повертає символ у ВЕРХНЬОМУ регістрі для білого пішака', () => {
    expect(resolvePromotionPiece('P', 'n')).toBe('N');
  });

  it('повертає символ у нижньому регістрі для чорного пішака', () => {
    expect(resolvePromotionPiece('p', 'Q')).toBe('q');
  });
});
