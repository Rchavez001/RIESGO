import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { SENSEI_IMAGE_SRC, NeonButton } from './CyberBushido'
import { useDojoAudio } from '../contexts/DojoAudioContext'
import { useSenseiChallenge } from './useSenseiChallenge'
import './senseiChallenge.css'

const LINE_STYLE: Record<string, React.CSSProperties> = {
  '0,1,2': { top: '16.5%', left: '4%', width: '92%', transform: 'translateY(-50%)' },
  '3,4,5': { top: '50%', left: '4%', width: '92%', transform: 'translateY(-50%)' },
  '6,7,8': { top: '83.5%', left: '4%', width: '92%', transform: 'translateY(-50%)' },
  '0,3,6': { top: '4%', left: '16.5%', height: '92%', width: '4px', transform: 'translateX(-50%)' },
  '1,4,7': { top: '4%', left: '50%', height: '92%', width: '4px', transform: 'translateX(-50%)' },
  '2,5,8': { top: '4%', left: '83.5%', height: '92%', width: '4px', transform: 'translateX(-50%)' },
  '0,4,8': { top: '50%', left: '50%', width: '128%', height: '4px', transform: 'translate(-50%,-50%) rotate(45deg)' },
  '2,4,6': { top: '50%', left: '50%', width: '128%', height: '4px', transform: 'translate(-50%,-50%) rotate(-45deg)' },
}

export function SenseiChallengeModal({ onClose }: { onClose: () => void }) {
  const { state, selectCoin, launchCoin, resolveFlip, chooseCell, answer, continueAfterWrong, reset, dispatchEnterPlacing } = useSenseiChallenge()
  const { enabled: soundOn, toggleAudio } = useDojoAudio()
  const dialogRef = useRef<HTMLDivElement>(null)
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const el = dialogRef.current
    const focusable = el?.querySelector<HTMLElement>('button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    focusable?.focus()
  }, [state.phase])

  function requestClose() {
    const inProgress = state.phase !== 'coin-select' && state.phase !== 'result' && state.phase !== 'no-questions' && state.phase !== 'error'
    if (inProgress && !window.confirm('¿Salir del desafío? Perderás el progreso de esta partida.')) return
    onClose()
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); requestClose() }
    if (event.key !== 'Tab') return
    const el = dialogRef.current
    if (!el) return
    const items = Array.from(el.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, [tabindex]:not([tabindex="-1"])'))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  const isTiebreak = state.phase === 'tiebreak-select' || state.phase === 'tiebreak-flip' || state.phase === 'tiebreak-announce'
  const boardLocked = state.phase !== 'placing'

  return createPortal(
    <div className="sensei-challenge-overlay" role="presentation" onKeyDown={handleKeyDown}>
      <button className="sensei-challenge-backdrop" aria-label="Cerrar desafío" onClick={requestClose} />
      <motion.div
        ref={dialogRef}
        className="sensei-challenge-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Desafiando al Sensei"
        initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <header className="sensei-challenge-header">
          <h2>Desafiando al Sensei</h2>
          <div className="sensei-challenge-header-actions">
            <button className="sensei-challenge-mute" onClick={toggleAudio} aria-pressed={soundOn} aria-label={soundOn ? 'Silenciar sonido' : 'Activar sonido'}>
              {soundOn ? '🔊' : '🔇'}
            </button>
            <button className="sensei-challenge-close" onClick={requestClose} aria-label="Cerrar">✕</button>
          </div>
        </header>

        {state.phase === 'coin-select' && (
          <p className="sensei-challenge-intro">
            Responde, coloca tu X y desafía al Sensei. Si fallas, pierdes tu turno. Si empatan, la moneda decide.
          </p>
        )}

        {(state.phase === 'coin-select' || state.phase === 'coin-flip' || state.phase === 'coin-announce'
          || state.phase === 'tiebreak-select' || state.phase === 'tiebreak-flip' || state.phase === 'tiebreak-announce') && (
          <CoinStage
            phase={state.phase}
            isTiebreak={isTiebreak}
            choice={state.coinChoice}
            result={state.coinResult}
            userStarts={state.userStarts}
            wonByTiebreak={state.wonByTiebreak}
            reduceMotion={reduceMotion}
            onSelect={selectCoin}
            onLaunch={launchCoin}
            onFlipEnded={resolveFlip}
          />
        )}

        {state.phase === 'sensei-opening' && <p className="sensei-thinking-line">El Sensei abre la partida en el centro…</p>}

        {(state.phase === 'loading-question' || state.phase === 'question' || state.phase === 'answered-correct' || state.phase === 'answered-wrong'
          || state.phase === 'placing' || state.phase === 'sensei-thinking') && (
          <div className="sensei-challenge-play-layout">
            <QuestionPanel state={state} onAnswer={answer} onContinueAfterWrong={continueAfterWrong} onEnterPlacing={dispatchEnterPlacing} />
            <Board board={state.board} locked={boardLocked} winLine={state.winLine} onCell={chooseCell} />
          </div>
        )}

        {state.phase === 'no-questions' && (
          <div className="sensei-challenge-status">
            <p>Se agotaron las preguntas disponibles para tu cinturón en esta partida.</p>
            <NeonButton color="gold" onClick={reset}>Reiniciar desafío</NeonButton>
          </div>
        )}

        {state.phase === 'error' && (
          <div className="sensei-challenge-status">
            <p role="alert">{state.errorMessage}</p>
            <NeonButton color="cyan" onClick={() => window.location.reload()}>Reintentar</NeonButton>
          </div>
        )}

        {state.phase === 'result' && (
          <ResultPanel state={state} onRetry={reset} onExit={onClose} />
        )}
      </motion.div>
    </div>,
    document.body
  )
}

