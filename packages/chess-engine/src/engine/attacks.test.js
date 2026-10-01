import { describe, it, expect } from 'vitest';
import { isSquareAttacked } from './attacks.js';

// Крок 3 (docs/move-validation.md, розділ 5): isSquareAttacked — базовий
// примітив, що перевикористовується для шаху, ходу короля й рокіровки.
describe('isSquareAttacked', () => {
  it('порожня дошка нічого не атакує', () => {
    expect(isSquareAttacked({}, 'e4', 'w')).toBe(false);
  });

  describe('пішак', () => {
    it('білий пішак атакує обидві сусідні діагоналі попереду', () => {
      const board = { e4: 'P' };
      expect(isSquareAttacked(board, 'd5', 'w')).toBe(true);
      expect(isSquareAttacked(board, 'f5', 'w')).toBe(true);
    });

    it('пішак НЕ атакує клітинку прямо перед собою (це хід, не атака)', () => {
      const board = { e4: 'P' };
      expect(isSquareAttacked(board, 'e5', 'w')).toBe(false);
    });

    it('чорний пішак атакує в протилежному напрямку', () => {
      const board = { e5: 'p' };
      expect(isSquareAttacked(board, 'd4', 'b')).toBe(true);
      expect(isSquareAttacked(board, 'e4', 'b')).toBe(false);
    });
  });

  describe('кінь', () => {
    it('атакує всі 8 клітинок незалежно від фігур навколо', () => {
      const board = { d4: 'N', c2: 'p', d5: 'P' }; // сусідні фігури не заважають
      expect(isSquareAttacked(board, 'c2', 'w')).toBe(true);
      expect(isSquareAttacked(board, 'e6', 'w')).toBe(true);
    });

    it('не атакує клітинку поза набором зміщень', () => {
      const board = { d4: 'N' };
      expect(isSquareAttacked(board, 'd5', 'w')).toBe(false);
    });
  });

  describe('король', () => {
    it('атакує 8 сусідніх клітинок', () => {
      const board = { e1: 'K' };
      expect(isSquareAttacked(board, 'e2', 'w')).toBe(true);
      expect(isSquareAttacked(board, 'd1', 'w')).toBe(true);
      expect(isSquareAttacked(board, 'e3', 'w')).toBe(false);
    });
  });

  describe('тура (ковзаюча)', () => {
    it('атакує вздовж усього вільного файлу/рангу', () => {
      const board = { a1: 'R' };
      expect(isSquareAttacked(board, 'a8', 'w')).toBe(true);
      expect(isSquareAttacked(board, 'h1', 'w')).toBe(true);
    });

    it('промінь зупиняється на першій фігурі — далі не атакує', () => {
      const board = { a1: 'R', a4: 'p' };
      expect(isSquareAttacked(board, 'a4', 'w')).toBe(true);
      expect(isSquareAttacked(board, 'a5', 'w')).toBe(false);
    });

    it('блокується навіть своєю фігурою (промінь не бачить крізь неї)', () => {
      const board = { a1: 'R', a4: 'P' };
      expect(isSquareAttacked(board, 'a4', 'w')).toBe(true);
      expect(isSquareAttacked(board, 'a5', 'w')).toBe(false);
    });
  });

  describe('слон і ферзь', () => {
    it('слон атакує по діагоналі', () => {
      const board = { c1: 'B' };
      expect(isSquareAttacked(board, 'h6', 'w')).toBe(true);
      expect(isSquareAttacked(board, 'c8', 'w')).toBe(false);
    });

    it("ферзь атакує і як тура, і як слон", () => {
      const board = { d4: 'Q' };
      expect(isSquareAttacked(board, 'd8', 'w')).toBe(true);
      expect(isSquareAttacked(board, 'a1', 'w')).toBe(true);
    });
  });

  it('колір, що не збігається з byColor, ігнорується', () => {
    const board = { a1: 'r' }; // чорна тура
    expect(isSquareAttacked(board, 'a8', 'w')).toBe(false);
    expect(isSquareAttacked(board, 'a8', 'b')).toBe(true);
  });
});
