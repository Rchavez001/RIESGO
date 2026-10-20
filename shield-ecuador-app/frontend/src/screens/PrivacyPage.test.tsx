import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrivacyPage } from './PrivacyPage'

jest.mock('../components/CyberBushido', () => ({
  SectionHeader: ({ title }: any) => <h1>{title}</h1>,
}))

const mockInvoke = jest.fn()
const mockConsentSelect = jest.fn()
jest.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    from: (table: string) => ({ select: () => mockConsentSelect(table) }),
  },
}))

const NOTICE = {
  purposes: [
    { code: 'registro_aprendizaje', label: 'Registro y aprendizaje', required: true },
    { code: 'novedades', label: 'Novedades por correo', required: false },
    { code: 'publicidad_personalizada', label: 'Publicidad personalizada', required: false },
    { code: 'estadisticas', label: 'Estadísticas de uso', required: false },
  ],
}

const INITIAL_ROWS = [
  { purpose_code: 'registro_aprendizaje', decision: 'granted', document_version: '1.0', server_ts: '2026-09-15T08:00:00Z' },
  { purpose_code: 'novedades', decision: 'granted', document_version: '1.0', server_ts: '2026-10-01T09:00:00Z' },
  { purpose_code: 'publicidad_personalizada', decision: 'revoked', document_version: '1.0', server_ts: '2026-10-05T11:00:00Z' },
  // estadisticas: sin fila -> "sin decisión"
]

beforeEach(() => {
  jest.clearAllMocks()
  mockInvoke.mockImplementation((name: string) => {
    if (name === 'get-consent-notice') return Promise.resolve({ data: NOTICE, error: null })
    return Promise.resolve({ data: { purpose_code: 'novedades', decision: 'revoked' }, error: null })
  })
  mockConsentSelect.mockResolvedValue({ data: INITIAL_ROWS, error: null })
})

async function renderReady() {
  render(<PrivacyPage />)
  await screen.findByText(/finalidades para las que autorizas/i)
}

test('muestra los tres estados (activa/inactiva/sin decisión) con versión y fecha', async () => {
  await renderReady()

  expect(screen.getByText(/Activa · versión 1\.0 ·.*15 de septiembre de 2026/)).toBeInTheDocument() // registro_aprendizaje
  expect(screen.getByText(/Activa · versión 1\.0 ·.*1 de octubre de 2026/)).toBeInTheDocument() // novedades
  expect(screen.getByText(/Inactiva · versión 1\.0 ·.*5 de octubre de 2026/)).toBeInTheDocument() // publicidad_personalizada
  expect(screen.getByText('Sin decisión')).toBeInTheDocument() // estadisticas
})

test('la finalidad obligatoria nunca expone un control para desactivarla', async () => {
  await renderReady()

  expect(screen.queryByRole('checkbox', { name: /registro y aprendizaje/i })).not.toBeInTheDocument()
  expect(screen.getByText('Registro y aprendizaje')).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /novedades por correo/i })).toBeInTheDocument()
})

test('clic en una finalidad opcional llama a update-my-consent con la acción correcta y refresca el estado real', async () => {
  const REVOKED_NOVEDADES_ROWS = INITIAL_ROWS.map((row) =>
    row.purpose_code === 'novedades'
      ? { ...row, decision: 'revoked', server_ts: '2026-10-19T12:00:00Z' }
      : row,
  )
  mockConsentSelect
    .mockResolvedValueOnce({ data: INITIAL_ROWS, error: null })
    .mockResolvedValueOnce({ data: REVOKED_NOVEDADES_ROWS, error: null })

  await renderReady()
  const checkbox = screen.getByRole('checkbox', { name: /novedades por correo/i })
  expect(checkbox).toBeChecked()

  await userEvent.click(checkbox)

  expect(mockInvoke).toHaveBeenCalledWith('update-my-consent', { body: { purpose_code: 'novedades', action: 'revoke' } })
  await waitFor(() => expect(checkbox).not.toBeChecked())
  expect(mockConsentSelect).toHaveBeenCalledTimes(2)
})

test('un fallo del backend al actualizar no cambia el estado mostrado y avisa sin tecnicismos', async () => {
  mockInvoke.mockImplementation((name: string) => {
    if (name === 'get-consent-notice') return Promise.resolve({ data: NOTICE, error: null })
    return Promise.resolve({ data: null, error: { message: 'Edge Function returned a non-2xx status code' } })
  })

  await renderReady()
  const checkbox = screen.getByRole('checkbox', { name: /novedades por correo/i })
  expect(checkbox).toBeChecked()

  await userEvent.click(checkbox)

  expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos actualizar esa opción/i)
  expect(checkbox).toBeChecked() // sin cambios: el estado mostrado viene solo de una lectura confirmada
  expect(mockConsentSelect).toHaveBeenCalledTimes(1) // no se refresca tras un fallo
})

test('sin aviso disponible, se muestra un error en vez de datos a medias', async () => {
  mockInvoke.mockImplementation((name: string) => {
    if (name === 'get-consent-notice') return Promise.resolve({ data: { error: 'no publicado' }, error: null })
    return Promise.resolve({ data: null, error: null })
  })

  render(<PrivacyPage />)

  expect(await screen.findByRole('alert')).toHaveTextContent(/no podemos mostrar tu información de privacidad/i)
})