const COIN_VIDEO_SRC: Record<'cara' | 'sello', string> = {
  cara: '/videos/volado_1usd_cara_calidad_videojuego.webm',
  sello: '/videos/volado_1usd_sello_calidad_videojuego.webm',
}

// Real, cropped photographs of the same physical dollar coin used in the
// toss footage (its resting frame, keyed to transparency) — not a CSS
// illustration — so the pre-flip preview reads as an actual coin.
const COIN_PHOTO_SRC: Record<'cara' | 'sello', string> = {
  cara: '/videos/cara-moneda.webp',
  sello: '/videos/sello-moneda.webp',
}

function CoinStage({ phase, isTiebreak, choice, result, userStarts, wonByTiebreak, reduceMotion, onSelect, onLaunch, onFlipEnded }: {
  phase: string; isTiebreak: boolean; choice: string | null; result: string | null; userStarts: boolean | null
  wonByTiebreak: boolean; reduceMotion: boolean
  onSelect: (face: 'cara' | 'sello') => void; onLaunch: () => void; onFlipEnded: () => void
}) {
  const flipping = phase === 'coin-flip' || phase === 'tiebreak-flip'
  const announcing = phase === 'coin-announce' || phase === 'tiebreak-announce'
  const videoRef = useRef<HTMLVideoElement>(null)
  // Real footage of the coin only plays with full motion; reduced motion
  // never autoplays it and instead snaps straight to the final, already
  // computed face. Both paths call onFlipEnded — the single place that
  // advances the state machine — so it never depends on which one ran.
  const showVideo = (flipping || announcing) && !!result && !reduceMotion
  // Before the result is known, preview whichever face the user has (or
  // would by default) selected, so tapping Cara/Sello visibly swaps the coin.
  const stillFace = (result ?? choice ?? 'cara') as 'cara' | 'sello'

  useEffect(() => {
    if (!flipping || !result || !reduceMotion) return
    const timer = window.setTimeout(onFlipEnded, 320)
    return () => window.clearTimeout(timer)
  }, [flipping, result, reduceMotion, onFlipEnded])

  useEffect(() => {
    if (!flipping || !result || reduceMotion) return
    const video = videoRef.current
    if (!video) return
    video.currentTime = 0
    video.play().catch(() => onFlipEnded())
  }, [flipping, result, reduceMotion, onFlipEnded])

  return (
    <div className="coin-stage">
      {isTiebreak && phase === 'tiebreak-select' && (
        <p className="sensei-challenge-intro">¡Has igualado al Sensei! La moneda decidirá el desafío.</p>
      )}
      <div className="coin-3d-wrap">
        {showVideo ? (
          <div className="coin-toss-video-frame">
            <video
              ref={videoRef}
              key={result}
              className="coin-toss-video"
              src={COIN_VIDEO_SRC[result as 'cara' | 'sello']}
              muted
              playsInline
              preload="auto"
              aria-hidden="true"
              onEnded={onFlipEnded}
              onError={onFlipEnded}
            />
          </div>
        ) : (
          <motion.div
            className="coin-toss-video-frame"
            animate={reduceMotion ? undefined : { y: [0, -7, 0], rotate: [0, -2, 2, 0] }}
            transition={reduceMotion ? undefined : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <img key={stillFace} src={COIN_PHOTO_SRC[stillFace]} alt="" className="coin-still-photo" />
          </motion.div>
        )}
      </div>

      {(phase === 'coin-select' || phase === 'tiebreak-select') && (
        <>
          <p className="coin-instruction">Elige cara o sello para comenzar</p>
          <div className="coin-choice-row" role="group" aria-label="Elige cara o sello">
            <button className={`coin-choice-btn ${choice === 'cara' ? 'active' : ''}`} aria-pressed={choice === 'cara'} onClick={() => onSelect('cara')}>Cara</button>
            <button className={`coin-choice-btn ${choice === 'sello' ? 'active' : ''}`} aria-pressed={choice === 'sello'} onClick={() => onSelect('sello')}>Sello</button>
          </div>
          <NeonButton color="red" disabled={!choice} onClick={onLaunch}>▶ Lanzar moneda</NeonButton>
        </>
      )}

      {flipping && <p className="sensei-thinking-line" role="status">Lanzando la moneda…</p>}

      {announcing && (
        <p className="coin-announce-line" role="status">
          Salió <strong>{result === 'cara' ? 'CARA' : 'SELLO'}</strong>.{' '}
          {isTiebreak
            ? (wonByTiebreak ? '' : '')
            : (userStarts ? 'Tú empiezas.' : 'Empieza el Sensei.')}
        </p>
      )}
    </div>
  )
}

function Board({ board, locked, winLine, onCell }: { board: (string | null)[]; locked: boolean; winLine: number[] | null; onCell: (i: number) => void }) {
  const winKey = winLine ? winLine.join(',') : null
  return (
    <div className="sensei-board-wrap">
      <div className="sensei-board" role="grid" aria-label="Tablero de tres en raya">
        {board.map((cell, index) => (
          <button
            key={index}
            role="gridcell"
            className={`sensei-cell ${cell ? `filled-${cell.toLowerCase()}` : ''}`}
            disabled={locked || cell !== null}
            aria-label={cell ? `Casilla ${index + 1}: ${cell === 'X' ? 'tu ficha' : 'ficha del Sensei'}` : `Casilla ${index + 1}, vacía`}
            onClick={() => onCell(index)}
          >
            {cell === 'X' && <span className="piece piece-x">X</span>}
            {cell === 'O' && <span className="piece piece-o">O</span>}
          </button>
        ))}
        {winKey && LINE_STYLE[winKey] && (
          <motion.div className="win-line" style={LINE_STYLE[winKey]} initial={{ scaleX: 0, scaleY: 0 }} animate={{ scaleX: 1, scaleY: 1 }} transition={{ duration: 0.4 }} />
        )}
      </div>
    </div>
  )
}

function QuestionPanel({ state, onAnswer, onContinueAfterWrong, onEnterPlacing }: {
  state: ReturnType<typeof useSenseiChallenge>['state']
  onAnswer: (i: number) => void
  onContinueAfterWrong: () => void
  onEnterPlacing: () => void
}) {
  if (state.phase === 'loading-question') {
    return <div className="sensei-question-panel"><p role="status">Preparando tu pregunta…</p></div>
  }
  if (state.phase === 'sensei-thinking') {
    return <div className="sensei-question-panel"><img src={SENSEI_IMAGE_SRC} alt="" className="sensei-thinking-portrait" /><p className="sensei-thinking-line" role="status">El Sensei está pensando…</p></div>
  }
  if (state.phase === 'placing') {
    return <div className="sensei-question-panel"><p className="sensei-answer-feedback ok" role="status"><strong>✓ ¡Correcto!</strong></p><p>Elige una casilla vacía en el tablero para colocar tu X.</p></div>
  }
  const q = state.currentQuestion
  if (!q) return null
  const displayed = state.shuffledOrder.map((originalIndex) => q.options[originalIndex])
  const answered = state.phase === 'answered-correct' || state.phase === 'answered-wrong'

  return (
    <div className="sensei-question-panel">
      <p className="sensei-question-prompt">{q.prompt}</p>
      <div className="sensei-question-options">
        {displayed.map((option, i) => {
          const isCorrect = answered && i === state.lastCorrectDisplayIndex
          return (
            <button
              key={i}
              className={`sensei-option-btn ${isCorrect ? 'correct' : ''}`}
              disabled={answered}
              aria-disabled={answered}
              onClick={() => !answered && onAnswer(i)}
            >
              <span className="option-letter">{'ABCD'[i]}</span> {option}
              {isCorrect && <span className="option-tag">✓ Correcta</span>}
            </button>
          )
        })}
      </div>
      {answered && (
        <div className={`sensei-answer-feedback ${state.lastAnswerCorrect ? 'ok' : 'no'}`} role="status">
          <p><strong>{state.lastAnswerCorrect ? '✓ ¡Correcto!' : '✕ Esta vez cedes tu turno al Sensei'}</strong></p>
          <p>{state.lastAnswerExplanation}</p>
          {state.lastAnswerCorrect
            ? <NeonButton color="gold" onClick={onEnterPlacing}>Elegir casilla</NeonButton>
            : <NeonButton color="cyan" onClick={onContinueAfterWrong}>Continuar</NeonButton>}
        </div>
      )}
    </div>
  )
}

function ResultPanel({ state, onRetry, onExit }: { state: ReturnType<typeof useSenseiChallenge>['state']; onRetry: () => void; onExit: () => void }) {
  const [showBoard, setShowBoard] = useState(false)
  const won = state.winner === 'user'
  const lastWrong = state.wrongAnswers[state.wrongAnswers.length - 1]
  return (
    <div className="sensei-result-panel">
      <img src={SENSEI_IMAGE_SRC} alt="" className="sensei-result-portrait" />
      <h3>{won ? '¡Desafío superado!' : 'Cada intento fortalece tu defensa digital'}</h3>
      {state.wonByTiebreak && <p className="sensei-tiebreak-tag">{won ? 'Igualaste al Sensei y ganaste el desempate' : 'La moneda del desempate favoreció al Sensei'}</p>}
      {!won && (lastWrong
        ? <p className="sensei-advice">Consejo: {lastWrong.explanation}</p>
        : <p className="sensei-advice">No fallaste ninguna pregunta — el resultado del juego no invalida lo que sabes.</p>)}
      <p className="sensei-stats">Preguntas respondidas: {state.questionsAnswered} · Aciertos: {state.questionsCorrect} · Errores: {state.questionsAnswered - state.questionsCorrect}</p>

      <NeonButton color="cyan" variant="ghost" onClick={() => setShowBoard((v) => !v)} aria-expanded={showBoard}>
        {showBoard ? 'Ocultar tablero' : 'Ver tablero final'}
      </NeonButton>
      {showBoard && <Board board={state.board} locked winLine={state.winLine} onCell={() => {}} />}

      <div className="sensei-result-actions">
        <NeonButton color="gold" onClick={onRetry}>Volver a desafiar</NeonButton>
        <NeonButton color="cyan" variant="ghost" onClick={onExit}>Salir</NeonButton>
      </div>
    </div>
  )
}
