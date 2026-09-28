import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader, Shield } from 'lucide-react'
import { KanjiBackground, NeonButton, ScanlineOverlay } from '../components/CyberBushido'
import { useAuth } from '../contexts/AuthContext'
import type { ConsentSubmission } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { safeLocalPath } from '../lib/safeRedirect'
import { friendlyAuthError } from '../lib/authErrors'

const FALLBACK_BUSINESS_SECTORS = [
  { code: 'comerciante', label: 'Comerciante', industry: 'Comercio y Ventas' },
  { code: 'agricultor', label: 'Agricultor/a', industry: 'Agropecuario y Pesca' },
  { code: 'pescador', label: 'Pescador/a', industry: 'Agropecuario y Pesca' },
  { code: 'otro', label: 'Otro', industry: null },
]

interface ConsentPurpose {
  code: string
  label: string
  description?: string
  required: boolean
  order?: number
}

interface ConsentNotice {
  document_id: string
  version: string
  title: string
  rendered_md: string
  rendered_sha256: string
  settings_version: number
  purposes: ConsentPurpose[]
  privacy_policy_url: string | null
  privacy_email: string
}

// REQ-06: el aviso es lo primero que ve quien se registra — no algo que aparece
// después de llenar el formulario. Aceptar (con la finalidad obligatoria marcada
// y la edad confirmada) lleva al formulario; rechazar devuelve a la portada.
type Step = 'loading' | 'notice_unavailable' | 'consent' | 'minor_blocked' | 'form'

export function RegisterScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading, signUp } = useAuth()
  const [step, setStep] = useState<Step>('loading')
  const [notice, setNotice] = useState<ConsentNotice | null>(null)
  const [decisions, setDecisions] = useState<Record<string, boolean>>({})
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [consentError, setConsentError] = useState('')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fullName, setFullName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
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

  React.useEffect(() => {
    void loadNotice()
  }, [])

  async function loadNotice() {
    setStep('loading')
    const { data, error } = await supabase.functions.invoke('get-consent-notice', { method: 'GET' })
    if (error || !data || data.error) {
      setStep('notice_unavailable')
      return
    }
    setNotice(data as ConsentNotice)
    setDecisions({})
    setAgeConfirmed(false)
    setStep('consent')
  }

  function toggleDecision(code: string) {
    setDecisions((current) => ({ ...current, [code]: !current[code] }))
  }

  function handleConsentContinue() {
    if (!notice) return
    setConsentError('')
    const missingRequired = notice.purposes.find((purpose) => purpose.required && !decisions[purpose.code])
    if (missingRequired) {
      setConsentError(`Debes aceptar "${missingRequired.label}" para continuar.`)
      return
    }
    if (!ageConfirmed) {
      setStep('minor_blocked')
      return
    }
    setStep('form')
  }

  function handleConsentReject() {
    navigate('/')
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!businessType) {
      setError('Seleccione el tipo de negocio')
      return
    }
    if (!notice) return

    setLoading(true)
    try {
      const consentNotice: ConsentSubmission = {
        document_id: notice.document_id,
        rendered_sha256: notice.rendered_sha256,
        settings_version: notice.settings_version,
        decisions: notice.purposes.map((purpose) => ({
          purpose_code: purpose.code,
          decision: decisions[purpose.code] ? 'granted' : 'denied',
        })),
      }

      await signUp(email, password, { full_name: fullName.trim(), business_type: businessType }, consentNotice, ageConfirmed)
      navigate(redirectPath, { replace: true })
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code
      if (code === 'notice_changed') {
        // The published notice changed mid-form: go back to a fresh consent
        // screen instead of showing a dead end.
        setError('')
        await loadNotice()
        return
      }
      if (code === 'RATE_LIMIT_UNAVAILABLE') {
        setError('El registro no está disponible en este momento, intenta en unos minutos')
        return
      }
      // secure-register-user answers in Spanish and is meant to be shown as is ("Ya existe una cuenta…");
      // raw Supabase/edge-function text (English, technical) is replaced by a generic message.
      const raw = err instanceof Error ? err.message : ''
      const technical = !raw || /invalid login|not confirmed|failed to send|edge function|fetch|jwt|non-2xx|rate limit/i.test(raw)
      setError(friendlyAuthError(err, technical ? 'No pudimos crear tu cuenta. Inténtalo de nuevo en un momento.' : raw))
    } finally {
      setLoading(false)
    }
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

          {step === 'loading' && (
            <div className="consent-loading" role="status">
              <Loader className="animate-spin" size={20} /> Cargando aviso de privacidad…
            </div>
          )}

          {step === 'notice_unavailable' && (
            <div className="form-error" role="alert">
              No podemos mostrar el aviso de privacidad en este momento. Inténtalo de nuevo en unos minutos.
            </div>
          )}

          {step === 'consent' && notice && (
            <ConsentStep
              notice={notice}
              decisions={decisions}
              ageConfirmed={ageConfirmed}
              error={consentError}
              onToggleDecision={toggleDecision}
              onToggleAge={() => setAgeConfirmed((value) => !value)}
              onAccept={handleConsentContinue}
              onReject={handleConsentReject}
            />
          )}

          {step === 'minor_blocked' && notice && (
            <div className="consent-minor-blocked">
              <h2>No podemos crear tu cuenta todavía</h2>
              <p>
                Para menores de 15 años, el registro lo debe completar un representante legal.
                Pídele que escriba a <strong>{notice.privacy_email}</strong> para continuar.
              </p>
              <NeonButton color="cyan" variant="outline" onClick={() => setStep('consent')}>
                Volver
              </NeonButton>
            </div>
          )}

          {step === 'form' && (
            <form onSubmit={(e) => void handleFormSubmit(e)}>
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
          )}
        </div>
      </div>
    </ScanlineOverlay>
  )
}

