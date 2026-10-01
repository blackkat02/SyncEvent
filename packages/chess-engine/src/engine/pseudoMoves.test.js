import { describe, it, expect } from 'vitest';
import { getPseudoLegalMoves } from './pseudoMoves.js';

// Крок 1 (docs/move-validation.md, розділ 5): геометрія фігур,
// без урахування шаху власному королю (це крок 3).
describe('pseudoMoves', () => {
  it('порожня клітинка не має ходів', () => {
    expect(getPseudoLegalMoves({}, 'e4')).toEqual([]);
  });

  describe('пішак', () => {
    it('хід на 1 клітинку вперед на порожню клітинку (білі)', () => {
      const board = { e4: 'P' };
      expect(getPseudoLegalMoves(board, 'e4')).toEqual(['e5']);
    });

    it('хід на 2 клітинки з початкового ряду, якщо обидві клітинки порожні', () => {
      const board = { e2: 'P' };
      expect(getPseudoLegalMoves(board, 'e2')).toEqual(
        expect.arrayContaining(['e3', 'e4'])
      );
    });

    it('хід на 2 клітинки заблоковано, якщо клітинка перед пішаком за 2 хід зайнята', () => {
      const board = { e2: 'P', e4: 'n' };
      const moves = getPseudoLegalMoves(board, 'e2');
      expect(moves).toContain('e3');
      expect(moves).not.toContain('e4');
    });

    it('хід вперед повністю заблоковано, якщо клітинка одразу попереду зайнята', () => {
      const board = { e2: 'P', e3: 'n' };
      expect(getPseudoLegalMoves(board, 'e2')).toEqual([]);
    });

    it('взяття по діагоналі лише якщо там ворожа фігура', () => {
      const board = { e4: 'P', d5: 'p', f5: 'n' };
      expect(getPseudoLegalMoves(board, 'e4')).toEqual(
        expect.arrayContaining(['e5', 'd5', 'f5'])
      );
    });

    it('не бере по діагоналі свою фігуру', () => {
      const board = { e4: 'P', d5: 'N' };
      expect(getPseudoLegalMoves(board, 'e4')).not.toContain('d5');
    });

    it('чорний пішак рухається у протилежному напрямку', () => {
      const board = { e7: 'p' };
      expect(getPseudoLegalMoves(board, 'e7')).toEqual(
        expect.arrayContaining(['e6', 'e5'])
      );
    });

    // Крок 4 (docs/move-validation.md, розділ 5): взяття на проході.
    it('бере на проході, якщо цільова клітинка — enPassantTarget', () => {
      // Чорний щойно пішов d7-d5, тому enPassantTarget === 'd6'.
      const board = { e5: 'P', d5: 'p' };
      expect(getPseudoLegalMoves(board, 'e5', 'd6')).toContain('d6');
    });

    it('без enPassantTarget такий хід недоступний', () => {
      const board = { e5: 'P', d5: 'p' };
      expect(getPseudoLegalMoves(board, 'e5')).not.toContain('d6');
    });

    it('не бере на проході на клітинку, де насправді стоїть фігура (це вже звичайне взяття, не en passant)', () => {
      const board = { e5: 'P', d6: 'p' };
      // d6 зайнята — це звичайне діагональне взяття, en passant тут ні до чого.
      expect(getPseudoLegalMoves(board, 'e5', 'd6')).toContain('d6');
    });
  });

  describe('кінь', () => {
    it('усі 8 напрямків з центру дошки', () => {
      const board = { d4: 'N' };
      const moves = getPseudoLegalMoves(board, 'd4');
      expect(moves).toHaveLength(8);
      expect(moves).toEqual(
        expect.arrayContaining(['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'])
      );
    });

    it('обмежена кількість ходів з кута дошки', () => {
      const board = { a1: 'N' };
      expect(getPseudoLegalMoves(board, 'a1')).toEqual(
        expect.arrayContaining(['b3', 'c2'])
      );
      expect(getPseudoLegalMoves(board, 'a1')).toHaveLength(2);
    });

    it('стрибає через фігури (не блокується ними)', () => {
      const board = { d4: 'N', d5: 'P', d6: 'p', c4: 'p' };
      expect(getPseudoLegalMoves(board, 'd4')).toContain('c6');
    });

    it('не може стрибнути на клітинку своєї фігури', () => {
      const board = { d4: 'N', c6: 'P' };
      expect(getPseudoLegalMoves(board, 'd4')).not.toContain('c6');
    });
  });

  describe('тура', () => {
    it('ковзає в 4 напрямках по порожній дошці', () => {
      const board = { d4: 'R' };
      const moves = getPseudoLegalMoves(board, 'd4');
      expect(moves).toEqual(
        expect.arrayContaining(['d1', 'd8', 'a4', 'h4'])
      );
    });

    it('зупиняється перед своєю фігурою (не включаючи її)', () => {
      const board = { d4: 'R', d6: 'P' };
      const moves = getPseudoLegalMoves(board, 'd4');
      expect(moves).toContain('d5');
      expect(moves).not.toContain('d6');
      expect(moves).not.toContain('d7');
    });

    it('зупиняється на ворожій фігурі, включаючи її (взяття)', () => {
      const board = { d4: 'R', d6: 'p' };
      const moves = getPseudoLegalMoves(board, 'd4');
      expect(moves).toContain('d5');
      expect(moves).toContain('d6');
      expect(moves).not.toContain('d7');
    });
  });

  describe('слон', () => {
    it('рухається лише по діагоналях', () => {
      const board = { d4: 'B' };
      const moves = getPseudoLegalMoves(board, 'd4');
      expect(moves).toEqual(expect.arrayContaining(['a1', 'g7', 'a7', 'g1']));
      expect(moves).not.toContain('d5');
      expect(moves).not.toContain('a4');
    });

    it('блокування аналогічне турі (своя зупиняє, чужа бере й зупиняє)', () => {
      const board = { d4: 'B', f6: 'p' };
      const moves = getPseudoLegalMoves(board, 'd4');
      expect(moves).toContain('f6');
      expect(moves).not.toContain('g7');
    });
  });

  describe('ферзь', () => {
    it("об'єднує ходи тури й слона", () => {
      const board = { d4: 'Q' };
      const moves = getPseudoLegalMoves(board, 'd4');
      expect(moves).toEqual(
        expect.arrayContaining(['d1', 'a4', 'a1', 'g7'])
      );
    });
  });

  describe('король', () => {
    it('усі 8 сусідніх клітинок з центру дошки', () => {
      const board = { d4: 'K' };
      expect(getPseudoLegalMoves(board, 'd4')).toHaveLength(8);
    });

    it('не може піти на клітинку своєї фігури', () => {
      const board = { d4: 'K', d5: 'P' };
      expect(getPseudoLegalMoves(board, 'd4')).not.toContain('d5');
      expect(getPseudoLegalMoves(board, 'd4')).toHaveLength(7);
    });

    it('обмежена кількість ходів з кута дошки', () => {
      const board = { a1: 'K' };
      expect(getPseudoLegalMoves(board, 'a1')).toEqual(
        expect.arrayContaining(['a2', 'b1', 'b2'])
      );
      expect(getPseudoLegalMoves(board, 'a1')).toHaveLength(3);
    });
  });
});
