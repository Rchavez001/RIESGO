import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReconsentGate } from './ReconsentGate'

// CyberBushido.tsx pulls in react-router-dom transitively, which react-scripts' Jest runner
// can't resolve in this repo (see RegisterScreen.test.tsx/PrivacyPage.test.tsx for the same
// workaround); stub it instead of mocking react-router-dom, since this component never routes.
jest.mock('./CyberBushido', () => ({
  NeonButton: ({ children, describedBy, ...props }: any) => (
    <button {...props} aria-describedby={describedBy}>{children}</button>
  ),
}))

const mockInvoke = jest.fn()
const mockConsentSelect = jest.fn()
jest.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    from: (table: string) => ({ select: () => mockConsentSelect(table) }),
  },
}))

const mockSignOut = jest.fn()
let mockUser: { id: string; is_anonymous?: boolean } | null = { id: 'u1', is_anonymous: false }
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, signOut: mockSignOut }),
}))

const NOTICE_V1 = {
  document_id: 'doc-1',
  version: '1.0',
  title: 'Aviso de privacidad',
  rendered_md: '# Aviso de privacidad\n\nTexto del aviso.',
  rendered_sha256: 'sha-1',
  settings_version: 1,
  requires_reconsent: false,
  purposes: [
    { code: 'registro_aprendizaje', label: 'Registro y aprendizaje', required: true },
    { code: 'novedades', label: 'Novedades por correo', required: false },
  ],
}

const NOTICE_V1_1_RECONSENT = { ...NOTICE_V1, version: '1.1', requires_reconsent: true }

const ROWS_CURRENT_V1_1 = [
  { purpose_code: 'registro_aprendizaje', decision: 'granted', document_version: '1.1' },
  { purpose_code: 'novedades', decision: 'granted', document_version: '1.1' },
]

const ROWS_STALE_V1 = [
  { purpose_code: 'registro_aprendizaje', decision: 'granted', document_version: '1.0' },
  { purpose_code: 'novedades', decision: 'granted', document_version: '1.0' },
]

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = { id: 'u1', is_anonymous: false }
})

test('sin requires_reconsent, pasa directo al contenido sin mostrar ningún aviso', async () => {
  mockInvoke.mockResolvedValue({ data: NOTICE_V1, error: null })
  mockConsentSelect.mockResolvedValue({ data: ROWS_CURRENT_V1_1, error: null })

  render(<ReconsentGate><p>Contenido protegido</p></ReconsentGate>)

  expect(await screen.findByText('Contenido protegido')).toBeInTheDocument()
  expect(screen.queryByText(/aviso de privacidad actualizado/i)).not.toBeInTheDocument()
})

test('con requires_reconsent pero evidencia ya en la versión vigente, pasa directo al contenido', async () => {
  mockInvoke.mockResolvedValue({ data: NOTICE_V1_1_RECONSENT, error: null })
  mockConsentSelect.mockResolvedValue({ data: ROWS_CURRENT_V1_1, error: null })

  render(<ReconsentGate><p>Contenido protegido</p></ReconsentGate>)

  expect(await screen.findByText('Contenido protegido')).toBeInTheDocument()
})

test('requires_reconsent=true con evidencia de una versión anterior: muestra el aviso y bloquea el contenido', async () => {
  mockInvoke.mockResolvedValue({ data: NOTICE_V1_1_RECONSENT, error: null })
  mockConsentSelect.mockResolvedValue({ data: ROWS_STALE_V1, error: null })

  render(<ReconsentGate><p>Contenido protegido</p></ReconsentGate>)

  expect(await screen.findByText(/aviso de privacidad actualizado/i)).toBeInTheDocument()
  expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
  // Opcional ya otorgada antes: se preserva marcada, no se resetea a desmarcada.
  expect(screen.getByRole('checkbox', { name: /novedades por correo/i })).toBeChecked()
})

test('un invitado (sesión anónima) nunca dispara la comprobación de reconsentimiento', async () => {
  mockUser = { id: 'guest-1', is_anonymous: true }

  render(<ReconsentGate><p>Contenido protegido</p></ReconsentGate>)

  expect(await screen.findByText('Contenido protegido')).toBeInTheDocument()
  expect(mockInvoke).not.toHaveBeenCalled()
  expect(mockConsentSelect).not.toHaveBeenCalled()
})

