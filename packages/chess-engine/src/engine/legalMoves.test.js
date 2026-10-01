import { describe, it, expect } from 'vitest';
import { getPseudoLegalMoves } from './pseudoMoves.js';
import { filterByKingSafety, getCastlingMoves } from './legalMoves.js';

const FULL_CASTLING_RIGHTS = { wK: true, wQ: true, bK: true, bQ: true };
const NO_CASTLING_RIGHTS = { wK: false, wQ: false, bK: false, bQ: false };

// Крок 3 (docs/move-validation.md, розділ 5): фільтр по безпеці короля.
describe('filterByKingSafety', () => {
  it('не змінює список ходів, якщо король не в небезпеці', () => {
    const board = { d4: 'N', e1: 'K' };
    const pseudoMoves = getPseudoLegalMoves(board, 'd4');
    expect(filterByKingSafety(board, 'd4', pseudoMoves, 'w')).toEqual(pseudoMoves);
  });

  it('зв\'язана тура: хід уздовж лінії зв\'язки (файл) залишається легальним', () => {
    // Білий король e1, білa тура e2, чорна тура e8 — тура зв'язана по e-файлу.
    const board = { e1: 'K', e2: 'R', e8: 'r' };
    const pseudoMoves = getPseudoLegalMoves(board, 'e2');
    const legalMoves = filterByKingSafety(board, 'e2', pseudoMoves, 'w');

    expect(legalMoves).toEqual(
      expect.arrayContaining(['e3', 'e4', 'e5', 'e6', 'e7', 'e8'])
    );
  });

  it("зв'язана тура: хід ЗІ своєї лінії (у бік від файлу) нелегальний — розкриває шах", () => {
    const board = { e1: 'K', e2: 'R', e8: 'r' };
    const pseudoMoves = getPseudoLegalMoves(board, 'e2');
    const legalMoves = filterByKingSafety(board, 'e2', pseudoMoves, 'w');

    expect(legalMoves).not.toContain('d2');
    expect(legalMoves).not.toContain('a2');
  });

  it('взяття фігури, що дає шах, — легальне', () => {
    // Чорний ферзь на e2 дає шах білому королю на e1; білий ферзь на e5
    // може його взяти вздовж e-файлу.
    const board = { e1: 'K', e5: 'Q', e2: 'q' };
    const pseudoMoves = getPseudoLegalMoves(board, 'e5');
    const legalMoves = filterByKingSafety(board, 'e5', pseudoMoves, 'w');

    expect(legalMoves).toContain('e2');
  });

  it('хід, що не закриває наявний шах, нелегальний', () => {
    // Той самий шах по e-файлу, але кінь стоїть НЕ на цій лінії й не може
    // ані взяти ферзя, ані закрити шах — жоден його хід не рятує короля.
    const board = { e1: 'K', a4: 'N', e2: 'q' };
    const pseudoMoves = getPseudoLegalMoves(board, 'a4');
    const legalMoves = filterByKingSafety(board, 'a4', pseudoMoves, 'w');

    expect(legalMoves).toEqual([]);
  });

  it('без короля на дошці (фікстури кроку 1) нічого не фільтрує', () => {
    const board = { d4: 'N' };
    const pseudoMoves = getPseudoLegalMoves(board, 'd4');
    expect(filterByKingSafety(board, 'd4', pseudoMoves, 'w')).toEqual(pseudoMoves);
  });
});

// Крок 4 (docs/move-validation.md, розділ 5): рокіровка.
describe('getCastlingMoves', () => {
  it('обидві рокіровки легальні на чистій дошці з повними правами', () => {
    const board = { e1: 'K', a1: 'R', h1: 'R' };
    expect(getCastlingMoves(board, 'w', FULL_CASTLING_RIGHTS)).toEqual(
      expect.arrayContaining(['g1', 'c1'])
    );
  });

  it('те саме для чорних (8-й ряд)', () => {
    const board = { e8: 'k', a8: 'r', h8: 'r' };
    expect(getCastlingMoves(board, 'b', FULL_CASTLING_RIGHTS)).toEqual(
      expect.arrayContaining(['g8', 'c8'])
    );
  });

  it('немає прав — немає рокіровки, навіть якщо дошка дозволяє', () => {
    const board = { e1: 'K', a1: 'R', h1: 'R' };
    expect(getCastlingMoves(board, 'w', NO_CASTLING_RIGHTS)).toEqual([]);
  });

  it('заблокована фігурою між королем і турою (коротка)', () => {
    const board = { e1: 'K', h1: 'R', f1: 'B' };
    expect(getCastlingMoves(board, 'w', FULL_CASTLING_RIGHTS)).not.toContain('g1');
  });

  it('заблокована фігурою між королем і турою (довга, включно з b-клітинкою)', () => {
    const board = { e1: 'K', a1: 'R', b1: 'N' };
    expect(getCastlingMoves(board, 'w', FULL_CASTLING_RIGHTS)).not.toContain('c1');
  });

  it('неможлива, коли король стоїть під шахом', () => {
    const board = { e1: 'K', h1: 'R', e8: 'r' }; // чорна тура шахує по e-файлу
    expect(getCastlingMoves(board, 'w', FULL_CASTLING_RIGHTS)).toEqual([]);
  });

  it('неможлива, коли король ПЕРЕТИНАЄ атаковану клітинку (навіть якщо не приземляється на неї під шахом)', () => {
    const board = { e1: 'K', h1: 'R', f8: 'r' }; // чорна тура атакує f1 по f-файлу
    expect(getCastlingMoves(board, 'w', FULL_CASTLING_RIGHTS)).not.toContain('g1');
  });

  it('неможлива, коли клітинка приземлення атакована', () => {
    const board = { e1: 'K', h1: 'R', g8: 'r' }; // чорна тура атакує g1
    expect(getCastlingMoves(board, 'w', FULL_CASTLING_RIGHTS)).not.toContain('g1');
  });

  it('неможлива без тури на стартовій клітинці, навіть якщо право ще не відкликане', () => {
    const board = { e1: 'K' }; // тури взагалі немає
    expect(getCastlingMoves(board, 'w', FULL_CASTLING_RIGHTS)).toEqual([]);
  });
});
