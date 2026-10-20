import React, { useCallback, useEffect, useState } from 'react'
import { Loader } from 'lucide-react'
import { NeonButton, SectionHeader } from '../components/CyberBushido'
import { supabase } from '../lib/supabase'
import { getSupabaseFunctionError } from '../lib/supabaseFunctionError'

interface ConsentPurpose {
  code: string
  label: string
  description?: string
  required: boolean
}

interface ConsentState {
  decision: 'granted' | 'denied' | 'revoked'
  document_version: string
  server_ts: string
}

type Status = 'loading' | 'ready' | 'unavailable'

// T19.b/REQ-10: mismos 9 valores que `REQUEST_TYPES` en
// supabase/functions/request-data-subject-right/handler.ts (no se puede importar: ese
// archivo corre en Deno, este bundle en el navegador) y mismas etiquetas que
// `REQUEST_TYPE_LABELS` en supabase/functions/_shared/email/templates.ts (duplicado por el
// mismo motivo, no por error).
const REQUEST_TYPE_LABELS: Record<string, string> = {
  baja: 'Baja de la cuenta',
  acceso: 'Acceso a mis datos personales',
  rectificacion: 'Rectificación de datos',
  eliminacion: 'Eliminación de datos',
  oposicion: 'Oposición al tratamiento',
  suspension: 'Suspensión del tratamiento',
  portabilidad: 'Portabilidad de mis datos',
  revocacion: 'Revocación del consentimiento',
  decision_automatizada: 'Revisión de una decisión automatizada',
}
const REQUEST_TYPES = Object.keys(REQUEST_TYPE_LABELS)

type DsrStatus = 'idle' | 'sending' | 'sent' | 'error'