test('aceptar llama a submit-consent con las decisiones y muestra el contenido tras el éxito', async () => {
  mockInvoke.mockImplementation((name: string) => {
    if (name === 'get-consent-notice') return Promise.resolve({ data: NOTICE_V1_1_RECONSENT, error: null })
    if (name === 'submit-consent') return Promise.resolve({ data: { document_id: 'doc-1', version: '1.1' }, error: null })
    return Promise.resolve({ data: null, error: null })
  })
  mockConsentSelect.mockResolvedValue({ data: ROWS_STALE_V1, error: null })

  render(<ReconsentGate><p>Contenido protegido</p></ReconsentGate>)
  await screen.findByText(/aviso de privacidad actualizado/i)

  await userEvent.click(screen.getByRole('button', { name: /acepto y continúo/i }))

  expect(mockInvoke).toHaveBeenCalledWith('submit-consent', {
    body: {
      document_id: 'doc-1',
      rendered_sha256: 'sha-1',
      settings_version: 1,
      decisions: [
        { purpose_code: 'registro_aprendizaje', decision: 'granted' },
        { purpose_code: 'novedades', decision: 'granted' },
      ],
    },
  })
  expect(await screen.findByText('Contenido protegido')).toBeInTheDocument()
})

test('"Acepto y continúo" está deshabilitado mientras la finalidad obligatoria esté desmarcada', async () => {
  mockInvoke.mockResolvedValue({ data: NOTICE_V1_1_RECONSENT, error: null })
  mockConsentSelect.mockResolvedValue({ data: ROWS_STALE_V1, error: null })

  render(<ReconsentGate><p>Contenido protegido</p></ReconsentGate>)
  await screen.findByText(/aviso de privacidad actualizado/i)

  await userEvent.click(screen.getByRole('checkbox', { name: /registro y aprendizaje/i }))

  expect(screen.getByRole('button', { name: /acepto y continúo/i })).toBeDisabled()
  expect(screen.getByText(/debes aceptar "registro y aprendizaje"/i)).toBeInTheDocument()
})

test('rechazar la finalidad obligatoria bloquea el contenido y solo ofrece baja o cerrar sesión', async () => {
  mockInvoke.mockResolvedValue({ data: NOTICE_V1_1_RECONSENT, error: null })
  mockConsentSelect.mockResolvedValue({ data: ROWS_STALE_V1, error: null })

  render(<ReconsentGate><p>Contenido protegido</p></ReconsentGate>)
  await screen.findByText(/aviso de privacidad actualizado/i)

  await userEvent.click(screen.getByRole('button', { name: /no acepto/i }))

  expect(await screen.findByText(/no puedes continuar sin aceptar el aviso/i)).toBeInTheDocument()
  expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /solicitar baja de mi cuenta/i })).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }))
  expect(mockSignOut).toHaveBeenCalledTimes(1)
})

test('en el bloqueo, solicitar la baja llama a request-data-subject-right y muestra el número de caso', async () => {
  mockInvoke.mockImplementation((name: string) => {
    if (name === 'get-consent-notice') return Promise.resolve({ data: NOTICE_V1_1_RECONSENT, error: null })
    if (name === 'request-data-subject-right') {
      return Promise.resolve({ data: { case_number: 'CASO-2026-0099', due_at: '2026-11-10T12:00:00Z' }, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  })
  mockConsentSelect.mockResolvedValue({ data: ROWS_STALE_V1, error: null })

  render(<ReconsentGate><p>Contenido protegido</p></ReconsentGate>)
  await screen.findByText(/aviso de privacidad actualizado/i)
  await userEvent.click(screen.getByRole('button', { name: /no acepto/i }))
  await screen.findByText(/no puedes continuar sin aceptar el aviso/i)

  await userEvent.click(screen.getByRole('button', { name: /solicitar baja de mi cuenta/i }))

  expect(mockInvoke).toHaveBeenCalledWith('request-data-subject-right', { body: { request_type: 'baja' } })
  expect(await screen.findByText(/CASO-2026-0099/)).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('button', { name: /solicitar baja de mi cuenta/i })).not.toBeInTheDocument())
})
