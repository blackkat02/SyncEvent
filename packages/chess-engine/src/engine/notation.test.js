import { describe, it, expect } from 'vitest';
import { buildSan } from './notation.js';

const NO_CASTLING_RIGHTS = { wK: false, wQ: false, bK: false, bQ: false };

const gameStateBefore = (board) => ({
  board,
  castlingRights: NO_CASTLING_RIGHTS,
  enPassantTarget: null,
});

// Крок 7 (docs/move-validation.md, розділ 5): SAN, побудований на строгій
// легальності (getAllLegalMoves), не на "легкому" алгоритмі з
// docs/move-notation.md, розділ 6.
describe('buildSan', () => {
  it('тихий хід пішака — просто клітинка призначення', () => {
    const move = { from: 'e2', to: 'e4', piece: 'P', captured: null, castling: null, promotion: null };
    expect(buildSan(gameStateBefore({ e2: 'P' }), move)).toBe('e4');
  });

  it('взяття пішаком — файл-джерело + x + клітинка', () => {
    const move = { from: 'e4', to: 'd5', piece: 'P', captured: 'p', castling: null, promotion: null };
    expect(buildSan(gameStateBefore({ e4: 'P', d5: 'p' }), move)).toBe('exd5');
  });

  it('тихий хід фігури — без дизамбігуації, якщо вона єдина такого типу', () => {
    const move = { from: 'g1', to: 'f3', piece: 'N', captured: null, castling: null, promotion: null };
    expect(buildSan(gameStateBefore({ g1: 'N' }), move)).toBe('Nf3');
  });

  it('взяття фігурою (не пішаком)', () => {
    const move = { from: 'g1', to: 'f3', piece: 'N', captured: 'p', castling: null, promotion: null };
    expect(buildSan(gameStateBefore({ g1: 'N', f3: 'p' }), move)).toBe('Nxf3');
  });

  it('дизамбігуація по файлу: тури на однаковому ранзі', () => {
    // Обидві тури можуть піти на e1 (порожній 1-й ряд) — різні файли,
    // достатньо вказати файл джерела.
    const move = { from: 'a1', to: 'e1', piece: 'R', captured: null, castling: null, promotion: null };
    expect(buildSan(gameStateBefore({ a1: 'R', h1: 'R' }), move)).toBe('Rae1');
  });

  it('дизамбігуація по рангу: тури на одному файлі', () => {
    // Обидві тури на файлі 'a' можуть піти на a4 — файли збігаються,
    // потрібен ранг джерела.
    const move = { from: 'a1', to: 'a4', piece: 'R', captured: null, castling: null, promotion: null };
    expect(buildSan(gameStateBefore({ a1: 'R', a8: 'R' }), move)).toBe('R1a4');
  });

  it('дизамбігуація повним полем: третя фігура ділить і файл, і ранг з різними кандидатами', () => {
    // d4 (хід) ділить файл 'd' з d8, і ранг '4' з f4 — обох candidates
    // недостатньо розрізнити ні файлом, ні рангом окремо.
    const move = { from: 'd4', to: 'd6', piece: 'Q', captured: null, castling: null, promotion: null };
    const board = { d4: 'Q', d8: 'Q', f4: 'Q' };
    expect(buildSan(gameStateBefore(board), move)).toBe('Qd4d6');
  });

  it('коротка рокіровка', () => {
    const move = { from: 'e1', to: 'g1', piece: 'K', captured: null, castling: 'K', promotion: null };
    expect(buildSan(gameStateBefore({ e1: 'K', h1: 'R' }), move)).toBe('O-O');
  });

  it('довга рокіровка', () => {
    const move = { from: 'e1', to: 'c1', piece: 'K', captured: null, castling: 'Q', promotion: null };
    expect(buildSan(gameStateBefore({ e1: 'K', a1: 'R' }), move)).toBe('O-O-O');
  });

  it('промоція без взяття', () => {
    const move = { from: 'a7', to: 'a8', piece: 'P', captured: null, castling: null, promotion: 'Q' };
    expect(buildSan(gameStateBefore({ a7: 'P' }), move)).toBe('a8=Q');
  });

  it('промоція із взяттям', () => {
    const move = { from: 'b7', to: 'a8', piece: 'P', captured: 'n', castling: null, promotion: 'Q' };
    expect(buildSan(gameStateBefore({ b7: 'P', a8: 'n' }), move)).toBe('bxa8=Q');
  });

  it('суфікс шаху (+)', () => {
    const move = { from: 'e2', to: 'e4', piece: 'P', captured: null, castling: null, promotion: null };
    expect(buildSan(gameStateBefore({ e2: 'P' }), move, { isCheck: true })).toBe('e4+');
  });

  it('суфікс мату (#) переважає над простим шахом', () => {
    const move = { from: 'e2', to: 'e4', piece: 'P', captured: null, castling: null, promotion: null };
    expect(
      buildSan(gameStateBefore({ e2: 'P' }), move, { isCheck: true, isCheckmate: true })
    ).toBe('e4#');
  });

  it('без шаху й мату — без суфікса', () => {
    const move = { from: 'e2', to: 'e4', piece: 'P', captured: null, castling: null, promotion: null };
    expect(buildSan(gameStateBefore({ e2: 'P' }), move)).toBe('e4');
  });
});
