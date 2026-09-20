import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader, Shield } from 'lucide-react'
import { KanjiBackground, NeonButton, ScanlineOverlay } from '../components/CyberBushido'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { safeLocalPath } from '../lib/safeRedirect'
import { friendlyAuthError } from '../lib/authErrors'
import { useModalA11y } from '../hooks/useModalA11y'

const FALLBACK_BUSINESS_SECTORS = [
  { code: 'comerciante', label: 'Comerciante', industry: 'Comercio y Ventas' },
  { code: 'agricultor', label: 'Agricultor/a', industry: 'Agropecuario y Pesca' },
  { code: 'pescador', label: 'Pescador/a', industry: 'Agropecuario y Pesca' },
  { code: 'otro', label: 'Otro', industry: null },
]

export function RegisterScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading, signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fullName, setFullName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showDataConsent, setShowDataConsent] = useState(false)
  const [businessSectors, setBusinessSectors] = useState(FALLBACK_BUSINESS_SECTORS)
  const redirectPath = safeLocalPath((location.state as { from?: { pathname?: string } } | null)?.from?.pathname)

  React.useEffect(() => {
    // An anonymous guest session is still `user` truthy — it must NOT skip
    // this screen, or "Regístrate gratis" from the guest-gate prompt would
    // bounce straight back to /dashboard (blocked for guests) in a loop.
    if (!authLoading && user && !user.is_anonymous) {
      navigate(redirectPath, { replace: true })
    }
  }, [authLoading, navigate, redirectPath, user])

  React.useEffect(() => {
    async function loadBusinessSectors() {
      const { data, error } = await supabase
        .from('business_sectors')
        .select('code,label,industry')
        .eq('active', true)
        .order('display_order')

      if (!error && data && data.length > 0) {
        setBusinessSectors(data)
      }
    }

    void loadBusinessSectors()
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!businessType) {
      setError('Seleccione el tipo de negocio')
      return
    }
    setShowDataConsent(true)
  }

  async function acceptDataConsent() {
    setError('')
    setShowDataConsent(false)
    setLoading(true)

    try {
      await signUp(email, password, {
        full_name: fullName.trim(),
        business_type: businessType,
        data_processing_authorized: true,
        data_processing_authorized_at: new Date().toISOString(),
      } as any)
      navigate(redirectPath, { replace: true })
    } catch (err: unknown) {
      // secure-register-user answers in Spanish and is meant to be shown as is ("Ya existe una cuenta…");
      // raw Supabase/edge-function text (English, technical) is replaced by a generic message.
      const raw = err instanceof Error ? err.message : ''
      const technical = !raw || /invalid login|not confirmed|failed to send|edge function|fetch|jwt|non-2xx|rate limit/i.test(raw)
      setError(friendlyAuthError(err, technical ? 'No pudimos crear tu cuenta. Inténtalo de nuevo en un momento.' : raw))
    } finally {
      setLoading(false)
    }
  }

  function rejectDataConsent() {
    setShowDataConsent(false)
    navigate('/')
  }

  function dismissDataConsent() {
    setShowDataConsent(false)
  }

  return (
    <ScanlineOverlay>
      <div className="auth-shell cyber-page">
        <KanjiBackground char="門" />
        <div className="auth-card glass-panel">
          <Link className="auth-home-link" to="/">← Volver a ciberDojo</Link>
          <div className="text-center">
            <div className="torii">⛩</div>
            <h1>CIBER DOJO</h1>
          </div>

          <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="reg-name">NOMBRE DEL GUERRERO</label>
                <input id="reg-name" name="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} maxLength={120} placeholder="Nombre completo" autoComplete="name" autoCapitalize="words" enterKeyHint="next" />
              </div>

              <div className="field">
                <label htmlFor="reg-email">CORREO ELECTRÓNICO</label>
                <input id="reg-email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="nombre@empresa.com" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" enterKeyHint="next" />
              </div>

              <div className="field">
                <label htmlFor="reg-password">CONTRASEÑA</label>
                <div className="password-field">
                  <input
                    id="reg-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    maxLength={128}
                    placeholder="********"
                    autoComplete="new-password"
                    aria-describedby="reg-password-hint"
                    enterKeyHint="next"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <small id="reg-password-hint" className="field-hint">Mínimo 8 caracteres.</small>
              </div>

              <div className="field">
                <label htmlFor="reg-business">TIPO DE NEGOCIO</label>
                <select id="reg-business" name="business" value={businessType} onChange={(e) => setBusinessType(e.target.value)} required>
                  <option value="">Seleccione...</option>
                  {groupBusinessSectorsByIndustry(businessSectors).map(([industry, items]) => (
                    industry
                      ? (
                        <optgroup key={industry} label={industry}>
                          {items.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                        </optgroup>
                      )
                      : items.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)
                  ))}
                </select>
              </div>

              <div className="field small">
                <div className="auth-secondary-links">
                  <Link className="link" to="/login">¿Ya tienes cuenta? Inicia sesión</Link>
                </div>
              </div>

              {error && <div className="form-error" role="alert">{error}</div>}

              <NeonButton type="submit" className="auth-submit" disabled={loading}>
                {loading ? <Loader className="animate-spin" size={18} /> : <Shield size={16} />}
                FORJAR CUENTA
              </NeonButton>
          </form>
        </div>

        {showDataConsent && (
          <DataConsentDialog
            onAccept={() => void acceptDataConsent()}
            onReject={rejectDataConsent}
            onDismiss={dismissDataConsent}
          />
        )}
      </div>
    </ScanlineOverlay>
  )
}

function DataConsentDialog({ onAccept, onReject, onDismiss }: { onAccept: () => void; onReject: () => void; onDismiss: () => void }) {
  const card = React.useRef<HTMLDivElement>(null)
  useModalA11y(card, onDismiss, () => document.getElementById('reg-business'))
  return createPortal(
    <div className="consent-modal">
      <div className="consent-backdrop" onClick={onDismiss} />
      <div ref={card} className="consent-card glass-panel" role="dialog" aria-modal="true" aria-labelledby="consent-title" aria-describedby="consent-body" tabIndex={-1}>
        <div className="mono-label">AUTORIZACIÓN DE DATOS PERSONALES</div>
        <h2 id="consent-title">Tratamiento de datos personales</h2>
        <div id="consent-body">
          <p>
            Autorizo el tratamiento de mis datos personales para fines internos de la aplicación,
            incluyendo registro, gestión de usuario, operación del servicio y clasificación estadística
            durante la vigencia de mi uso de la aplicación.
          </p>
          <p>
            Declaro conocer que puedo ejercer mis derechos de acceso, rectificación, actualización,
            eliminación y oposición —derechos ARCO—, así como solicitar la modificación o eliminación
            de mis datos personales, escribiendo al correo: <strong>raulchavezdrouet@gmail.com</strong>.
          </p>
        </div>
        <div className="consent-actions">
          <NeonButton color="cyan" variant="outline" onClick={onReject}>
            No acepto
          </NeonButton>
          <NeonButton color="gold" variant="outline" onClick={onAccept}>
            Acepto y continuar
          </NeonButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function groupBusinessSectorsByIndustry<T extends { industry?: string | null }>(items: T[]): [string | null, T[]][] {
  const groups: [string | null, T[]][] = []

  items.forEach((item) => {
    const industry = item.industry || null
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && lastGroup[0] === industry) {
      lastGroup[1].push(item)
    } else {
      groups.push([industry, [item]])
    }
  })

  return groups
}
