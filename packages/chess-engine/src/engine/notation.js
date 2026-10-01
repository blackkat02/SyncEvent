// src/engine/notation.js
// Побудова алгебраїчної нотації (SAN) ходу. На відміну від "легкого"
// алгоритму, накресленого в docs/move-notation.md (розділ 6, MVP без
// повної легальності), тут дизамбігуація й суфікси шаху/мату СТРОГІ —
// побудовані на getAllLegalMoves/isCheck/isCheckmate (docs/move-validation.md,
// крок 7), бо повний генератор легальних ходів уже готовий (кроки 1-5).

import { getPieceColor } from '../utils/chessHelpers.js';
import { getAllLegalMoves } from './gameStatus.js';

const fileOf = (square) => square[0];
const rankOf = (square) => square[1];

// Дизамбігуація потрібна лише для фігур, що не пішак і не король: пішак
// завжди однозначний (взяття вже містить файл, тихий хід — єдина клітинка
// вперед), король єдиний на дошці — дизамбігувати нема з ким.
function getDisambiguation(gameStateBeforeMove, move) {
  const { from, to, piece } = move;
  const pieceType = piece.toUpperCase();
  if (pieceType === 'P' || pieceType === 'K') return '';

  const color = getPieceColor(piece);
  const otherLegalMoves = getAllLegalMoves(gameStateBeforeMove, color).filter(
    (candidate) =>
      candidate.to === to &&
      candidate.from !== from &&
      gameStateBeforeMove.board[candidate.from]?.toUpperCase() === pieceType
  );

  if (otherLegalMoves.length === 0) return '';

  const sameFile = otherLegalMoves.some((candidate) => fileOf(candidate.from) === fileOf(from));
  const sameRank = otherLegalMoves.some((candidate) => rankOf(candidate.from) === rankOf(from));

  if (!sameFile) return fileOf(from); // досить літери файлу, щоб розрізнити
  if (!sameRank) return rankOf(from); // файли збігаються — досить рангу
  return from; // збігається і файл, і ранг (третя фігура на дотичній діагоналі) — потрібне повне поле
}

/**
 * Будує SAN-рядок для вже виконаного ходу.
 *
 * @param {{board: Record<string,string>, castlingRights: object, enPassantTarget: string|null}} gameStateBeforeMove
 *   Позиція ДО ходу — потрібна для дизамбігуації (розділ 3.1, docs/move-validation.md).
 * @param {{from: string, to: string, piece: string, captured: string|null, castling: 'K'|'Q'|null, promotion: string|null}} move
 * @param {{isCheck?: boolean, isCheckmate?: boolean}} [status] - статус СУПЕРНИКА ПІСЛЯ ходу
 * @returns {string}
 */
export function buildSan(gameStateBeforeMove, move, status = {}) {
  const { from, to, piece, captured, castling, promotion } = move;
  const { isCheck = false, isCheckmate = false } = status;

  let san;

  if (castling === 'K') {
    san = 'O-O';
  } else if (castling === 'Q') {
    san = 'O-O-O';
  } else {
    const pieceType = piece.toUpperCase();
    const isCapture = Boolean(captured);

    if (pieceType === 'P') {
      san = isCapture ? `${fileOf(from)}x${to}` : to;
      if (promotion) san += `=${promotion}`;
    } else {
      const disambiguation = getDisambiguation(gameStateBeforeMove, move);
      san = `${pieceType}${disambiguation}${isCapture ? 'x' : ''}${to}`;
    }
  }

  if (isCheckmate) san += '#';
  else if (isCheck) san += '+';

  return san;
}
