import { useCallback, useEffect, useReducer, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { checkWinner, isDraw, getBestMove, flipCoin, Board, CoinFace } from '../services/senseiChallengeEngine'
import { GameState, QuestionContent, USER_SYMBOL, SENSEI_SYMBOL, initialGameState, shuffleIndices } from './senseiChallengeTypes'
import { useDojoAudio } from '../contexts/DojoAudioContext'

type Action =
  | { type: 'SELECT_COIN'; face: CoinFace }
  | { type: 'START_FLIP' }
  | { type: 'FLIP_RESULT_READY'; result: CoinFace }
  | { type: 'COIN_RESOLVED'; result: CoinFace; userStarts: boolean }
  | { type: 'SENSEI_OPENED'; board: Board }
  | { type: 'REQUEST_QUESTION' }
  | { type: 'QUESTION_LOADED'; question: QuestionContent; order: number[] }
  | { type: 'QUESTION_LOAD_FAILED'; message: string }
  | { type: 'NO_QUESTIONS_LEFT' }
  | { type: 'ANSWER_RESULT'; correct: boolean; explanation: string; correctDisplayIndex: number }
  | { type: 'ANSWER_FAILED'; message: string }
  | { type: 'ENTER_PLACING' }
  | { type: 'CONTINUE_AFTER_WRONG' }
  | { type: 'PLACE_USER'; board: Board; index: number }
  | { type: 'BOARD_RESOLVED'; winner: 'user' | 'sensei' | 'draw'; line: number[] | null }
  | { type: 'CONTINUE_TO_QUESTION' }
  | { type: 'SENSEI_THINKING' }
  | { type: 'SENSEI_MOVED'; board: Board }
  | { type: 'TIEBREAK_SELECT_COIN'; face: CoinFace }
  | { type: 'TIEBREAK_START_FLIP' }
  | { type: 'TIEBREAK_RESOLVED'; result: CoinFace; userWins: boolean }
  | { type: 'RESET' }

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'SELECT_COIN':
      return state.phase === 'coin-select' || state.phase === 'tiebreak-select'
        ? { ...state, coinChoice: action.face }
        : state
    case 'START_FLIP':
      return { ...state, phase: state.phase === 'tiebreak-select' ? 'tiebreak-flip' : 'coin-flip', coinResult: null }
    case 'FLIP_RESULT_READY':
      return (state.phase === 'coin-flip' || state.phase === 'tiebreak-flip') && !state.coinResult
        ? { ...state, coinResult: action.result }
        : state
    case 'COIN_RESOLVED':
      return { ...state, phase: 'coin-announce', coinResult: action.result, userStarts: action.userStarts, turn: action.userStarts ? USER_SYMBOL : SENSEI_SYMBOL }
    case 'SENSEI_OPENED':
      return { ...state, board: action.board, phase: 'loading-question', turn: USER_SYMBOL }
    case 'REQUEST_QUESTION':
      return { ...state, phase: 'loading-question', errorMessage: null }
    case 'QUESTION_LOADED':
      return { ...state, phase: 'question', currentQuestion: action.question, shuffledOrder: action.order, lastAnswerCorrect: null, lastAnswerExplanation: null }
    case 'QUESTION_LOAD_FAILED':
      return { ...state, phase: 'error', errorMessage: action.message }
    case 'NO_QUESTIONS_LEFT':
      return { ...state, phase: 'no-questions' }
    case 'ANSWER_RESULT':
      return {
        ...state,
        phase: action.correct ? 'answered-correct' : 'answered-wrong',
        lastAnswerCorrect: action.correct,
        lastAnswerExplanation: action.explanation,
        lastCorrectDisplayIndex: action.correctDisplayIndex,
        questionsAnswered: state.questionsAnswered + 1,
        questionsCorrect: state.questionsCorrect + (action.correct ? 1 : 0),
        wrongAnswers: action.correct || !state.currentQuestion
          ? state.wrongAnswers
          : [...state.wrongAnswers, { prompt: state.currentQuestion.prompt, explanation: action.explanation }],
        usedQuestionIds: state.currentQuestion ? [...state.usedQuestionIds, state.currentQuestion.id] : state.usedQuestionIds,
      }
    case 'ANSWER_FAILED':
      return { ...state, phase: 'error', errorMessage: action.message }
    case 'ENTER_PLACING':
      return { ...state, phase: 'placing' }
    case 'CONTINUE_AFTER_WRONG':
      return { ...state, phase: 'sensei-thinking' }
    case 'PLACE_USER':
      return { ...state, board: action.board, turn: SENSEI_SYMBOL }
    case 'BOARD_RESOLVED': {
      if (action.winner === 'draw') {
        return { ...state, phase: 'tiebreak-select', winner: 'draw', winLine: null, coinChoice: null, coinResult: null }
      }
      return { ...state, phase: 'result', winner: action.winner, winLine: action.line, wonByTiebreak: false }
    }
    case 'CONTINUE_TO_QUESTION':
      return { ...state, phase: 'loading-question' }
    case 'SENSEI_THINKING':
      return { ...state, phase: 'sensei-thinking' }
    case 'SENSEI_MOVED':
      return { ...state, board: action.board, turn: USER_SYMBOL }
    case 'TIEBREAK_SELECT_COIN':
      return { ...state, coinChoice: action.face }
    case 'TIEBREAK_START_FLIP':
      return { ...state, phase: 'tiebreak-flip' }
    case 'TIEBREAK_RESOLVED':
      return { ...state, phase: 'result', coinResult: action.result, winner: action.userWins ? 'user' : 'sensei', wonByTiebreak: true }
    case 'RESET':
      return initialGameState()
    default:
      return state
  }
}

