import React, { useEffect, useState } from 'react'
import { Loader } from 'lucide-react'
import { NeonButton } from './CyberBushido'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { renderConsentMarkdown } from '../lib/consentMarkdown'
import { getSupabaseFunctionError } from '../lib/supabaseFunctionError'

interface ConsentPurpose {
  code: string
  label: string
  description?: string
  required: boolean
}

interface ConsentNotice {
  document_id: string
  version: string
  title: string
  rendered_md: string
  rendered_sha256: string
  settings_version: number
  purposes: ConsentPurpose[]
  requires_reconsent: boolean
}

interface ConsentRow {
  purpose_code: string
  decision: 'granted' | 'denied' | 'revoked'
  document_version: string
}

type Status = 'checking' | 'clear' | 'required' | 'blocked'
type DsrStatus = 'idle' | 'sending' | 'sent' | 'error'

// REQ-09: on the next login after a version is published with requires_reconsent = true, the
// user sees the new notice before reaching anything else; rejecting the required purpose only
// leaves "request account deletion" or "sign out" (never silent access). Wraps ProtectedShell's
// content in App.tsx — above AdminShell/DojoShell, so neither renders while a gate is pending.
// Guests (anonymous sessions) never consented to registro_aprendizaje in the first place (T19b
// handles their own, separate notice), so they skip this check entirely.
export function ReconsentGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()
  const [status, setStatus] = useState<Status>(user?.is_anonymous ? 'clear' : 'checking')
  const [notice, setNotice] = useState<ConsentNotice | null>(null)
  const [decisions, setDecisions] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dsrStatus, setDsrStatus] = useState<DsrStatus>('idle')
  const [dsrResult, setDsrResult] = useState<{ case_number: string; due_at: string } | null>(null)

  useEffect(() => {
    if (user?.is_anonymous) {
      setStatus('clear')
      return
    }
    void check()
    // Runs once per signed-in user; `check()` itself is the only thing that should trigger a re-check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function check() {
    setStatus('checking')
    const [{ data: noticeData, error: noticeError }, { data: rows, error: rowsError }] = await Promise.all([
      supabase.functions.invoke('get-consent-notice', { method: 'GET' }),
      supabase.from('my_consent_state').select('purpose_code, decision, document_version'),
    ])

    // Fail open: a transient error checking reconsent must not lock a user out of an app they
    // could already use today. get-consent-notice being unavailable is already surfaced where it
    // blocks something real (RegisterScreen, PrivacyPage).
    if (noticeError || !noticeData || noticeData.error || rowsError || !rows) {
      setStatus('clear')
      return
    }

    const typedNotice = noticeData as ConsentNotice
    if (!typedNotice.requires_reconsent) {
      setStatus('clear')
      return
    }

    const byCode: Record<string, ConsentRow> = {}
    for (const row of rows as ConsentRow[]) byCode[row.purpose_code] = row

    const requiredPurpose = typedNotice.purposes.find((purpose) => purpose.required)
    const alreadyCurrent = requiredPurpose
      ? byCode[requiredPurpose.code]?.document_version === typedNotice.version
      : true
    if (alreadyCurrent) {
      setStatus('clear')
      return
    }

    // Optional purposes default to the user's current decision (not all-unchecked like first
    // registration): re-consenting to a reworded notice must not silently drop an existing opt-in.
    const initialDecisions: Record<string, boolean> = {}
    for (const purpose of typedNotice.purposes) {
      initialDecisions[purpose.code] = byCode[purpose.code]?.decision === 'granted'
    }
    setNotice(typedNotice)
    setDecisions(initialDecisions)
    setError('')
    setStatus('required')
  }

  function toggleDecision(code: string) {
    setDecisions((current) => ({ ...current, [code]: !current[code] }))
  }

  async function accept() {
    if (!notice) return
    setError('')
    setSubmitting(true)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('submit-consent', {
        body: {
          document_id: notice.document_id,
          rendered_sha256: notice.rendered_sha256,
          settings_version: notice.settings_version,
          decisions: notice.purposes.map((purpose) => ({
            purpose_code: purpose.code,
            decision: decisions[purpose.code] ? 'granted' : 'denied',
          })),
        },
      })
      if (invokeError) {
        const { code } = await getSupabaseFunctionError(invokeError, '')
        if (code === 'notice_changed') {
          await check()
          return
        }
        setError('No pudimos registrar tu aceptación. Inténtalo de nuevo en un momento.')
        return
      }
      if (data?.error) {
        setError('No pudimos registrar tu aceptación. Inténtalo de nuevo en un momento.')
        return
      }
      setStatus('clear')
    } finally {
      setSubmitting(false)
    }
  }

  function reject() {
    setDsrStatus('idle')
    setDsrResult(null)
    setStatus('blocked')
  }

  async function requestBaja() {
    setDsrStatus('sending')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('request-data-subject-right', {
        body: { request_type: 'baja' },
      })
      if (invokeError || !data || typeof data.case_number !== 'string' || typeof data.due_at !== 'string') {
        setDsrStatus('error')
        return
      }
      setDsrResult({ case_number: data.case_number, due_at: data.due_at })
      setDsrStatus('sent')
    } catch {
      setDsrStatus('error')
    }
  }

  if (status === 'clear') return <>{children}</>

  if (status === 'checking') {
    return (
      <div className="cyber-page grid place-items-center min-h-screen">
        <div className="consent-loading" role="status">
          <Loader className="animate-spin" size={20} /> Comprobando tu aviso de privacidad…
        </div>
      </div>
    )
  }

  if (status === 'blocked') {
    return (
      <div className="cyber-page grid place-items-center min-h-screen">
        <div className="auth-card glass-panel">
          <h2>No puedes continuar sin aceptar el aviso</h2>
          <p>
            Mientras no aceptes la finalidad obligatoria del nuevo aviso de privacidad, solo
            puedes solicitar la baja de tu cuenta o cerrar sesión.
          </p>

          {dsrStatus === 'sent' && dsrResult ? (
            <p role="status">
              Recibimos tu solicitud de baja. Número de caso <strong>{dsrResult.case_number}</strong>, con
              respuesta antes del {new Date(dsrResult.due_at).toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' })}.
            </p>
          ) : (
            <>
              <div className="consent-actions">
                <NeonButton color="cyan" variant="outline" onClick={() => void signOut()}>
                  Cerrar sesión
                </NeonButton>
                <NeonButton color="gold" variant="outline" onClick={() => void requestBaja()} disabled={dsrStatus === 'sending'}>
                  {dsrStatus === 'sending' ? <Loader className="animate-spin" size={16} /> : null}
                  Solicitar baja de mi cuenta
                </NeonButton>
              </div>
              {dsrStatus === 'error' && (
                <div className="form-error" role="alert">
                  No pudimos enviar tu solicitud de baja. Inténtalo de nuevo en un momento.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // status === 'required'
  if (!notice) return null
  const missingPurpose = notice.purposes.find((purpose) => purpose.required && !decisions[purpose.code])

  return (
    <div className="cyber-page grid place-items-center min-h-screen">
      <div className="auth-card glass-panel consent-step">
        <div className="mono-label">AVISO DE PRIVACIDAD ACTUALIZADO · v{notice.version}</div>
        <h2>{notice.title}</h2>
        <div className="consent-body">
          {renderConsentMarkdown(notice.rendered_md, notice.title)}
        </div>

        <fieldset className="consent-purposes">
          <legend>¿Para qué autorizas el uso de tus datos?</legend>
          {notice.purposes.map((purpose) => (
            <label key={purpose.code} className="consent-purpose-option">
              <input
                type="checkbox"
                checked={!!decisions[purpose.code]}
                onChange={() => toggleDecision(purpose.code)}
              />
              <span>
                <strong>{purpose.label}</strong>{purpose.required ? ' (obligatoria)' : ' (opcional)'}
                {purpose.description && <small>{purpose.description}</small>}
              </span>
            </label>
          ))}
        </fieldset>

        <p id="reconsent-requirement-hint" className="consent-requirement-hint" role="status" aria-live="polite">
          {missingPurpose ? `Debes aceptar "${missingPurpose.label}" para continuar.` : ''}
        </p>

        {error && <div className="form-error" role="alert">{error}</div>}

        <div className="consent-actions">
          <NeonButton color="cyan" variant="outline" onClick={reject} disabled={submitting}>
            No acepto
          </NeonButton>
          <NeonButton
            color="gold"
            variant="outline"
            onClick={() => void accept()}
            disabled={!!missingPurpose || submitting}
            describedBy="reconsent-requirement-hint"
          >
            {submitting ? <Loader className="animate-spin" size={16} /> : null} Acepto y continúo
          </NeonButton>
        </div>
      </div>
    </div>
  )
}
