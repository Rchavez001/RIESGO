import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'

const mockNavigate = jest.fn()
let mockSearch = ''

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, className }: any) => <a href={to} className={className}>{children}</a>,
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(mockSearch)],
}), { virtual: true })

const mockVerifyOtp = jest.fn()
const mockSetSession = jest.fn()
const mockGetSession = jest.fn()
jest.mock('../lib/supabase', () => ({
  supabase: { auth: { verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a), setSession: (...a: unknown[]) => mockSetSession(...a), getSession: () => mockGetSession() } },
}))

import { AuthCallbackPage } from './AuthCallbackPage'

function visit(search: string, hash = '') {
  mockSearch = search
  window.history.replaceState(null, '', `/auth/callback${search ? '?' + search : ''}${hash}`)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockVerifyOtp.mockResolvedValue({ error: null })
  mockSetSession.mockResolvedValue({ error: null })
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
})

test('a valid token_hash signs in and goes to a safe "next"', async () => {
  visit('token_hash=abc&type=magiclink&next=/dojos')
  render(<AuthCallbackPage />)
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dojos', { replace: true }))
  expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'magiclink' })
})

const BS = String.fromCharCode(92)

test.each(['//evil.com', '/' + BS + 'evil.com', 'https://evil.com'])('a hostile next=%s falls back to /dashboard', async (next) => {
  visit(`token_hash=abc&next=${encodeURIComponent(next)}`)
  render(<AuthCallbackPage />)
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true }))
})

test('an unknown otp type is coerced to "email" instead of being passed to Supabase', async () => {
  visit('token_hash=abc&type=__proto__')
  render(<AuthCallbackPage />)
  await waitFor(() => expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'email' }))
})

test('a recovery link goes to /reset-password', async () => {
  visit('token_hash=abc&type=recovery&next=/dojos')
  render(<AuthCallbackPage />)
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/reset-password', { replace: true }))
})

test('session tokens in the QUERY string are ignored (login-CSRF / session fixation)', async () => {
  visit('access_token=evil&refresh_token=evil')
  render(<AuthCallbackPage />)
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(mockSetSession).not.toHaveBeenCalled()
})

test('session tokens in the fragment are used, and the URL is scrubbed first', async () => {
  visit('', '#access_token=aaa&refresh_token=rrr')
  render(<AuthCallbackPage />)
  await waitFor(() => expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'aaa', refresh_token: 'rrr' }))
  expect(window.location.hash).toBe('')
  expect(window.location.search).toBe('')
})

test('an expired link shows a clear message and a way back to /login', async () => {
  mockVerifyOtp.mockResolvedValue({ error: new Error('Token has expired or is invalid') })
  visit('token_hash=old')
  render(<AuthCallbackPage />)
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(/ya no sirve/i)
  expect(alert).not.toHaveTextContent(/token has expired/i)
  expect(screen.getByRole('link', { name: /volver a ingresar/i })).toHaveAttribute('href', '/login')
  expect(mockNavigate).not.toHaveBeenCalled()
})

test('the single-use token_hash is verified once even if the effect re-runs', async () => {
  visit('token_hash=abc')
  const { rerender } = render(<AuthCallbackPage />)
  rerender(<AuthCallbackPage />)
  await waitFor(() => expect(mockNavigate).toHaveBeenCalled())
  expect(mockVerifyOtp).toHaveBeenCalledTimes(1)
})