// Only messages we raise ourselves (SQLSTATE P0001) are meant for people; anything else is backend detail.
function friendlyMessage(err: unknown, fallback: string) {
  const e = err as { code?: string; message?: string } | null
  return e?.code === 'P0001' && e.message ? e.message : fallback
}

export function useSenseiChallenge() {
  const [state, dispatch] = useReducer(reducer, undefined, initialGameState)
  const { playSound } = useDojoAudio()
  const stateRef = useRef(state)
  stateRef.current = state
  // Re-entrancy guards: state updates from a click are not synchronous, so a
  // fast double-click/tap must not fire the same action twice before the
  // resulting phase change disables the control.
  const answering = useRef(false)
  const placing = useRef(false)

  const selectCoin = useCallback((face: CoinFace) => {
    playSound('coin-select')
    dispatch(state.phase === 'tiebreak-select' ? { type: 'TIEBREAK_SELECT_COIN', face } : { type: 'SELECT_COIN', face })
  }, [state.phase, playSound])

  const launchCoin = useCallback(() => {
    if (!stateRef.current.coinChoice) return
    playSound('coin-flip')
    dispatch({ type: 'START_FLIP' })
  }, [playSound])

  // The coin result is computed once, immediately, the instant the flip
  // starts — never re-rolled later. It is stored in state right away (not
  // only once the animation finishes) so the presentation layer can pick the
  // correct pre-recorded toss clip (cara/sello) before playback even starts;
  // the clip is chosen BY the result, so what plays can never disagree with
  // what the game decided.
  useEffect(() => {
    if (state.phase !== 'coin-flip' && state.phase !== 'tiebreak-flip') return
    if (state.coinResult) return
    dispatch({ type: 'FLIP_RESULT_READY', result: flipCoin() })
  }, [state.phase, state.coinResult])

  // Called by the presentation layer once the flip animation has actually
  // finished (the toss video's 'ended' event, or a short fixed timer under
  // reduced motion) — never on a timer owned by this hook, so the state
  // machine stays in sync with whatever is really on screen.
  const resolveFlip = useCallback(() => {
    const { phase, coinResult, coinChoice } = stateRef.current
    if (phase !== 'coin-flip' && phase !== 'tiebreak-flip') return
    if (!coinResult) return
    playSound('coin-land')
    if (phase === 'coin-flip') {
      dispatch({ type: 'COIN_RESOLVED', result: coinResult, userStarts: coinResult === coinChoice })
    } else {
      dispatch({ type: 'TIEBREAK_RESOLVED', result: coinResult, userWins: coinResult === coinChoice })
    }
  }, [playSound])

  // After announcing who starts, move on: either the Sensei opens in the
  // center, or we go straight to the user's first question.
  useEffect(() => {
    if (state.phase !== 'coin-announce') return
    const timer = window.setTimeout(() => {
      if (state.userStarts) {
        dispatch({ type: 'REQUEST_QUESTION' })
      } else {
        const board = Array(9).fill(null) as Board
        board[4] = SENSEI_SYMBOL
        playSound('place-o')
        dispatch({ type: 'SENSEI_OPENED', board })
      }
    }, 1400)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase])

  const fetchQuestion = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('minigame_random_question', { p_exclude: stateRef.current.usedQuestionIds })
      if (error) throw error
      if (!data) {
        dispatch({ type: 'NO_QUESTIONS_LEFT' })
        return
      }
      const order = shuffleIndices((data.options as string[]).length)
      dispatch({ type: 'QUESTION_LOADED', question: data as QuestionContent, order })
    } catch (err) {
      dispatch({ type: 'QUESTION_LOAD_FAILED', message: friendlyMessage(err, 'No se pudo cargar la pregunta. Intenta de nuevo.') })
    }
  }, [])

  useEffect(() => {
    if (state.phase === 'loading-question') void fetchQuestion()
  }, [state.phase, fetchQuestion])

  const answer = useCallback(async (displayIndex: number) => {
    if (answering.current || stateRef.current.phase !== 'question') return
    const q = stateRef.current.currentQuestion
    const order = stateRef.current.shuffledOrder
    if (!q) return
    answering.current = true
    const originalIndex = order[displayIndex]
    try {
      const { data, error } = await supabase.rpc('minigame_check_answer', { p_question_id: q.id, p_answer: originalIndex })
      if (error) throw error
      const correctOriginal = data.correct_index as number
      const correctDisplayIndex = order.indexOf(correctOriginal)
      playSound(data.correct ? 'answer-correct' : 'answer-wrong')
      dispatch({ type: 'ANSWER_RESULT', correct: data.correct, explanation: data.explanation ?? '', correctDisplayIndex })
    } catch (err) {
      dispatch({ type: 'ANSWER_FAILED', message: friendlyMessage(err, 'No se pudo comprobar tu respuesta. Intenta de nuevo.') })
    } finally {
      answering.current = false
    }
  }, [playSound])

  const resolveBoard = useCallback((board: Board): boolean => {
    const { winner, line } = checkWinner(board)
    if (winner) {
      playSound(winner === USER_SYMBOL ? 'game-win' : 'game-lose')
      dispatch({ type: 'BOARD_RESOLVED', winner: winner === USER_SYMBOL ? 'user' : 'sensei', line })
      return true
    }
    if (isDraw(board)) {
      playSound('game-draw')
      dispatch({ type: 'BOARD_RESOLVED', winner: 'draw', line: null })
      return true
    }
    return false
  }, [playSound])

  const chooseCell = useCallback((index: number) => {
    if (placing.current || stateRef.current.phase !== 'placing') return
    const board = stateRef.current.board.slice()
    if (board[index] !== null) return
    placing.current = true
    board[index] = USER_SYMBOL
    playSound('place-x')
    dispatch({ type: 'PLACE_USER', board, index })
    if (!resolveBoard(board)) dispatch({ type: 'SENSEI_THINKING' })
    // The phase leaves 'placing' as soon as PLACE_USER is dispatched, which
    // naturally blocks further clicks on re-render; reset the guard once
    // this tick's synchronous work is done so a *new* turn can place again.
    placing.current = false
  }, [playSound, resolveBoard])

  const continueAfterWrong = useCallback(() => {
    dispatch({ type: 'CONTINUE_AFTER_WRONG' })
  }, [])

  // Single source of the Sensei's move, triggered whenever we enter the
  // "thinking" phase, whether the user placed a piece or lost their turn.
  useEffect(() => {
    if (state.phase !== 'sensei-thinking') return
    const delay = 400 + Math.random() * 400
    const timer = window.setTimeout(() => {
      const board = stateRef.current.board.slice()
      const move = getBestMove(board, SENSEI_SYMBOL)
      if (move !== null) {
        board[move] = SENSEI_SYMBOL
        playSound('place-o')
      }
      dispatch({ type: 'SENSEI_MOVED', board })
      if (!resolveBoard(board)) dispatch({ type: 'CONTINUE_TO_QUESTION' })
    }, delay)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase])

  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])

  return { state, selectCoin, launchCoin, resolveFlip, chooseCell, answer, continueAfterWrong, reset, dispatchEnterPlacing: () => dispatch({ type: 'ENTER_PLACING' }) }
}
