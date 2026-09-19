import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { SenseiVideoModal } from './SenseiVideoModal'

// CRA 5 / Jest 27 no resuelve react-router-dom 7: mismo mock virtual que LoginScreen.test.tsx
jest.mock('react-router-dom', () => ({
  Link: ({ children, to, onClick, className }: any) => <a href={to} onClick={onClick} className={className}>{children}</a>,
}), { virtual: true })

beforeAll(() => {
  // jsdom no implementa reproducción de media
  window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = jest.fn()
})

function setup() {
  const onClose = jest.fn()
  const onTryGuest = jest.fn((e: React.MouseEvent) => e.preventDefault())
  render(<><SenseiVideoModal onClose={onClose} onTryGuest={onTryGuest} /></>)
  return { onClose, onTryGuest }
}

test('es un diálogo modal con nombre accesible y foco en Cerrar', () => {
  setup()
  const dialog = screen.getByRole('dialog', { name: /primer consejo de tu sensei/i })
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(screen.getByRole('button', { name: /cerrar video/i })).toHaveFocus()
})

test('Escape y clic en el fondo cierran; clic dentro no', () => {
  const { onClose } = setup()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('dialog'))
  expect(onClose).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('dialog').parentElement!)
  expect(onClose).toHaveBeenCalledTimes(2)
})

test('bloquea el scroll del body mientras está abierto y lo restaura', () => {
  const { unmount } = render(<><SenseiVideoModal onClose={() => {}} onTryGuest={() => {}} /></>)
  expect(document.body.style.overflow).toBe('hidden')
  unmount()
  expect(document.body.style.overflow).not.toBe('hidden')
})

test('al terminar el video ofrece registrarse, probar sin cuenta y ver de nuevo', () => {
  const { onTryGuest } = setup()
  expect(screen.queryByText(/listo para tu primer dojo/i)).toBeNull()
  fireEvent.ended(document.querySelector('video')!)
  expect(screen.getByText(/listo para tu primer dojo/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /regístrate gratis/i })).toHaveAttribute('href', '/registro')
  fireEvent.click(screen.getByRole('link', { name: /probar sin cuenta/i }))
  expect(onTryGuest).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /ver de nuevo/i }))
  expect(screen.queryByText(/listo para tu primer dojo/i)).toBeNull()
})
