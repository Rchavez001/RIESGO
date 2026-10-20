import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { GuestNoticeModal } from './GuestNoticeModal'

// CRA 5 / Jest 27 no resuelve react-router-dom 7: mismo mock virtual que LoginScreen.test.tsx
jest.mock('react-router-dom', () => ({
  Link: ({ children, to, onClick, className }: any) => <a href={to} onClick={onClick} className={className}>{children}</a>,
}), { virtual: true })

function setup(loading = false) {
  const onConfirm = jest.fn()
  const onClose = jest.fn()
  render(<GuestNoticeModal onConfirm={onConfirm} onClose={onClose} loading={loading} />)
  return { onConfirm, onClose }
}

test('es un diálogo modal con el texto PROVISIONAL marcado y enlace al aviso completo', () => {
  setup()
  const dialog = screen.getByRole('dialog', { name: /antes de continuar sin cuenta/i })
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(screen.getByText(/pendiente de validación legal/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /leer el aviso completo de privacidad/i })).toHaveAttribute('href', '/privacidad')
})

test('Continuar como invitado llama a onConfirm; Cancelar y Escape llaman a onClose', () => {
  const { onConfirm, onClose } = setup()
  fireEvent.click(screen.getByRole('button', { name: /continuar como invitado/i }))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
  expect(onClose).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(2)
})

test('mientras loading=true, los botones quedan deshabilitados', () => {
  setup(true)
  expect(screen.getByRole('button', { name: /continuar como invitado/i })).toBeDisabled()
  expect(screen.getByRole('button', { name: /cancelar/i })).toBeDisabled()
})

test('bloquea el scroll del body mientras está abierto y lo restaura', () => {
  const { unmount } = render(<GuestNoticeModal onConfirm={() => {}} onClose={() => {}} loading={false} />)
  expect(document.body.style.overflow).toBe('hidden')
  unmount()
  expect(document.body.style.overflow).not.toBe('hidden')
})
