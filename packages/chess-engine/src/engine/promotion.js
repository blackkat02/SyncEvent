// src/engine/promotion.js
// Промоція пішака. UI-питання (який саме компонент запитує гравця, яку
// фігуру обрати) свідомо поза межами рушія — тут лише контракт: "чи цей хід
// вимагає промоції" і "яку фігуру фактично поставити на дошку", з безпечним
// дефолтом (ферзь), поки UI-вибору ще не існує. Див. docs/move-validation.md,
// розділ 3.4 та розділ 5 (крок 6).

import { getPieceColor } from '../utils/chessHelpers.js';
import { COLORS } from '../constants.js';

const LAST_RANK = { [COLORS.WHITE]: '8', [COLORS.BLACK]: '1' };

export const PROMOTION_PIECES = ['Q', 'R', 'B', 'N'];
export const DEFAULT_PROMOTION_PIECE = 'Q';

/**
 * Чи цей хід пішака є промоцією (досягнення протилежного останнього ряду).
 *
 * @param {string} piece - FEN-символ фігури, що ходить
 * @param {string} to - клітинка призначення
 * @returns {boolean}
 */
export function requiresPromotion(piece, to) {
  if (!piece || piece.toUpperCase() !== 'P') return false;
  return to[1] === LAST_RANK[getPieceColor(piece)];
}

/**
 * Чи є `promotion` однією з дозволених фігур (Q/R/B/N, будь-який регістр).
 * Король і сам пішак — недійсні цілі промоції.
 *
 * @param {string|undefined} promotion
 * @returns {boolean}
 */
export function isValidPromotionPiece(promotion) {
  return PROMOTION_PIECES.includes((promotion ?? '').toUpperCase());
}

/**
 * Повертає FEN-символ фігури, яка фактично з'явиться на дошці, у регістрі,
 * що відповідає кольору пішака. Якщо `promotion` не передано — дефолт
 * "ферзь" (найчастіший вибір; конкретний UI вибору фігури — окрема задача).
 *
 * @param {string} piece - FEN-символ пішака, що промотує ('P' або 'p')
 * @param {string} [promotion] - 'Q'|'R'|'B'|'N', будь-який регістр
 * @returns {string}
 */
export function resolvePromotionPiece(piece, promotion) {
  const chosen = (promotion ?? DEFAULT_PROMOTION_PIECE).toUpperCase();
  const color = getPieceColor(piece);
  return color === COLORS.WHITE ? chosen : chosen.toLowerCase();
}
