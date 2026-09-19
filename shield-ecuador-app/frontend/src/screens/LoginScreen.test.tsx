import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('react-router-dom', () => ({
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
  Navigate: () => <div>Navigate</div>,
  useLocation: () => ({ pathname: '/login', search: '', state: null }),
  useNavigate: () => jest.fn(),
}), { virtual: true })

jest.mock('../lib/supabase', () => ({
  supabase: { auth: { setSession: jest.fn() } },
}))

const mockSignIn = jest.fn()
const mockSendLoginCode = jest.fn()
const mockVerifyCode = jest.fn()

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signIn: mockSignIn,
    sendLoginCode: mockSendLoginCode,
    verifyCode: mockVerifyCode,
  }),
}))

import { LoginScreen } from './LoginScreen'

beforeEach(() => {
  jest.clearAllMocks()
})

test('a correct password logs in directly, without ever sending a code', async () => {
  mockSignIn.mockResolvedValue(undefined)
  render(<LoginScreen />)

  await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'usuario@empresa.com')
  await userEvent.type(screen.getByLabelText(/^contraseña$/i), 'MiClaveReal1')
  await userEvent.click(screen.getByRole('button', { name: /ingreso/i }))

  await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('usuario@empresa.com', 'MiClaveReal1'))
  expect(mockSendLoginCode).not.toHaveBeenCalled()
  expect(screen.queryByLabelText(/código de 6 dígitos/i)).not.toBeInTheDocument()
})

test('a failed password falls back to emailing a login code instead of just erroring out', async () => {
  mockSignIn.mockRejectedValue(new Error('Invalid login credentials'))
  mockSendLoginCode.mockResolvedValue(undefined)
  render(<LoginScreen />)

  await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'usuario@empresa.com')
  await userEvent.type(screen.getByLabelText(/^contraseña$/i), 'algo-incorrecto')
  await userEvent.click(screen.getByRole('button', { name: /ingreso/i }))

  await waitFor(() => expect(mockSendLoginCode).toHaveBeenCalledWith('usuario@empresa.com'))
  expect(await screen.findByLabelText(/código de 6 dígitos/i)).toBeInTheDocument()
})

test('a non-credentials error (e.g. network) shows a friendly Spanish message, never the raw one, with no code fallback', async () => {
  mockSignIn.mockRejectedValue(new Error('Network request failed'))
  render(<LoginScreen />)

  await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'usuario@empresa.com')
  await userEvent.type(screen.getByLabelText(/^contraseña$/i), 'MiClaveReal1')
  await userEvent.click(screen.getByRole('button', { name: /ingreso/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/no hay conexión con el servidor/i)
  expect(mockSendLoginCode).not.toHaveBeenCalled()
})

test('an unknown e-mail never leaks the "signups not allowed" text', async () => {
  mockSignIn.mockRejectedValue(new Error('Invalid login credentials'))
  mockSendLoginCode.mockRejectedValue(new Error('Signups not allowed for otp'))
  render(<LoginScreen />)

  await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'nadie@empresa.com')
  await userEvent.type(screen.getByLabelText(/^contraseña$/i), 'algo-incorrecto')
  await userEvent.click(screen.getByRole('button', { name: /ingreso/i }))

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(/correo o contraseña incorrectos/i)
  expect(alert).not.toHaveTextContent(/signups/i)
})

test('a rate-limit error is shown as a friendly message', async () => {
  mockSignIn.mockRejectedValue(new Error('Invalid login credentials'))
  mockSendLoginCode.mockRejectedValue(new Error('email rate limit exceeded'))
  render(<LoginScreen />)

  await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'usuario@empresa.com')
  await userEvent.type(screen.getByLabelText(/^contraseña$/i), 'algo-incorrecto')
  await userEvent.click(screen.getByRole('button', { name: /ingreso/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/demasiados intentos/i)
})

test('pasting a code formatted as "123 456" keeps all six digits', async () => {
  mockSignIn.mockRejectedValue(new Error('Invalid login credentials'))
  mockSendLoginCode.mockResolvedValue(undefined)
  render(<LoginScreen />)
  await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'usuario@empresa.com')
  await userEvent.type(screen.getByLabelText(/^contraseña$/i), 'algo-incorrecto')
  await userEvent.click(screen.getByRole('button', { name: /ingreso/i }))

  const code = await screen.findByLabelText(/código de 6 dígitos/i)
  await userEvent.paste(code, '123 456')
  expect(code).toHaveValue('123456')
})
