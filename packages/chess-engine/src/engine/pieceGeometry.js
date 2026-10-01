// src/engine/pieceGeometry.js
// Геометрія фігур: зміщення "крокуючих" фігур і напрямки "ковзаючих".
// Див. docs/move-validation.md, розділ 3.2.

// Кінь: 8 фіксованих зміщень (dRow, dCol), дорога не має значення.
export const KNIGHT_OFFSETS = [
  [-2, -1], [-2, 1],
  [-1, -2], [-1, 2],
  [1, -2], [1, 2],
  [2, -1], [2, 1],
];

// Король: усі 8 сусідніх клітинок.
export const KING_OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

// Тура: вертикаль + горизонталь.
export const ROOK_DIRECTIONS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
];

// Слон: обидві діагоналі.
export const BISHOP_DIRECTIONS = [
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

// Ферзь: об'єднання напрямків тури й слона.
export const QUEEN_DIRECTIONS = [...ROOK_DIRECTIONS, ...BISHOP_DIRECTIONS];
