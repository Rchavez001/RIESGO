import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegisterScreen } from './RegisterScreen'

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  Link: ({ children, to, className }: any) => <a href={to} className={className}>{children}</a>,
  useLocation: () => ({ pathname: '/registro', search: '', hash: '', state: null }),
  useNavigate: () => mockNavigate,
}), { virtual: true })

const mockInvoke = jest.fn()
jest.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }),
  },
}))

const mockSignUp = jest.fn()
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false, signUp: mockSignUp }),
}))

const NOTICE = {
  document_id: 'doc-1',
  version: '1.0',
  title: 'Consentimiento informado y privacidad',
  rendered_md: [
    '# Consentimiento informado y privacidad',
    '',
    '**CiberDojo · Información previa al registro**',
    '',
    '## 1. ¿Quién es responsable de tus datos?',
    '',
    'Puedo consultar la [Política de Privacidad completa](https://example.test/politica) antes de decidir.',
  ].join('\n'),
  rendered_sha256: 'abc123',
  settings_version: 1,
  purposes: [
    { code: 'registro_aprendizaje', label: 'Registro y aprendizaje', required: true, order: 1 },
    { code: 'novedades', label: 'Novedades por correo', required: false, order: 2 },
  ],
  privacy_policy_url: 'https://example.test/politica',
  privacy_email: 'privacidad@example.test',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockInvoke.mockResolvedValue({ data: NOTICE, error: null })
})

async function renderOnConsentStep() {
  render(<RegisterScreen />)
  await screen.findByText(/para qué autorizas el uso de tus datos/i)
}

test('el aviso se renderiza como Markdown sanitizado: sin "#"/"**" en crudo y sin duplicar el título', async () => {
  await renderOnConsentStep()

  const headings = screen.getAllByRole('heading', { name: NOTICE.title })
  expect(headings).toHaveLength(1) // el título no se repite dentro del cuerpo del aviso
  expect(screen.getByRole('heading', { name: '1. ¿Quién es responsable de tus datos?' })).toBeInTheDocument()
  expect(screen.getByText('CiberDojo · Información previa al registro').tagName).toBe('STRONG')
  expect(screen.queryByText(/#|\*\*/)).not.toBeInTheDocument()
})

test('el enlace a la Política de Privacidad es visible antes del formulario de registro', async () => {
  await renderOnConsentStep()

  const links = screen.getAllByRole('link', { name: /política de privacidad completa/i })
  expect(links.length).toBeGreaterThan(0)
  links.forEach((link) => expect(link).toHaveAttribute('href', 'https://example.test/politica'))
  expect(screen.queryByLabelText(/nombre del guerrero/i)).not.toBeInTheDocument() // el formulario no existe todavía
})

test('"Acepto y continuar" queda deshabilitado hasta marcar la finalidad obligatoria, con el motivo anunciado', async () => {
  await renderOnConsentStep()

  const accept = screen.getByRole('button', { name: /acepto y continuar/i })
  const hint = screen.getByRole('status')
  expect(accept).toBeDisabled()
  expect(hint).toHaveAttribute('aria-live', 'polite')
  expect(hint).toHaveTextContent(/debes aceptar "registro y aprendizaje" para continuar/i)

  await userEvent.click(screen.getByRole('checkbox', { name: /registro y aprendizaje/i }))

  expect(accept).toBeEnabled()
  expect(hint).toHaveTextContent('')
})

test('"No acepto" vuelve a la portada sin tocar la BD', async () => {
  await renderOnConsentStep()

  await userEvent.click(screen.getByRole('button', { name: /no acepto/i }))

  expect(mockNavigate).toHaveBeenCalledWith('/')
  expect(mockSignUp).not.toHaveBeenCalled()
})

test('sin aviso publicado, se muestra un error en vez de un formulario roto', async () => {
  mockInvoke.mockResolvedValue({ data: { error: 'no publicado' }, error: null })
  render(<RegisterScreen />)

  expect(await screen.findByRole('alert')).toHaveTextContent(/no podemos mostrar el aviso/i)
  expect(screen.queryByLabelText(/nombre del guerrero/i)).not.toBeInTheDocument()
})
