import React from 'react'

type DojoSound = 'tap' | 'strike' | 'success' | 'belt' | 'ad-in' | 'ad-out'
  | 'coin-select' | 'coin-flip' | 'coin-land' | 'place-x' | 'place-o'
  | 'answer-correct' | 'answer-wrong' | 'game-win' | 'game-lose' | 'game-draw'

type DojoAudioContextValue = {
  enabled: boolean
  toggleAudio: () => void
  playSound: (sound: DojoSound) => void
}

const DojoAudioContext = React.createContext<DojoAudioContextValue | null>(null)

export function DojoAudioProvider({ children }: { children: React.ReactNode }) {
  const contextRef = React.useRef<AudioContext | null>(null)
  const [enabled, setEnabled] = React.useState(() => localStorage.getItem('dojo_audio') === 'on')

  React.useEffect(() => {
    localStorage.setItem('dojo_audio', enabled ? 'on' : 'off')
  }, [enabled])

  const ensureContext = React.useCallback(() => {
    const AudioCtor = window.AudioContext || window.webkitAudioContext
    if (!AudioCtor) return null
    if (!contextRef.current) contextRef.current = new AudioCtor()
    if (contextRef.current.state === 'suspended') void contextRef.current.resume()
    return contextRef.current
  }, [])

  const playSound = React.useCallback((sound: DojoSound) => {
    if (!enabled) return
    const audio = ensureContext()
    if (!audio) return

    const now = audio.currentTime
    const gain = audio.createGain()
    gain.connect(audio.destination)

    if (sound === 'tap') {
      playTone(audio, gain, now, 360, 0.045, 0.022, 'triangle')
      playNoise(audio, gain, now, 0.035, 0.012)
      return
    }

    if (sound === 'strike') {
      playTone(audio, gain, now, 120, 0.08, 0.045, 'sawtooth')
      playNoise(audio, gain, now, 0.09, 0.04)
      return
    }

    if (sound === 'success') {
      playTone(audio, gain, now, 392, 0.12, 0.035, 'sine')
      playTone(audio, gain, now + 0.08, 587, 0.16, 0.04, 'sine')
      playTone(audio, gain, now + 0.18, 784, 0.22, 0.035, 'triangle')
      return
    }

    if (sound === 'ad-in') {
      playTone(audio, gain, now, 660, 0.09, 0.03, 'sine')
      playTone(audio, gain, now + 0.06, 990, 0.14, 0.032, 'sine')
      return
    }

    if (sound === 'ad-out') {
      playTone(audio, gain, now, 520, 0.12, 0.026, 'sine')
      playTone(audio, gain, now + 0.05, 300, 0.18, 0.02, 'triangle')
      return
    }

    if (sound === 'coin-select') {
      playTone(audio, gain, now, 500, 0.05, 0.02, 'sine')
      return
    }

    if (sound === 'coin-flip') {
      for (let i = 0; i < 6; i += 1) {
        playTone(audio, gain, now + i * 0.22, 700 - i * 30, 0.05, 0.018, 'triangle')
      }
      return
    }

    if (sound === 'coin-land') {
      playTone(audio, gain, now, 180, 0.14, 0.05, 'sine')
      playNoise(audio, gain, now, 0.1, 0.03)
      return
    }

    if (sound === 'place-x') {
      playTone(audio, gain, now, 300, 0.07, 0.04, 'sawtooth')
      playNoise(audio, gain, now, 0.05, 0.02)
      return
    }

    if (sound === 'place-o') {
      playTone(audio, gain, now, 440, 0.09, 0.035, 'sine')
      return
    }

    if (sound === 'answer-correct') {
      playTone(audio, gain, now, 523, 0.1, 0.035, 'sine')
      playTone(audio, gain, now + 0.09, 659, 0.14, 0.035, 'sine')
      return
    }

    if (sound === 'answer-wrong') {
      playTone(audio, gain, now, 220, 0.16, 0.04, 'sawtooth')
      playTone(audio, gain, now + 0.09, 160, 0.2, 0.032, 'sawtooth')
      return
    }

    if (sound === 'game-win') {
      playTone(audio, gain, now, 392, 0.12, 0.04, 'sine')
      playTone(audio, gain, now + 0.1, 523, 0.14, 0.04, 'sine')
      playTone(audio, gain, now + 0.22, 659, 0.16, 0.04, 'sine')
      playTone(audio, gain, now + 0.36, 784, 0.26, 0.04, 'triangle')
      return
    }

    if (sound === 'game-lose') {
      playTone(audio, gain, now, 300, 0.2, 0.04, 'triangle')
      playTone(audio, gain, now + 0.16, 220, 0.28, 0.035, 'sine')
      return
    }

    if (sound === 'game-draw') {
      playTone(audio, gain, now, 392, 0.1, 0.03, 'sine')
      playTone(audio, gain, now + 0.09, 392, 0.14, 0.03, 'sine')
      return
    }

    playTone(audio, gain, now, 220, 0.18, 0.055, 'triangle')
    playTone(audio, gain, now + 0.1, 440, 0.22, 0.05, 'sine')
    playTone(audio, gain, now + 0.24, 880, 0.28, 0.038, 'sine')
    playNoise(audio, gain, now + 0.02, 0.18, 0.025)
  }, [enabled, ensureContext])

  const toggleAudio = React.useCallback(() => {
    setEnabled((value) => {
      const next = !value
      if (next) {
        const audio = ensureContext()
        if (audio) {
          const gain = audio.createGain()
          gain.connect(audio.destination)
          playTone(audio, gain, audio.currentTime, 528, 0.12, 0.025, 'sine')
        }
      }
      return next
    })
  }, [ensureContext])

  return (
    <DojoAudioContext.Provider value={{ enabled, toggleAudio, playSound }}>
      {children}
    </DojoAudioContext.Provider>
  )
}

export function useDojoAudio() {
  const value = React.useContext(DojoAudioContext)
  if (!value) {
    return {
      enabled: false,
      toggleAudio: () => undefined,
      playSound: () => undefined,
    }
  }
  return value
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

function playTone(
  audio: AudioContext,
  output: GainNode,
  start: number,
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType,
) {
  const oscillator = audio.createOscillator()
  const gain = audio.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.72), start + duration)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + duration * 0.18)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain)
  gain.connect(output)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

function playNoise(audio: AudioContext, output: GainNode, start: number, duration: number, volume: number) {
  const buffer = audio.createBuffer(1, audio.sampleRate * duration, audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / data.length)
  }

  const source = audio.createBufferSource()
  const filter = audio.createBiquadFilter()
  const gain = audio.createGain()
  source.buffer = buffer
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(720, start)
  filter.Q.setValueAtTime(4.2, start)
  gain.gain.setValueAtTime(volume, start)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(output)
  source.start(start)
}
