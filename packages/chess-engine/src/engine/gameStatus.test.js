import { describe, it, expect } from 'vitest';
import { isCheck, getAllLegalMoves, isCheckmate, isStalemate } from './gameStatus.js';

const NO_CASTLING_RIGHTS = { wK: false, wQ: false, bK: false, bQ: false };

const baseGameState = (board) => ({
  board,
  enPassantTarget: null,
  castlingRights: NO_CASTLING_RIGHTS,
});

// Крок 5 (docs/move-validation.md, розділ 5): шах/мат/пат — усі три через
// getAllLegalMoves, окремого "алгоритму детекції мату" немає (розділ 3.5).
describe('isCheck', () => {
  it('немає шаху на порожній дошці (немає навіть короля)', () => {
    expect(isCheck({}, 'w')).toBe(false);
  });

  it('король під шахом ферзя по прямій', () => {
    expect(isCheck({ e1: 'K', e2: 'q' }, 'w')).toBe(true);
  });

  it('король не під шахом, якщо атакуюча фігура заблокована', () => {
    // Ферзь на e5 шахував би по e-файлу, але пішак на e3 стоїть МІЖ ним і
    // королем — промінь до e1 не доходить.
    expect(isCheck({ e1: 'K', e3: 'p', e5: 'q' }, 'w')).toBe(false);
  });
});

describe('getAllLegalMoves', () => {
  it('позиція із шахом і ЄДИНИМ рятівним ходом — узяти фігуру, що дає шах', () => {
    // Чорний ферзь на e2 шахує короля e1; жодна інша клітинка навколо
    // короля не безпечна (усі під боєм того самого ферзя), крім e2 самого —
    // ферзь нічим не захищений, тому Kxe2 рятує партію.
    const gameState = baseGameState({ e1: 'K', e2: 'q' });
    const moves = getAllLegalMoves(gameState, 'w');

    expect(moves).toEqual([{ from: 'e1', to: 'e2' }]);
  });

  it('агрегує ходи з усіх фігур одного кольору, а не лише однієї', () => {
    const gameState = baseGameState({ e1: 'K', a1: 'R' });
    const moves = getAllLegalMoves(gameState, 'w');

    const fromSquares = new Set(moves.map((move) => move.from));
    expect(fromSquares).toEqual(new Set(['e1', 'a1']));
  });

  it('включає рокіровку для короля, якщо вона легальна', () => {
    const gameState = {
      board: { e1: 'K', h1: 'R' },
      enPassantTarget: null,
      castlingRights: { wK: true, wQ: false, bK: false, bQ: false },
    };
    const moves = getAllLegalMoves(gameState, 'w');

    expect(moves).toContainEqual({ from: 'e1', to: 'g1' });
  });
});

describe('isCheckmate', () => {
  it('класичний мат на останньому ряду (back-rank mate)', () => {
    // Білий король заблокований власними пішаками f2/g2/h2, чорна тура
    // шахує по 1-му ряду — жодна клітинка (f1 чи h1) не безпечна.
    const gameState = baseGameState({
      g1: 'K',
      f2: 'P',
      g2: 'P',
      h2: 'P',
      a1: 'r',
    });

    expect(isCheckmate(gameState, 'w')).toBe(true);
  });

  it('шах є, але лишається рятівний хід — це НЕ мат', () => {
    const gameState = baseGameState({ e1: 'K', e2: 'q' });
    expect(isCheckmate(gameState, 'w')).toBe(false);
  });

  it('немає легальних ходів, але й немає шаху — це НЕ мат (це пат)', () => {
    const gameState = baseGameState({ a8: 'k', b6: 'Q', c7: 'K' });
    expect(isCheckmate(gameState, 'b')).toBe(false);
  });
});

describe('isStalemate', () => {
  it('класична позиція пату: ферзь+король проти самотнього короля в куті', () => {
    // Чорний король a8: a7 і b6 під боєм ферзя, b8 під боєм короля c7 —
    // жодного ходу, і при цьому чорний король НЕ під шахом.
    const gameState = baseGameState({ a8: 'k', b6: 'Q', c7: 'K' });

    expect(isCheck(gameState.board, 'b')).toBe(false);
    expect(isStalemate(gameState, 'b')).toBe(true);
  });

  it('мат — це НЕ пат (є шах)', () => {
    const gameState = baseGameState({
      g1: 'K',
      f2: 'P',
      g2: 'P',
      h2: 'P',
      a1: 'r',
    });
    expect(isStalemate(gameState, 'w')).toBe(false);
  });

  it('звичайна позиція з легальними ходами — ні мат, ні пат', () => {
    const gameState = baseGameState({ e1: 'K', a1: 'R', e8: 'k' });
    expect(isCheckmate(gameState, 'w')).toBe(false);
    expect(isStalemate(gameState, 'w')).toBe(false);
  });
});
