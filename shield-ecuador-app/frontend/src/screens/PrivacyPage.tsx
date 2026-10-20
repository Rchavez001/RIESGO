import React, { useCallback, useEffect, useState } from 'react'
import { Loader } from 'lucide-react'
import { SectionHeader } from '../components/CyberBushido'
import { supabase } from '../lib/supabase'

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
      )}
    </div>
  )
}
