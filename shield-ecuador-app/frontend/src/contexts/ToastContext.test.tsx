import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ToastProvider, useToast } from './ToastContext'

function Harness() {
  const { notify } = useToast()
  return (
    <>
      <button onClick={() => notify('Se guardó tu avance', 'success')}>ok</button>
      <button onClick={() => notify('Sin conexión', 'danger')}>fallo</button>
    </>
  )
}

// framer-motion keeps an exiting element mounted until its (rAF-driven) animation ends, which fake timers cannot
// drive; the behaviour under test is the toast's lifetime, not the animation.
jest.mock('framer-motion', () => {
  const React = require('react')
  const strip = ({ initial, animate, exit, transition, ...rest }: any) => rest
  return {
    AnimatePresence: ({ children }: any) => <>{children}</>,
    motion: { div: React.forwardRef((props: any, ref: any) => <div ref={ref} {...strip(props)} />) },
    useReducedMotion: () => false,
  }
})

const setup = () => render(<ToastProvider><Harness /></ToastProvider>)

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

test('el contenedor anuncia con aria-live y el título lleva tilde', () => {
  setup()
  expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  fireEvent.click(screen.getByText('ok'))
  expect(screen.getByText('Se guardó tu avance')).toBeInTheDocument()
  expect(screen.getByText('ÉXITO')).toBeInTheDocument()
})

test('un aviso de riesgo se anuncia como alerta; los demás no', () => {
  setup()
  fireEvent.click(screen.getByText('fallo'))
  expect(screen.getByRole('alert')).toHaveTextContent('Sin conexión')
  fireEvent.click(screen.getByText('ok'))
  expect(screen.getAllByRole('alert')).toHaveLength(1)
})

test('desaparece solo a los 4,5 s', () => {
  setup()
  fireEvent.click(screen.getByText('ok'))
  act(() => { jest.advanceTimersByTime(4400) })
  expect(screen.getByText('Se guardó tu avance')).toBeInTheDocument()
  act(() => { jest.advanceTimersByTime(200) })
  expect(screen.queryByText('Se guardó tu avance')).not.toBeInTheDocument()
})

test('no desaparece mientras el puntero está encima y reinicia el tiempo al salir', () => {
  setup()
  fireEvent.click(screen.getByText('ok'))
  const toast = screen.getByText('Se guardó tu avance').closest('.cyber-toast') as HTMLElement
  fireEvent.mouseEnter(toast)
  act(() => { jest.advanceTimersByTime(20_000) })
  expect(screen.getByText('Se guardó tu avance')).toBeInTheDocument()
  fireEvent.mouseLeave(toast)
  act(() => { jest.advanceTimersByTime(4600) })
  expect(screen.queryByText('Se guardó tu avance')).not.toBeInTheDocument()
})

test('no desaparece mientras tiene el foco del teclado', () => {
  setup()
  fireEvent.click(screen.getByText('ok'))
  const close = screen.getByRole('button', { name: 'Cerrar notificación' })
  fireEvent.focus(close)
  act(() => { jest.advanceTimersByTime(20_000) })
  expect(screen.getByText('Se guardó tu avance')).toBeInTheDocument()
})

test('el botón Cerrar la quita al instante', () => {
  setup()
  fireEvent.click(screen.getByText('ok'))
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificación' }))
  act(() => { jest.advanceTimersByTime(400) })
  expect(screen.queryByText('Se guardó tu avance')).not.toBeInTheDocument()
})
