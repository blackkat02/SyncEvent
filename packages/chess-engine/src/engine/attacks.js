// src/engine/attacks.js
// isSquareAttacked — ключовий перевикористовуваний примітив для шаху,
// легальності ходу короля й рокіровки. Див. docs/move-validation.md,
// розділ 3.3 та розділ 5 (крок 3).

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

// "Атака" ≠ "хід": на відміну від getPseudoLegalMoves (pseudoMoves.js),
// тут НЕ виключаємо клітинки зі своїми фігурами — нас цікавить сам факт
// геометричного покриття клітинки, а не "чи можна легально туди піти".
// У реальному використанні (isCheck, рокіровка) `square` завжди належить
// протилежному до `byColor` кольору, тому ця відмінність на практиці не
// створює двозначності.

function stepAttacksSquare(pieceSquare, offsets, targetSquare) {
  const { row, col } = algebraicToCoords(pieceSquare);
  const target = algebraicToCoords(targetSquare);

  return offsets.some(
    ([dRow, dCol]) => row + dRow === target.row && col + dCol === target.col
  );
}

function slideAttacksSquare(board, pieceSquare, directions, targetSquare) {
  const { row, col } = algebraicToCoords(pieceSquare);

  for (const [dRow, dCol] of directions) {
    let currentRow = row + dRow;
    let currentCol = col + dCol;

    while (isInBounds(currentRow, currentCol)) {
      const currentSquare = coordsToAlgebraic(currentRow, currentCol);
      if (currentSquare === targetSquare) return true;
      // Будь-яка фігура (своя чи чужа) блокує промінь далі — атакуюча
      // фігура не "бачить" крізь неї.
      if (board[currentSquare]) break;

      currentRow += dRow;
      currentCol += dCol;
    }
  }

  return false;
}

function pawnAttacksSquare(pieceSquare, color, targetSquare) {
  const { row, col } = algebraicToCoords(pieceSquare);
  const target = algebraicToCoords(targetSquare);
  const direction = color === COLORS.WHITE ? -1 : 1;

  return target.row === row + direction && Math.abs(target.col - col) === 1;
}

/**
 * Чи атакує колір `byColor` клітинку `square` у поточній позиції.
 *
 * @param {Record<string, string>} board
 * @param {string} square
 * @param {'w'|'b'} byColor
 * @returns {boolean}
 */
export function isSquareAttacked(board, square, byColor) {
  for (const [pieceSquare, piece] of Object.entries(board)) {
    if (getPieceColor(piece) !== byColor) continue;

    const pieceType = piece.toUpperCase();

    switch (pieceType) {
      case 'P':
        if (pawnAttacksSquare(pieceSquare, byColor, square)) return true;
        break;
      case 'N':
        if (stepAttacksSquare(pieceSquare, KNIGHT_OFFSETS, square)) return true;
        break;
      case 'K':
        if (stepAttacksSquare(pieceSquare, KING_OFFSETS, square)) return true;
        break;
      case 'R':
        if (slideAttacksSquare(board, pieceSquare, ROOK_DIRECTIONS, square)) return true;
        break;
      case 'B':
        if (slideAttacksSquare(board, pieceSquare, BISHOP_DIRECTIONS, square)) return true;
        break;
      case 'Q':
        if (slideAttacksSquare(board, pieceSquare, QUEEN_DIRECTIONS, square)) return true;
        break;
      default:
        break;
    }
  }

  return false;
}
