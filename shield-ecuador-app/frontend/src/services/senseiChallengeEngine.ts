// Pure, dependency-free game engine for "Desafiando al Sensei". Kept separate
// from React/UI so the minimax search and win detection can be unit tested
// directly. The board never assumes strict X/O alternation: a user who fails
// a question loses their turn, so the Sensei may move twice in a row and the
// board can legitimately hold more O than X.

export type Cell = null | 'X' | 'O'
export type Board = Cell[] // length 9, row-major: [0,1,2 / 3,4,5 / 6,7,8]
export type Player = 'X' | 'O'

export const WINNING_LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6], // diagonals
]

export function emptyBoard(): Board {
  return Array(9).fill(null)
}

export function checkWinner(board: Board): { winner: Player | null; line: number[] | null } {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a] as Player, line }
    }
  }
  return { winner: null, line: null }
}

export function isBoardFull(board: Board): boolean {
  return board.every((cell) => cell !== null)
}

export function isDraw(board: Board): boolean {
  return !checkWinner(board).winner && isBoardFull(board)
}

export function emptyCells(board: Board): number[] {
  const cells: number[] = []
  board.forEach((cell, index) => {
    if (cell === null) cells.push(index)
  })
  return cells
}

function opponent(player: Player): Player {
  return player === 'X' ? 'O' : 'X'
}

/**
 * Minimax with depth-aware scoring so the Sensei prefers the fastest win and
 * the slowest loss, never a "good enough" move. `aiPlayer` is the symbol the
 * Sensei is optimizing for (always 'O' in this game, but kept explicit for
 * testability). `currentPlayer` for the *root* call must be passed by the
 * caller — it is never inferred from piece counts, because skipped user
 * turns can leave the board with more O than X.
 */
function minimax(board: Board, currentPlayer: Player, aiPlayer: Player, depth: number): number {
  const { winner } = checkWinner(board)
  if (winner === aiPlayer) return 10 - depth
  if (winner === opponent(aiPlayer)) return depth - 10
  if (isBoardFull(board)) return 0

  const scores = emptyCells(board).map((index) => {
    const next = board.slice()
    next[index] = currentPlayer
    return minimax(next, opponent(currentPlayer), aiPlayer, depth + 1)
  })

  return currentPlayer === aiPlayer ? Math.max(...scores) : Math.min(...scores)
}

/**
 * Returns the best cell index for `aiPlayer` to play, given the actual
 * current board and whose turn it actually is (which must equal `aiPlayer`
 * when this is called). Ties are broken uniformly at random among moves of
 * equal strategic value, per the "vary only among equal-value moves" rule.
 * Returns null if the board has no empty cells (caller's responsibility to
 * not call this on a finished game).
 */
export function getBestMove(board: Board, aiPlayer: Player, rng: () => number = Math.random): number | null {
  const candidates = emptyCells(board)
  if (candidates.length === 0) return null

  let bestScore = -Infinity
  let bestMoves: number[] = []

  for (const index of candidates) {
    const next = board.slice()
    next[index] = aiPlayer
    const score = minimax(next, opponent(aiPlayer), aiPlayer, 1)
    if (score > bestScore) {
      bestScore = score
      bestMoves = [index]
    } else if (score === bestScore) {
      bestMoves.push(index)
    }
  }

  return bestMoves[Math.floor(rng() * bestMoves.length)]
}

export type CoinFace = 'cara' | 'sello'

/** 50/50 coin flip. `rng` is injectable so tests can force either outcome
 * without asserting a statistical distribution on real randomness. */
export function flipCoin(rng: () => number = Math.random): CoinFace {
  return rng() < 0.5 ? 'cara' : 'sello'
}