// REQ-08: "Mi privacidad" shows the current status per purpose (granted/inactive/no decision yet,
// with version and date) and lets the user grant/revoke OPTIONAL purposes with one click — no
// "save" step, no justification required. The required purpose (registro_aprendizaje) is read-only
// here: withdrawing it means closing the account (T19.b), not an action on this screen.
export function PrivacyPage() {
  const [status, setStatus] = useState<Status>('loading')
  const [purposes, setPurposes] = useState<ConsentPurpose[]>([])
  const [consentByCode, setConsentByCode] = useState<Record<string, ConsentState>>({})
  const [savingCode, setSavingCode] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [requestType, setRequestType] = useState('')
  const [requestDetails, setRequestDetails] = useState('')
  const [dsrStatus, setDsrStatus] = useState<DsrStatus>('idle')
  const [dsrError, setDsrError] = useState('')
  const [dsrResult, setDsrResult] = useState<{ case_number: string; due_at: string } | null>(null)

  const loadConsentState = useCallback(async () => {
    const { data, error: stateError } = await supabase
      .from('my_consent_state')
      .select('purpose_code, decision, document_version, server_ts')
    if (stateError || !data) return null
    const byCode: Record<string, ConsentState> = {}
    for (const row of data as Array<ConsentState & { purpose_code: string }>) {
      byCode[row.purpose_code] = { decision: row.decision, document_version: row.document_version, server_ts: row.server_ts }
    }
    return byCode
  }, [])

  useEffect(() => {
    void (async () => {
      const [{ data: notice, error: noticeError }, byCode] = await Promise.all([
        supabase.functions.invoke('get-consent-notice', { method: 'GET' }),
        loadConsentState(),
      ])
      if (noticeError || !notice || notice.error || !byCode) {
        setStatus('unavailable')
        return
      }
      setPurposes((notice.purposes ?? []) as ConsentPurpose[])
      setConsentByCode(byCode)
      setStatus('ready')
    })()
  }, [loadConsentState])

  async function toggle(purpose: ConsentPurpose) {
    setError('')
    setSavingCode(purpose.code)
    try {
      const action = consentByCode[purpose.code]?.decision === 'granted' ? 'revoke' : 'grant'
      const { data, error: invokeError } = await supabase.functions.invoke('update-my-consent', {
        body: { purpose_code: purpose.code, action },
      })
      if (invokeError || data?.error) {
        setError('No pudimos actualizar esa opción. Inténtalo de nuevo en un momento.')
        return
      }
      const byCode = await loadConsentState()
      if (byCode) setConsentByCode(byCode)
    } finally {
      setSavingCode(null)
    }
  }

  function describeState(code: string): string {
    const state = consentByCode[code]
    if (!state) return 'Sin decisión'
    const date = new Date(state.server_ts).toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' })
    const label = state.decision === 'granted' ? 'Activa' : 'Inactiva'
    return `${label} · versión ${state.document_version} · ${date}`
  }

  // REQ-10/T19.b: códigos que request-data-subject-right ya define, sin tecnicismos (mismo
  // criterio que RegisterScreen con secure-register-user). `invalid_input`/`forbidden` no
  // deberían darse nunca desde este formulario (el <select> ya restringe request_type a
  // REQUEST_TYPES y el usuario viene autenticado), pero se cubren igual por si el servidor
  // cambia antes que este cliente.
  function friendlyDsrError(code: string | undefined): string {
    switch (code) {
      case 'rate_limited':
        return 'Ya enviaste varias solicitudes en poco tiempo. Espera unos minutos e inténtalo de nuevo.'
      case 'RATE_LIMIT_UNAVAILABLE':
      case 'settings_unavailable':
        return 'No podemos procesar tu solicitud en este momento. Inténtalo de nuevo en unos minutos.'
      case 'missing_client_ip':
        return 'No pudimos identificar tu conexión. Inténtalo de nuevo en un momento.'
      default:
        return 'No pudimos enviar tu solicitud. Inténtalo de nuevo en un momento.'
    }
  }

  async function submitDsr(e: React.FormEvent) {
    e.preventDefault()
    if (!REQUEST_TYPES.includes(requestType)) return
    setDsrStatus('sending')
    setDsrError('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('request-data-subject-right', {
        body: { request_type: requestType, details: requestDetails.trim() || undefined },
      })
      if (invokeError) {
        const { code } = await getSupabaseFunctionError(invokeError, 'No pudimos enviar tu solicitud. Inténtalo de nuevo en un momento.')
        setDsrError(friendlyDsrError(code))
        setDsrStatus('error')
        return
      }
      if (!data || typeof data.case_number !== 'string' || typeof data.due_at !== 'string') {
        setDsrError(friendlyDsrError(undefined))
        setDsrStatus('error')
        return
      }
      setDsrResult({ case_number: data.case_number, due_at: data.due_at })
      setDsrStatus('sent')
    } catch {
      setDsrError(friendlyDsrError(undefined))
      setDsrStatus('error')
    }
  }

  return (
    <div className="privacy-page">
      <SectionHeader eyebrow="TUS DATOS, TU DECISIÓN" title="Mi privacidad" kanji="盾" />

      {status === 'loading' && (
        <div className="consent-loading" role="status">
          <Loader className="animate-spin" size={20} /> Cargando tu información de privacidad…
        </div>
      )}

      {status === 'unavailable' && (
        <div className="form-error" role="alert">
          No podemos mostrar tu información de privacidad en este momento. Inténtalo de nuevo en unos minutos.
        </div>
      )}

      {status === 'ready' && (
        <>
        <section className="glass-panel p-6">
          <fieldset className="consent-purposes">
            <legend>Finalidades para las que autorizas el uso de tus datos</legend>
            {purposes.map((purpose) => (
              purpose.required ? (
                <div key={purpose.code} className="consent-purpose-option" style={{ cursor: 'default' }}>
                  <span>
                    <strong>{purpose.label}</strong> (obligatoria)
                    {purpose.description && <small>{purpose.description}</small>}
                    <small>{describeState(purpose.code)}</small>
                  </span>
                </div>
              ) : (
                <label key={purpose.code} className="consent-purpose-option">
                  <input
                    type="checkbox"
                    checked={consentByCode[purpose.code]?.decision === 'granted'}
                    disabled={savingCode === purpose.code}
                    onChange={() => void toggle(purpose)}
                  />
                  <span>
                    <strong>{purpose.label}</strong> (opcional)
                    {purpose.description && <small>{purpose.description}</small>}
                    <small>{describeState(purpose.code)}</small>
                  </span>
                </label>
              )
            ))}
          </fieldset>

          {error && <div className="form-error" role="alert">{error}</div>}
        </section>

        <section className="glass-panel p-6">
          <h2>Solicitar un derecho sobre mis datos (baja y demás)</h2>
          {dsrStatus === 'sent' && dsrResult ? (
            <p role="status">
              Recibimos tu solicitud. Número de caso <strong>{dsrResult.case_number}</strong>, con respuesta
              antes del {new Date(dsrResult.due_at).toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' })}.
            </p>
          ) : (
            <form onSubmit={(e) => void submitDsr(e)}>
              <div className="field">
                <label htmlFor="dsr-type">TIPO DE SOLICITUD</label>
                <select
                  id="dsr-type"
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value)}
                  required
                >
                  <option value="">Seleccione...</option>
                  {REQUEST_TYPES.map((code) => (
                    <option key={code} value={code}>{REQUEST_TYPE_LABELS[code]}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="dsr-details">DETALLE (OPCIONAL)</label>
                <textarea
                  id="dsr-details"
                  value={requestDetails}
                  onChange={(e) => setRequestDetails(e.target.value)}
                  maxLength={4000}
                  rows={4}
                />
              </div>

              {dsrStatus === 'error' && <div className="form-error" role="alert">{dsrError}</div>}

              <NeonButton type="submit" color="gold" variant="outline" disabled={!requestType || dsrStatus === 'sending'}>
                {dsrStatus === 'sending' ? <Loader className="animate-spin" size={16} /> : null}
                Enviar solicitud
              </NeonButton>
            </form>
          )}
        </section>
        </>
      )}
    </div>
  )
}
