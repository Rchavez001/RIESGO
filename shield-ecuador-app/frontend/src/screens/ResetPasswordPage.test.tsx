import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  Link: ({ children, to, className }: any) => <a href={to} className={className}>{children}</a>,
  useNavigate: () => mockNavigate,
}), { virtual: true })

const mockSetSession = jest.fn()
const mockGetSession = jest.fn()
const mockUpdateUser = jest.fn()
const mockSignOut = jest.fn()
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      setSession: (...a: unknown[]) => mockSetSession(...a),
      getSession: () => mockGetSession(),
      updateUser: (...a: unknown[]) => mockUpdateUser(...a),
      signOut: (...a: unknown[]) => mockSignOut(...a),
    },
  },
}))

import { ResetPasswordPage } from './ResetPasswordPage'

function visit(search = '', hash = '') {
  window.history.replaceState(null, '', `/reset-password${search}${hash}`)
}

const realSession = { user: { id: 'u1', is_anonymous: false } }

beforeEach(() => {
  jest.clearAllMocks()
  mockSetSession.mockResolvedValue({ error: null })
  mockGetSession.mockResolvedValue({ data: { session: null } })
  mockUpdateUser.mockResolvedValue({ error: null })
  mockSignOut.mockResolvedValue({ error: null })
  visit()
})

test('with no link and no session it explains the link is useless and offers a way back', async () => {
  render(<ResetPasswordPage />)
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(/ya no sirve/i)
  expect(screen.getByRole('link', { name: /volver a ingresar/i })).toHaveAttribute('href', '/login')
})

test('an anonymous guest session cannot reset a password', async () => {
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'g', is_anonymous: true } } } })
  render(<ResetPasswordPage />)
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.queryByLabelText(/nueva contraseña/i)).toBeNull()
})

test('a recovery session left by /auth/callback shows the form', async () => {
  mockGetSession.mockResolvedValue({ data: { session: realSession } })
  render(<ResetPasswordPage />)
  expect(await screen.findByLabelText(/nueva contraseña/i)).toBeInTheDocument()
})

test('tokens in the QUERY string are ignored (session fixation) and scrubbed from the URL', async () => {
  visit('?access_token=evil&refresh_token=evil')
  render(<ResetPasswordPage />)
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(mockSetSession).not.toHaveBeenCalled()
  expect(window.location.search).toBe('')
})

test('tokens in the fragment are used, and the URL is scrubbed', async () => {
  visit('', '#access_token=aaa&refresh_token=rrr&type=recovery')
  render(<ResetPasswordPage />)
  expect(await screen.findByLabelText(/nueva contraseña/i)).toBeInTheDocument()
  expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'aaa', refresh_token: 'rrr' })
  expect(window.location.hash).toBe('')
})

test('an access_token without refresh_token is not accepted as its own refresh token', async () => {
  visit('', '#access_token=aaa')
  render(<ResetPasswordPage />)
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(mockSetSession).not.toHaveBeenCalled()
})

async function fillAndSubmit(pw: string, again: string) {
  const first = await screen.findByLabelText(/^nueva contraseña$/i)
  await userEvent.type(first, pw)
  await userEvent.type(screen.getByLabelText(/repite la contraseña/i), again)
  await userEvent.click(screen.getByRole('button', { name: /guardar contraseña/i }))
}

test('mismatching passwords never reach Supabase', async () => {
  mockGetSession.mockResolvedValue({ data: { session: realSession } })
  render(<ResetPasswordPage />)
  await fillAndSubmit('ClaveNueva123', 'ClaveNueva124')
  expect(await screen.findByRole('alert')).toHaveTextContent(/no coinciden/i)
  expect(mockUpdateUser).not.toHaveBeenCalled()
})

test('a failed update keeps the form so the user can try again, with a Spanish message', async () => {
  mockGetSession.mockResolvedValue({ data: { session: realSession } })
  mockUpdateUser.mockResolvedValue({ error: new Error('New password should be different from the old password.') })
  render(<ResetPasswordPage />)
  await fillAndSubmit('ClaveNueva123', 'ClaveNueva123')
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(/distinta de la anterior/i)
  expect(alert).not.toHaveTextContent(/should be different/i)
  expect(screen.getByLabelText(/^nueva contraseña$/i)).toBeInTheDocument()
})

test('success updates the password, revokes other sessions and announces it', async () => {
  mockGetSession.mockResolvedValue({ data: { session: realSession } })
  render(<ResetPasswordPage />)
  await fillAndSubmit('ClaveNueva123', 'ClaveNueva123')
  await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'ClaveNueva123' }))
  expect(mockSignOut).toHaveBeenCalledWith({ scope: 'others' })
  expect(await screen.findByRole('status')).toHaveTextContent(/se actualizó/i)
})