function ConsentStep({
  notice, decisions, ageConfirmed, error, onToggleDecision, onToggleAge, onAccept, onReject,
}: {
  notice: ConsentNotice
  decisions: Record<string, boolean>
  ageConfirmed: boolean
  error: string
  onToggleDecision: (code: string) => void
  onToggleAge: () => void
  onAccept: () => void
  onReject: () => void
}) {
  return (
    <div className="consent-step">
      <div className="mono-label">AVISO DE PRIVACIDAD · v{notice.version}</div>
      <h2>{notice.title}</h2>
      <div className="consent-body">
        {renderPlainParagraphs(notice.rendered_md)}
      </div>
      {notice.privacy_policy_url && (
        <p><a href={notice.privacy_policy_url} target="_blank" rel="noreferrer">Leer la Política de Privacidad completa ↗</a></p>
      )}

      <fieldset className="consent-purposes">
        <legend>¿Para qué autorizas el uso de tus datos?</legend>
        {notice.purposes.map((purpose) => (
          <label key={purpose.code} className="consent-purpose-option">
            <input
              type="checkbox"
              checked={!!decisions[purpose.code]}
              onChange={() => onToggleDecision(purpose.code)}
            />
            <span>
              <strong>{purpose.label}</strong>{purpose.required ? ' (obligatoria)' : ' (opcional)'}
              {purpose.description && <small>{purpose.description}</small>}
            </span>
          </label>
        ))}
      </fieldset>

      <label className="consent-purpose-option">
        <input type="checkbox" checked={ageConfirmed} onChange={onToggleAge} />
        <span>Declaro que tengo 15 años o más.</span>
      </label>

      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="consent-actions">
        <NeonButton color="cyan" variant="outline" onClick={onReject}>
          No acepto
        </NeonButton>
        <NeonButton color="gold" variant="outline" onClick={onAccept}>
          Acepto y continuar
        </NeonButton>
      </div>
    </div>
  )
}

function renderPlainParagraphs(text: string) {
  return text.split(/\n\s*\n/).map((paragraph, index) => (
    <p key={index}>
      {paragraph.split('\n').map((line, lineIndex, lines) => (
        <React.Fragment key={lineIndex}>
          {line}
          {lineIndex < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </p>
  ))
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
