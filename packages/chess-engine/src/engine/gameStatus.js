// src/engine/gameStatus.js
// Шах / мат / пат — усі три через один і той самий getAllLegalMoves.
// Див. docs/move-validation.md, розділ 3.5 та розділ 5 (крок 5).

import { getPieceColor, getOpponentColor } from '../utils/chessHelpers.js';
import { getPseudoLegalMoves } from './pseudoMoves.js';
import { filterByKingSafety, getCastlingMoves, findKingSquare } from './legalMoves.js';
import { isSquareAttacked } from './attacks.js';

/**
 * @param {Record<string, string>} board
 * @param {'w'|'b'} color
 * @returns {boolean}
 */
export function isCheck(board, color) {
  const kingSquare = findKingSquare(board, color);
  if (!kingSquare) return false; // дошка без короля (тестові фікстури) — шаху немає

  return isSquareAttacked(board, kingSquare, getOpponentColor(color));
}

/**
 * Усі легальні ходи всіх фігур кольору `color` у поточній позиції гри.
 * Єдине місце, де "легальність" рахується по-справжньому повністю —
 * геометрія (крок 1) + безпека короля (крок 3) + рокіровка (крок 4) для
 * КОЖНОЇ фігури цього кольору одночасно, а не для однієї, як у
 * filterByKingSafety.
 *
 * @param {object} gameState - зріз стану гри (board, castlingRights, enPassantTarget)
 * @param {'w'|'b'} color
 * @returns {Array<{ from: string, to: string }>}
 */
export function getAllLegalMoves(gameState, color) {
  const { board, enPassantTarget, castlingRights } = gameState;
  const moves = [];

  for (const [square, piece] of Object.entries(board)) {
    if (getPieceColor(piece) !== color) continue;

    const pseudoMoves = getPseudoLegalMoves(board, square, enPassantTarget);
    const legalMoves = filterByKingSafety(board, square, pseudoMoves, color, enPassantTarget);
    legalMoves.forEach((to) => moves.push({ from: square, to }));

    if (piece.toUpperCase() === 'K') {
      const castlingMoves = getCastlingMoves(board, color, castlingRights);
      castlingMoves.forEach((to) => moves.push({ from: square, to }));
    }
  }

  return moves;
}

/**
 * @param {object} gameState
 * @param {'w'|'b'} color
 * @returns {boolean}
 */
export function isCheckmate(gameState, color) {
  return isCheck(gameState.board, color) && getAllLegalMoves(gameState, color).length === 0;
}

/**
 * @param {object} gameState
 * @param {'w'|'b'} color
 * @returns {boolean}
 */
export function isStalemate(gameState, color) {
  return !isCheck(gameState.board, color) && getAllLegalMoves(gameState, color).length === 0;
}
