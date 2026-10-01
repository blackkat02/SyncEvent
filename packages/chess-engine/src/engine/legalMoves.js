// src/engine/legalMoves.js
// Фільтр псевдолегальних ходів у легальні (безпека власного короля) +
// рокіровка та взяття на проході. Див. docs/move-validation.md,
// розділ 5 (кроки 3-4).

import { algebraicToCoords, coordsToAlgebraic } from '../utils/boardUtils.js';
import { getOpponentColor } from '../utils/chessHelpers.js';
import { COLORS } from '../constants.js';
import { isSquareAttacked } from './attacks.js';

const KING_SYMBOLS = { w: 'K', b: 'k' };
const ROOK_SYMBOLS = { w: 'R', b: 'r' };

// Публічна — потрібна й gameStatus.js (крок 5) для isCheck. Немає сенсу
// тримати позицію короля в Redux-стані (`kingPositions`, розділ 4.1
// документа) як окреме поле, поки достатньо швидкого сканування дошки.
export function findKingSquare(board, color) {
  const kingSymbol = KING_SYMBOLS[color];
  return Object.keys(board).find((square) => board[square] === kingSymbol) ?? null;
}

// Хід на КОПІЇ дошки — щоб перевірити безпеку короля, не мутуючи справжній
// state.board (docs/move-validation.md, розділ 3.3). Взяття на проході знімає
// фігуру НЕ на клітинці `to`, тому копію потрібно "довручну" підчистити і там
// — інакше рідкісний, але реальний edge case ("відкритий шах через en
// passant": обидва пішаки одночасно зникають з рядка й оголюють лінію для
// тури/ферзя) буде порахований неправильно.
function simulateMove(board, from, to, enPassantTarget) {
  const piece = board[from];
  const boardAfterMove = { ...board, [to]: piece };
  delete boardAfterMove[from];

  const isEnPassantCapture =
    piece?.toUpperCase() === 'P' && to === enPassantTarget && !board[to];

  if (isEnPassantCapture) {
    const { row: fromRow } = algebraicToCoords(from);
    const { col: toCol } = algebraicToCoords(to);
    delete boardAfterMove[coordsToAlgebraic(fromRow, toCol)];
  }

  return boardAfterMove;
}

/**
 * Відфільтровує кандидатів `pseudoMoves` фігури кольору `color` на `from`,
 * залишаючи лише ті, що не залишають власного короля під шахом.
 *
 * @param {Record<string, string>} board
 * @param {string} from
 * @param {string[]} pseudoMoves
 * @param {'w'|'b'} color
 * @param {string|null} [enPassantTarget]
 * @returns {string[]}
 */
export function filterByKingSafety(board, from, pseudoMoves, color, enPassantTarget = null) {
  return pseudoMoves.filter((to) => {
    const boardAfterMove = simulateMove(board, from, to, enPassantTarget);
    const kingSquare = findKingSquare(boardAfterMove, color);

    // Дошка без короля (тестові фікстури для кроку 1) — нема кого захищати.
    if (!kingSquare) return true;

    return !isSquareAttacked(boardAfterMove, kingSquare, getOpponentColor(color));
  });
}

/**
 * Повертає легальні ходи-рокіровки для короля кольору `color` ('e1'->'g1'/'c1').
 * Рокіровка навмисно НЕ проходить через `filterByKingSafety` — вона рухає
 * дві фігури одночасно (короля й туру) і має власну, ширшу умову безпеки
 * (король не може навіть ПЕРЕТИНАТИ атаковану клітинку, не лише приземлятись
 * на неї) — див. docs/move-validation.md, розділ 3.4.
 *
 * @param {Record<string, string>} board
 * @param {'w'|'b'} color
 * @param {{wK: boolean, wQ: boolean, bK: boolean, bQ: boolean}} castlingRights
 * @returns {string[]}
 */
export function getCastlingMoves(board, color, castlingRights) {
  const rank = color === COLORS.WHITE ? '1' : '8';
  const kingSymbol = KING_SYMBOLS[color];
  const rookSymbol = ROOK_SYMBOLS[color];
  const kingStart = `e${rank}`;

  if (board[kingStart] !== kingSymbol) return [];

  const opponentColor = getOpponentColor(color);
  if (isSquareAttacked(board, kingStart, opponentColor)) return [];

  const moves = [];
  const rightKey = color === COLORS.WHITE ? { K: 'wK', Q: 'wQ' } : { K: 'bK', Q: 'bQ' };

  // Коротка рокіровка (O-O): король e->g, тура h->f.
  if (castlingRights[rightKey.K]) {
    const passSquare = `f${rank}`;
    const landSquare = `g${rank}`;
    const rookSquare = `h${rank}`;

    const pathClear = !board[passSquare] && !board[landSquare];
    const rookPresent = board[rookSquare] === rookSymbol;
    const pathSafe =
      !isSquareAttacked(board, passSquare, opponentColor) &&
      !isSquareAttacked(board, landSquare, opponentColor);

    if (pathClear && rookPresent && pathSafe) moves.push(landSquare);
  }

  // Довга рокіровка (O-O-O): король e->c, тура a->d.
  // b-клітинка має бути порожньою (тура має де пройти), хоча король
  // через неї не проходить і атака на неї не має значення.
  if (castlingRights[rightKey.Q]) {
    const knightSquare = `b${rank}`;
    const passSquare = `d${rank}`;
    const landSquare = `c${rank}`;
    const rookSquare = `a${rank}`;

    const pathClear = !board[knightSquare] && !board[passSquare] && !board[landSquare];
    const rookPresent = board[rookSquare] === rookSymbol;
    const pathSafe =
      !isSquareAttacked(board, passSquare, opponentColor) &&
      !isSquareAttacked(board, landSquare, opponentColor);

    if (pathClear && rookPresent && pathSafe) moves.push(landSquare);
  }

  return moves;
}
