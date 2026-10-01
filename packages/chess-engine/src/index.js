// Публічний API пакета @syncevent/chess-engine.
// Споживачі (chess-web, backend `games` через адаптер ChessRules) імпортують лише звідси,
// не з внутрішніх модулів engine/*.
//
// Фасад engine/index.js поки заглушки — заповнення це крок 1 треку рушія
// (docs/architecture/chess-foundation.md §8).
export { isMoveLegal, getMoveDetails, getLegalMoves } from './engine/index.js';
export { COLORS } from './constants.js';
export { STARTING_FEN } from './fenConstants.js';
