import React from 'react'
import { render, waitFor } from '@testing-library/react'

const mockSignInWithPassword = jest.fn()
const mockSignInWithOtp = jest.fn()
const mockVerifyOtp = jest.fn()
const mockInvoke = jest.fn()
const mockGetSession = jest.fn().mockResolvedValue({ data: { session: null } })
const mockOnAuthStateChange = jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } })

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
    },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}))

import { AuthProvider, useAuth } from './AuthContext'

// Minimal consumer so we can drive AuthContext's methods through real
// component rendering, matching this project's existing test style
// (App.test.tsx) instead of pulling in a separate renderHook dependency.
function TestConsumer({ onReady }: { onReady: (ctx: ReturnType<typeof useAuth>) => void }) {
  const ctx = useAuth()
  React.useEffect(() => { onReady(ctx) }, [ctx, onReady])
  return null
}

function renderAuth() {
  let ctx: ReturnType<typeof useAuth> | null = null
  render(
    <AuthProvider>
      <TestConsumer onReady={(c) => { ctx = c }} />
    </AuthProvider>
  )
  return () => ctx as ReturnType<typeof useAuth>
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ data: { session: null } })
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } })
})

test('signIn calls signInWithPassword with the given credentials', async () => {
  mockSignInWithPassword.mockResolvedValue({ error: null })

  const getCtx = renderAuth()
  await waitFor(() => expect(getCtx()).toBeTruthy())

  await getCtx().signIn('usuario@empresa.com', 'MiClaveSegura1')

  expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'usuario@empresa.com', password: 'MiClaveSegura1' })
})

test('signIn surfaces invalid credentials as a thrown error', async () => {
  mockSignInWithPassword.mockResolvedValue({ error: new Error('Invalid login credentials') })

  const getCtx = renderAuth()
  await waitFor(() => expect(getCtx()).toBeTruthy())

  await expect(getCtx().signIn('usuario@empresa.com', 'incorrecta')).rejects.toThrow(/invalid login/i)
})

test('signUp sends the real password to secure-register-user, then signs in with it', async () => {
  mockInvoke.mockResolvedValue({ data: { user_id: 'user-1', status: 'created' }, error: null })
  mockSignInWithPassword.mockResolvedValue({ error: null })

  const getCtx = renderAuth()
  await waitFor(() => expect(getCtx()).toBeTruthy())

  const consentNotice = {
    document_id: 'doc-1',
    rendered_sha256: 'abc123',
    settings_version: 1,
    decisions: [{ purpose_code: 'registro_aprendizaje', decision: 'granted' as const }],
  }

  await getCtx().signUp('nuevo@empresa.com', 'MiClaveSegura1', {
    full_name: 'Ana Paredes',
    business_type: 'comerciante',
  }, consentNotice, true)

  expect(mockInvoke).toHaveBeenCalledWith('secure-register-user', {
    body: expect.objectContaining({
      email: 'nuevo@empresa.com',
      password: 'MiClaveSegura1',
      full_name: 'Ana Paredes',
      business_type: 'comerciante',
      consent_notice: consentNotice,
      age_gate: true,
    }),
  })

  expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'nuevo@empresa.com', password: 'MiClaveSegura1' })
})

test('signUp: un 409 notice_changed llega como error con .code y el mensaje legible del servidor', async () => {
  // supabase-js entrega los 4xx como `error` (con la respuesta en context), no en `data`.
  mockInvoke.mockResolvedValue({
    data: null,
    error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'notice_changed', message: 'El aviso cambió.' }) } },
  })

  const getCtx = renderAuth()
  await waitFor(() => expect(getCtx()).toBeTruthy())

  const consent = { document_id: 'doc-1', rendered_sha256: 'abc', settings_version: 1, decisions: [] }
  await expect(getCtx().signUp('nuevo@empresa.com', 'MiClaveSegura1', { full_name: 'Ana', business_type: 'comerciante' }, consent, true))
    .rejects.toMatchObject({ code: 'notice_changed', message: 'El aviso cambió.' })
  expect(mockSignInWithPassword).not.toHaveBeenCalled()
})

test('sendLoginCode never creates a new user (existing-account login only)', async () => {
  mockSignInWithOtp.mockResolvedValue({ error: null })

  const getCtx = renderAuth()
  await waitFor(() => expect(getCtx()).toBeTruthy())

  await getCtx().sendLoginCode('Existente@Empresa.com')

  expect(mockSignInWithOtp).toHaveBeenCalledWith({
    email: 'existente@empresa.com',
    options: { shouldCreateUser: false },
  })
})

test('verifyCode calls verifyOtp with the typed 6-digit code', async () => {
  mockVerifyOtp.mockResolvedValue({ error: null })

  const getCtx = renderAuth()
  await waitFor(() => expect(getCtx()).toBeTruthy())

  await getCtx().verifyCode('usuario@empresa.com', '123456')

  expect(mockVerifyOtp).toHaveBeenCalledWith({
    email: 'usuario@empresa.com',
    token: '123456',
    type: 'email',
  })
})

test('verifyCode surfaces a rejected/expired code as a thrown error', async () => {
  mockVerifyOtp.mockResolvedValue({ error: new Error('Token has expired or is invalid') })

  const getCtx = renderAuth()
  await waitFor(() => expect(getCtx()).toBeTruthy())

  await expect(getCtx().verifyCode('usuario@empresa.com', '000000')).rejects.toThrow(/expired|invalid/i)
})
