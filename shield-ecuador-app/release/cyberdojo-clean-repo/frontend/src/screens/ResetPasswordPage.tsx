import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { NeonButton, SectionHeader } from '../components/CyberBushido'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'idle' | 'ready' | 'done' | 'error'>('idle')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Try to extract tokens from URL (hash or query)
    const full = window.location.href
    const hash = window.location.hash || ''
    const search = window.location.search || ''

    const params = new URLSearchParams(search.replace(/^\?/, ''))
    let access = params.get('access_token')
    let refresh = params.get('refresh_token')

    if (!access && hash.includes('access_token')) {
      const h = new URLSearchParams(hash.replace(/^#/, ''))
      access = access || h.get('access_token')
      refresh = refresh || h.get('refresh_token')
    }

    async function resume() {
      if (access) {
        try {
          const auth = supabase.auth as any
          if (refresh) {
            await auth.setSession({ access_token: access, refresh_token: refresh })
            setStatus('ready')
          } else if (typeof auth.getSessionFromUrl === 'function') {
            const { data, error } = await auth.getSessionFromUrl({ storeSession: true })
            if (error) throw error
            if (data?.session) setStatus('ready')
            else {
              setMessage('No se pudo establecer la sesión desde el enlace.');
              setStatus('error')
            }
          } else {
            await auth.setSession({ access_token: access, refresh_token: access })
            setStatus('ready')
          }
        } catch (err) {
          console.error('Error setting session from recovery link', err)
          setMessage('No se pudo iniciar la sesión desde el enlace. Intenta copiar el enlace completo o contacta soporte.')
          setStatus('error')
        }
      } else {
        setMessage('No se detectó un token de recuperación en la URL. Asegúrate de usar el enlace enviado por correo.')
        setStatus('error')
      }
    }

    void resume()
  }, [])

  async function submitNewPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!password || password.length < 8) {
      setMessage('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setMessage('Contraseña actualizada. Redirigiendo al inicio...')
      setStatus('done')
      window.setTimeout(() => navigate('/login'), 1400)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error actualizando contraseña'
      setMessage(msg)
      setStatus('error')
    }
  }

  return (
    <div className="cyber-page grid place-items-center min-h-screen">
      <div className="glass-panel p-8 max-w-md">
        <SectionHeader eyebrow="// RECUPERAR CONTRASEÑA" title="Restablecer contraseña" kanji="鍵" />
        <p className="muted">Usa este formulario para elegir una nueva contraseña segura.</p>
        {status === 'error' && <div className="form-error mt-4">{message}</div>}
        {status === 'ready' && (
          <form onSubmit={submitNewPassword} className="mt-4">
            <div className="field">
              <label>Nueva contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="Nueva contraseña" />
            </div>
            <NeonButton type="submit" className="w-full justify-center">Actualizar contraseña</NeonButton>
          </form>
        )}
        {status === 'idle' && <p className="mt-4">Verificando enlace de recuperación...</p>}
        {status === 'done' && <p className="mt-4">{message}</p>}
      </div>
    </div>
  )
}

export default ResetPasswordPage
