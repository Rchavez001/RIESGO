import { Board, CoinFace, Player } from '../services/senseiChallengeEngine'

export type QuestionContent = {
  id: string
  prompt: string
  options: string[]
  terms?: Record<string, string>
  topic?: string
  // Only present on questions synced from the news-agent pipeline
  // (public.learning_items.source_question_id IS NOT NULL) — the seeded
  // belt-exam question bank has no equivalent date, so this is optional.
  generated_at?: string
}

export type Phase =
  | 'coin-select' | 'coin-flip' | 'coin-announce'
  | 'sensei-opening'
  | 'loading-question' | 'question' | 'answered-correct' | 'answered-wrong'
  | 'placing'
  | 'sensei-thinking'
  | 'tiebreak-select' | 'tiebreak-flip' | 'tiebreak-announce'
  | 'result'
  | 'no-questions'
  | 'error'

export type WrongAnswerRecord = { prompt: string; explanation: string }

export interface GameState {
  phase: Phase
  board: Board
  turn: Player
  coinChoice: CoinFace | null
  coinResult: CoinFace | null
  userStarts: boolean | null
  currentQuestion: QuestionContent | null
  shuffledOrder: number[]
  usedQuestionIds: string[]
  questionsAnswered: number
  questionsCorrect: number
  wrongAnswers: WrongAnswerRecord[]
  lastAnswerCorrect: boolean | null
  lastAnswerExplanation: string | null
  lastCorrectDisplayIndex: number | null
  winner: 'user' | 'sensei' | 'draw' | null
  winLine: number[] | null
  wonByTiebreak: boolean
  errorMessage: string | null
}

export const USER_SYMBOL: Player = 'X'
export const SENSEI_SYMBOL: Player = 'O'

export function initialGameState(): GameState {
  return {
    phase: 'coin-select',
    board: Array(9).fill(null),
    turn: USER_SYMBOL,
    coinChoice: null,
    coinResult: null,
    userStarts: null,
    currentQuestion: null,
    shuffledOrder: [],
    usedQuestionIds: [],
    questionsAnswered: 0,
    questionsCorrect: 0,
    wrongAnswers: [],
    lastAnswerCorrect: null,
    lastAnswerExplanation: null,
    lastCorrectDisplayIndex: null,
    winner: null,
    winLine: null,
    wonByTiebreak: false,
    errorMessage: null,
  }
}

export function shuffleIndices(length: number, rng: () => number = Math.random): number[] {
  const order = Array.from({ length }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}
