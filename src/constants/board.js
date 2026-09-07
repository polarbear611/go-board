// 棋盘基础常量
export const BOARD_SIZE = 19; // 19路棋盘

// SVG 坐标系参数（单位：SVG 用户单位）
export const CELL_SIZE = 40;  // 每格大小
// 边缘到首条线的留白。必须留得下坐标标注**且不与首行/首列的棋子重叠**：
// 棋子半径是 CELL_SIZE*0.46 = 18.4，两位数标注半宽约 5.5，
// 所以标注中心到棋盘边的距离 d 需满足 d + 5.5 < PADDING - 18.4。
// PADDING=32 时 d 必须 < 8.1，挤不下 —— 之前 A 列有子就会压住行号。
export const PADDING = 44;    // 边缘到首条线的留白

// 棋盘 SVG 总尺寸 = 两侧留白 + 18格 * CELL_SIZE
export const SVG_SIZE = PADDING * 2 + (BOARD_SIZE - 1) * CELL_SIZE;

// 19路棋盘星位坐标（row, col 均为 0-indexed）
// 标准星位：四角(3,3)、四边中点(3,9)、天元(9,9)
export const STAR_POINTS = [
  [3, 3],  [3, 9],  [3, 15],
  [9, 3],  [9, 9],  [9, 15],
  [15, 3], [15, 9], [15, 15],
];

// 列标注：A-T 跳过 I（围棋标准标注）
export const COL_LABELS = 'ABCDEFGHJKLMNOPQRST'.split('');

// 行标注：19 到 1（从上到下）
export const ROW_LABELS = Array.from({ length: BOARD_SIZE }, (_, i) => BOARD_SIZE - i);

// 棋子类型枚举
export const STONE = {
  EMPTY: null,
  BLACK: 'black',
  WHITE: 'white',
};

// 棋盘木色背景
export const BOARD_COLOR = '#DCB468';
export const LINE_COLOR = '#5C3D1E';

// 将棋盘 stones（[row][col] → 'black'|'white'|null）序列化为字母坐标列表
// 列字母 = COL_LABELS[col]，行号 = BOARD_SIZE - row（与 IMPORT_STONES 的 parsePos 互逆）
// 返回 { blackStones: ['A1', ...], whiteStones: ['Q16', ...] }
export function boardToLabels(stones) {
  const blackStones = [];
  const whiteStones = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const stone = stones[row][col];
      if (!stone) continue;
      const label = COL_LABELS[col] + (BOARD_SIZE - row);
      if (stone === STONE.BLACK) blackStones.push(label);
      else if (stone === STONE.WHITE) whiteStones.push(label);
    }
  }
  return { blackStones, whiteStones };
}

// boardToLabels 的逆运算：字母坐标列表 -> 棋盘 [row][col]
// 这两个函数必须成对修改，所以放在一起。store 与 App 共用同一份，
// 避免各自维护一套 parsePos 而悄悄漂移。
export function labelsToBoard({ blackStones = [], whiteStones = [] }) {
  const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(STONE.EMPTY));
  const put = (labels, color) => {
    labels.forEach((label) => {
      const col = COL_LABELS.indexOf(String(label)[0].toUpperCase());
      const row = BOARD_SIZE - parseInt(String(label).slice(1), 10);
      if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
        board[row][col] = color;
      }
    });
  };
  put(blackStones, STONE.BLACK);
  put(whiteStones, STONE.WHITE);
  return board;
}
