import React from 'react'

type DojoSound = 'tap' | 'strike' | 'success' | 'belt' | 'ad-in' | 'ad-out'

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
