// src/engine/pseudoMoves.js
// Генерація псевдолегальних ходів: геометрія фігури + власні/чужі фігури на
// шляху, БЕЗ урахування шаху власному королю. Див. docs/move-validation.md,
// розділ 3.1, 3.2 та розділ 5 (крок 1).

import { algebraicToCoords, coordsToAlgebraic } from '../utils/boardUtils.js';
import { getPieceColor } from '../utils/chessHelpers.js';
import { COLORS } from '../constants.js';
import {
  KNIGHT_OFFSETS,
  KING_OFFSETS,
  ROOK_DIRECTIONS,
  BISHOP_DIRECTIONS,
  QUEEN_DIRECTIONS,
} from './pieceGeometry.js';

const isInBounds = (row, col) => row >= 0 && row <= 7 && col >= 0 && col <= 7;

// "Крокуючі" фігури (кінь, король): кожне зміщення перевіряється незалежно,
// дорога до клітинки значення не має.
function getSteppingMoves(board, square, offsets, color) {
  const { row, col } = algebraicToCoords(square);
  const moves = [];

  for (const [dRow, dCol] of offsets) {
    const targetRow = row + dRow;
    const targetCol = col + dCol;
    if (!isInBounds(targetRow, targetCol)) continue;

    const targetSquare = coordsToAlgebraic(targetRow, targetCol);
    const targetPiece = board[targetSquare];

    // Порожньо або ворожа фігура (взяття) — можна піти. Своя фігура — ні.
    if (!targetPiece || getPieceColor(targetPiece) !== color) {
      moves.push(targetSquare);
    }
  }

  return moves;
}

// "Ковзаючі" фігури (тура, слон, ферзь): рух клітинка за клітинкою в кожному
// напрямку, поки не вийшли за межі дошки, не вперлися у свою фігуру (стоп,
// без неї) або у ворожу (стоп, включно з нею — взяття).
function getSlidingMoves(board, square, directions, color) {
  const { row, col } = algebraicToCoords(square);
  const moves = [];

  for (const [dRow, dCol] of directions) {
    let targetRow = row + dRow;
    let targetCol = col + dCol;

    while (isInBounds(targetRow, targetCol)) {
      const targetSquare = coordsToAlgebraic(targetRow, targetCol);
      const targetPiece = board[targetSquare];

      if (!targetPiece) {
        moves.push(targetSquare);
      } else {
        if (getPieceColor(targetPiece) !== color) moves.push(targetSquare);
        break; // далі по цьому напрямку йти не можна — фігура (своя чи чужа)
      }

      targetRow += dRow;
      targetCol += dCol;
    }
  }

  return moves;
}

// Пішак: окремий випадок, що не вкладається в "крокуючі"/"ковзаючі"
// (docs/move-validation.md, розділ 3.2).
function getPawnMoves(board, square, color, enPassantTarget) {
  const { row, col } = algebraicToCoords(square);
  const moves = [];

  // У системі координат boardUtils.js row зменшується від 1-го рангу до 8-го,
  // тому "вперед" для білих — це напрямок -1, для чорних — +1.
  const direction = color === COLORS.WHITE ? -1 : 1;
  const startRow = color === COLORS.WHITE ? 6 : 1;

  const oneForwardRow = row + direction;
  if (isInBounds(oneForwardRow, col)) {
    const oneForwardSquare = coordsToAlgebraic(oneForwardRow, col);

    if (!board[oneForwardSquare]) {
      moves.push(oneForwardSquare);

      if (row === startRow) {
        const twoForwardRow = row + direction * 2;
        const twoForwardSquare = coordsToAlgebraic(twoForwardRow, col);
        if (!board[twoForwardSquare]) moves.push(twoForwardSquare);
      }
    }
  }

  for (const dCol of [-1, 1]) {
    const captureRow = row + direction;
    const captureCol = col + dCol;
    if (!isInBounds(captureRow, captureCol)) continue;

    const captureSquare = coordsToAlgebraic(captureRow, captureCol);
    const targetPiece = board[captureSquare];
    const isEnPassantCapture = captureSquare === enPassantTarget && !targetPiece;

    if ((targetPiece && getPieceColor(targetPiece) !== color) || isEnPassantCapture) {
      moves.push(captureSquare);
    }
  }

  return moves;
}

/**
 * Повертає список клітинок ('e4', ...), куди фігура на `square` може піти
 * геометрично, без урахування безпеки власного короля. Не включає
 * рокіровку — це окрема функція `getCastlingMoves` (legalMoves.js), бо
 * рокіровка не вкладається в "звичайну" геометрію ходу (докладніше —
 * docs/move-validation.md, розділ 3.4).
 *
 * @param {Record<string, string>} board - плоский об'єкт 'клітинка' -> FEN-символ
 * @param {string} square - клітинка фігури, що ходить (наприклад, 'e2')
 * @param {string|null} [enPassantTarget] - клітинка, легальна для взяття на проході просто зараз
 * @returns {string[]}
 */
export function getPseudoLegalMoves(board, square, enPassantTarget = null) {
  const piece = board[square];
  if (!piece) return [];

  const color = getPieceColor(piece);
  const pieceType = piece.toUpperCase();

  switch (pieceType) {
    case 'P':
      return getPawnMoves(board, square, color, enPassantTarget);
    case 'N':
      return getSteppingMoves(board, square, KNIGHT_OFFSETS, color);
    case 'K':
      return getSteppingMoves(board, square, KING_OFFSETS, color);
    case 'R':
      return getSlidingMoves(board, square, ROOK_DIRECTIONS, color);
    case 'B':
      return getSlidingMoves(board, square, BISHOP_DIRECTIONS, color);
    case 'Q':
      return getSlidingMoves(board, square, QUEEN_DIRECTIONS, color);
    default:
      return [];
  }
}
