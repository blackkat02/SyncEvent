/**
 * Перетворює алгебраїчну нотацію клітинки (наприклад, 'e2')
 * у координати масиву [row, col].
 *
 * @param {string} algebraicNotation - Алгебраїчна нотація клітинки (наприклад, 'e2').
 * @returns {{row: number, col: number}} Об'єкт з індексом рядка та стовпця.
 */
export const algebraicToCoords = (algebraicNotation) => {
    if (typeof algebraicNotation !== 'string' || algebraicNotation.length !== 2) {
        throw new Error('Неправильний формат алгебраїчної нотації. Очікується рядок з 2 символів (наприклад, "a1").');
    }

    const fileChar = algebraicNotation[0].toLowerCase(); // 'a' до 'h'
    const rankChar = algebraicNotation[1];             // '1' до '8'

    const col = fileChar.charCodeAt(0) - 'a'.charCodeAt(0); // 'a' -> 0, 'b' -> 1, ...
    const row = 8 - parseInt(rankChar, 10);                // '1' -> 7, '2' -> 6, ... '8' -> 0

    if (col < 0 || col > 7 || row < 0 || row > 7 || isNaN(row) || isNaN(col)) {
        throw new Error(`Недійсні координати: ${algebraicNotation}`);
    }

    return { row, col };
};

/**
 * Перетворює координати масиву [row, col] в алгебраїчну нотацію.
 * Може бути корисним для зворотного перетворення (наприклад, для логування).
 *
 * @param {number} row - Індекс рядка (0-7).
 * @param {number} col - Індекс стовпця (0-7).
 * @returns {string} Алгебраїчна нотація клітинки (наприклад, 'e2').
 */
export const coordsToAlgebraic = (row, col) => {
    if (row < 0 || row > 7 || col < 0 || col > 7) {
        throw new Error(`Недійсні координати масиву: [${row}, ${col}]`);
    }

    const fileChar = String.fromCharCode('a'.charCodeAt(0) + col);
    const rankChar = (8 - row).toString();

    return `${fileChar}${rankChar}`;
};