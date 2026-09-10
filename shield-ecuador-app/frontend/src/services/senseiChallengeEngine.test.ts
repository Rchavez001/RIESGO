import { checkWinner, isDraw, getBestMove, flipCoin, emptyBoard, Board } from './senseiChallengeEngine'

describe('checkWinner', () => {
  const lines: Array<[number[], string]> = [
    [[0, 1, 2], 'top row'],
    [[3, 4, 5], 'middle row'],
    [[6, 7, 8], 'bottom row'],
    [[0, 3, 6], 'left column'],
    [[1, 4, 7], 'middle column'],
    [[2, 5, 8], 'right column'],
    [[0, 4, 8], 'main diagonal'],
    [[2, 4, 6], 'anti diagonal'],
  ]

  it.each(lines)('detects a win on %s', (cells) => {
    const board = emptyBoard()
    cells.forEach((index) => { board[index] = 'X' })
    const result = checkWinner(board)
    expect(result.winner).toBe('X')
    expect(result.line).toEqual(cells)
  })

  it('reports no winner on an empty board', () => {
    expect(checkWinner(emptyBoard()).winner).toBeNull()
  })

  it('does not misdetect a win from a mixed line', () => {
    const board = emptyBoard()
    board[0] = 'X'; board[1] = 'O'; board[2] = 'X'
    expect(checkWinner(board).winner).toBeNull()
  })
})

describe('isDraw', () => {
  it('is true for a full board with no winner', () => {
    // X O X / X O O / O X X
    const board: Board = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']
    expect(checkWinner(board).winner).toBeNull()
    expect(isDraw(board)).toBe(true)
  })

  it('is false while cells remain empty', () => {
    const board = emptyBoard()
    board[0] = 'X'
    expect(isDraw(board)).toBe(false)
  })

  it('is false when there is a winner even if the board later fills', () => {
    const board: Board = ['X', 'X', 'X', 'O', 'O', null, null, null, null]
    expect(isDraw(board)).toBe(false)
  })
})

describe('getBestMove (Sensei plays O)', () => {
  it('takes the immediate win when available', () => {
    // O O _ / X X _ / _ _ _  -> O should play index 2 to win
    const board: Board = ['O', 'O', null, 'X', 'X', null, null, null, null]
    const move = getBestMove(board, 'O')
    expect(move).toBe(2)
  })

  it('blocks the opponent\'s immediate win instead of playing elsewhere', () => {
    // X X _ / O _ _ / _ _ _  -> X threatens index 2, O must block
    const board: Board = ['X', 'X', null, 'O', null, null, null, null, null]
    const move = getBestMove(board, 'O')
    expect(move).toBe(2)
  })

  it('never loses from the opening move (plays out perfectly against itself)', () => {
    let board = emptyBoard()
    let turn: 'X' | 'O' = 'X'
    // Both sides play optimally for O; X plays optimally too (using the same
    // engine from X's perspective) so a perfect game must end in a draw.
    for (let i = 0; i < 9; i += 1) {
      if (checkWinner(board).winner || isDraw(board)) break
      const move = getBestMove(board, turn, () => 0)
      if (move === null) break
      board = board.slice() as Board
      board[move] = turn
      turn = turn === 'X' ? 'O' : 'X'
    }
    expect(checkWinner(board).winner).toBeNull()
  })

  it('handles boards with more O than X (skipped user turns) without throwing', () => {
    // Two user failures in a row: O got two extra moves relative to X.
    const board: Board = [null, 'O', null, null, 'O', null, null, null, null]
    expect(() => getBestMove(board, 'O')).not.toThrow()
    const move = getBestMove(board, 'O')
    expect(move).not.toBeNull()
    expect(board[move as number]).toBeNull()
  })

  it('returns null when the board is already full', () => {
    const board: Board = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']
    expect(getBestMove(board, 'O')).toBeNull()
  })

  it('only picks among empty cells', () => {
    const board: Board = ['X', null, null, null, 'O', null, null, null, null]
    for (let i = 0; i < 20; i += 1) {
      const move = getBestMove(board, 'O', () => i / 20)
      expect(board[move as number]).toBeNull()
    }
  })
})

describe('flipCoin', () => {
  it('returns "cara" when the injected rng is below 0.5', () => {
    expect(flipCoin(() => 0)).toBe('cara')
    expect(flipCoin(() => 0.49)).toBe('cara')
  })

  it('returns "sello" when the injected rng is 0.5 or above', () => {
    expect(flipCoin(() => 0.5)).toBe('sello')
    expect(flipCoin(() => 0.999)).toBe('sello')
  })
})
