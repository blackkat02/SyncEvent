// src/utils/fenConverter.js

/**
 * Конвертує частину FEN, що описує позицію (наприклад, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"),
 * у формат об'єкта { 'a1': 'R', 'e8': 'k', ... }, використовуючи FEN-символи як значення.
 */
export const fenToBoardObject = (fenPosition) => {
    const boardObject = {};
    const rows = fenPosition.split('/');
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    rows.forEach((rowString, rankIndex) => {
        let fileIndex = 0;
        const rank = 8 - rankIndex; // Рядки: 8, 7, ..., 1

        for (const char of rowString) {
            if (/\d/.test(char)) {
                // Якщо це цифра (пробіл), пропускаємо стільки клітин
                fileIndex += parseInt(char, 10);
            } else {
                // Якщо це символ фігури
                const squareId = files[fileIndex] + rank;

                // ✅ ВИПРАВЛЕНО: Використовуємо сам символ 'char' як значення
                boardObject[squareId] = char;
                fileIndex++;
            }
        }
    });
    return boardObject;
};