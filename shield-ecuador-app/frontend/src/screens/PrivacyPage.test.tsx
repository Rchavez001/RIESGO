import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrivacyPage } from './PrivacyPage'

jest.mock('../components/CyberBushido', () => ({
  SectionHeader: ({ title }: any) => <h1>{title}</h1>,
  NeonButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
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

// T19.b/REQ-10: formulario de solicitud de derechos (baja y demás) desde la cuenta.
describe('solicitud de derechos (T19.b)', () => {
  test('enviar el formulario muestra el número de caso y la fecha límite, sin enviar ningún campo de IP', async () => {
    mockInvoke.mockImplementation((name: string) => {
      if (name === 'get-consent-notice') return Promise.resolve({ data: NOTICE, error: null })
      if (name === 'request-data-subject-right') {
        return Promise.resolve({ data: { case_number: 'CASO-2026-0042', due_at: '2026-11-04T12:00:00Z' }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })

    await renderReady()
    await userEvent.selectOptions(screen.getByLabelText(/tipo de solicitud/i), 'baja')
    await userEvent.type(screen.getByLabelText(/detalle/i), 'Quiero dar de baja mi cuenta.')
    await userEvent.click(screen.getByRole('button', { name: /enviar solicitud/i }))

    expect(mockInvoke).toHaveBeenCalledWith('request-data-subject-right', {
      body: { request_type: 'baja', details: 'Quiero dar de baja mi cuenta.' },
    })
    const invokedBody = mockInvoke.mock.calls.find((call) => call[0] === 'request-data-subject-right')?.[1]?.body
    expect(invokedBody).not.toHaveProperty('ip')

    expect(await screen.findByText(/CASO-2026-0042/)).toBeInTheDocument()
    expect(screen.getByText(/4 de noviembre de 2026/)).toBeInTheDocument()
    expect(screen.queryByText(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)).not.toBeInTheDocument()
  })

  test('el formulario solo ofrece los 9 tipos válidos y no se puede enviar sin elegir uno', async () => {
    mockInvoke.mockImplementation((name: string) => {
      if (name === 'get-consent-notice') return Promise.resolve({ data: NOTICE, error: null })
      return Promise.resolve({ data: null, error: null })
    })

    await renderReady()
    const select = screen.getByLabelText(/tipo de solicitud/i) as HTMLSelectElement
    const offeredTypes = Array.from(select.options).map((option) => option.value).filter(Boolean)
    expect(offeredTypes).toEqual([
      'baja', 'acceso', 'rectificacion', 'eliminacion', 'oposicion',
      'suspension', 'portabilidad', 'revocacion', 'decision_automatizada',
    ])
    expect(screen.getByRole('button', { name: /enviar solicitud/i })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /enviar solicitud/i }))
    expect(mockInvoke).not.toHaveBeenCalledWith('request-data-subject-right', expect.anything())
  })

  test('un error de cuota se comunica sin tecnicismos', async () => {
    mockInvoke.mockImplementation((name: string) => {
      if (name === 'get-consent-notice') return Promise.resolve({ data: NOTICE, error: null })
      if (name === 'request-data-subject-right') {
        return Promise.resolve({
          data: null,
          error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'rate_limited' }) } },
        })
      }
      return Promise.resolve({ data: null, error: null })
    })

    await renderReady()
    await userEvent.selectOptions(screen.getByLabelText(/tipo de solicitud/i), 'acceso')
    await userEvent.click(screen.getByRole('button', { name: /enviar solicitud/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/espera unos minutos/i)
  })

  test('un error de transporte/configuración se comunica sin tecnicismos', async () => {
    mockInvoke.mockImplementation((name: string) => {
      if (name === 'get-consent-notice') return Promise.resolve({ data: NOTICE, error: null })
      if (name === 'request-data-subject-right') {
        return Promise.resolve({
          data: null,
          error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'settings_unavailable' }) } },
        })
      }
      return Promise.resolve({ data: null, error: null })
    })

    await renderReady()
    await userEvent.selectOptions(screen.getByLabelText(/tipo de solicitud/i), 'acceso')
    await userEvent.click(screen.getByRole('button', { name: /enviar solicitud/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/inténtalo de nuevo en unos minutos/i)
    expect(alert).not.toHaveTextContent(/settings_unavailable|edge function/i)
  })
})
