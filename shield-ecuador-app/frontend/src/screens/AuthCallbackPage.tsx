import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { EmailOtpType } from '@supabase/supabase-js'
import { Loader, ShieldCheck, TriangleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = React.useState<'loading' | 'error'>('loading')
  const [message, setMessage] = React.useState('Verificando enlace seguro...')

  React.useEffect(() => {
    async function completeMagicLinkSignIn() {
      const next = normalizeLocalRedirect(searchParams.get('next') ?? '/dashboard')
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const tokenHash = searchParams.get('token_hash') ?? hashParams.get('token_hash')
      const type = (searchParams.get('type') ?? hashParams.get('type') ?? 'email') as EmailOtpType
      const accessToken = searchParams.get('access_token') ?? hashParams.get('access_token')
      const refreshToken = searchParams.get('refresh_token') ?? hashParams.get('refresh_token')

      try {
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
          if (error) throw error
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (error) throw error
        } else {
          const { data: { session }, error } = await supabase.auth.getSession()
          if (error) throw error
          if (!session) throw new Error('missing_session')
        }

        window.history.replaceState({}, document.title, next)
        navigate(next, { replace: true })
      } catch {
        setStatus('error')
        setMessage('El enlace no es valido, expiro o ya fue utilizado. Solicita un nuevo enlace desde el login.')
      }
    }

    void completeMagicLinkSignIn()
  }, [navigate, searchParams])

  return (
    <div className="cyber-page grid place-items-center min-h-screen p-6">
      <div className="glass-panel max-w-md w-full text-center p-8">
        {status === 'loading' ? (
          <Loader className="animate-spin mx-auto text-cyan-300" size={34} />
        ) : (
          <TriangleAlert className="mx-auto text-amber-300" size={34} />
        )}
        <div className="mt-4 flex items-center justify-center gap-2 text-cyan-100">
          <ShieldCheck size={18} />
          <span className="mono-label">MAGIC LINK</span>
        </div>
        <h1 className="mt-3 text-2xl font-bold text-white">Acceso por correo</h1>
        <p className="mt-3 text-slate-300">{message}</p>
      </div>
    </div>
  )
}

function normalizeLocalRedirect(value: string) {
  if (!value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  if (value.startsWith('/login') || value.startsWith('/auth/callback')) return '/dashboard'
  return value
}
