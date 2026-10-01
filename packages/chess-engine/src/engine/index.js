// src/engine/index.js
// Публічний фасад шахового двигуна. Див. docs/move-validation.md, розділ 4.2.
//
// gameOperations.js (attemptMove) має імпортувати рушій лише звідси,
// не з внутрішніх модулів напряму.

/**
 * Чи є хід from -> to легальним у поточному стані гри.
 *
 * @param {object} gameState - зріз state.game
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
// eslint-disable-next-line no-unused-vars
export function isMoveLegal(gameState, from, to) {
  throw new Error('isMoveLegal: не реалізовано (docs/move-validation.md, крок 1+)');
}

/**
 * Повертає деталі ходу (captured, castling, enPassant, isCheck, isCheckmate,
 * оновлені castlingRights/enPassantTarget) для вже перевіреного легального ходу.
 *
 * @param {object} gameState
 * @param {string} from
 * @param {string} to
 * @param {{ promotion?: string }} [options]
 * @returns {object}
 */
// eslint-disable-next-line no-unused-vars
export function getMoveDetails(gameState, from, to, options = {}) {
  throw new Error('getMoveDetails: не реалізовано (docs/move-validation.md, крок 1+)');
}

/**
 * Легальні ходи для фігури на клітинці `from` (для підсвітки в UI).
 *
 * @param {object} gameState
 * @param {string} from
 * @returns {string[]}
 */
// eslint-disable-next-line no-unused-vars
export function getLegalMoves(gameState, from) {
  throw new Error('getLegalMoves: не реалізовано (docs/move-validation.md, крок 1+)');
}
