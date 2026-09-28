import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase, UserProfile } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

// What the visitor decided on the consent screen (RegisterScreen), carried
// through to secure-register-user exactly as the server needs to re-verify it —
// see get-consent-notice for where document_id/rendered_sha256/settings_version
// come from.
export interface ConsentSubmission {
  document_id: string
  rendered_sha256: string
  settings_version: number
  decisions: Array<{ purpose_code: string; decision: 'granted' | 'denied' }>
}

interface AuthContextType {
  user: User | null
  userProfile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  sendLoginCode: (email: string) => Promise<void>
  verifyCode: (email: string, token: string) => Promise<void>
  signUp: (email: string, password: string, metadata: { full_name: string; business_type: string }, consentNotice: ConsentSubmission, ageConfirmed: boolean) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  continueAsGuest: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const profileRequestRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    let active = true

    async function loadInitialSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!active) return
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchUserProfile(session.user.id)
        }
      } catch (error) {
        console.error('Error loading auth session:', error)
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadInitialSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          window.setTimeout(() => {
            void fetchUserProfile(session.user.id)
          }, 0)
        } else {
          setUserProfile(null)
        }
      }
    )

    return () => {
      active = false
      subscription.unsubscribe()
    }
  // Auth bootstrap must run once; fetchUserProfile is serialized internally.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchUserProfile(userId: string) {
    if (profileRequestRef.current) {
      await profileRequestRef.current
      return
    }

    profileRequestRef.current = fetchUserProfileOnce(userId)
      .finally(() => {
        profileRequestRef.current = null
      })

    await profileRequestRef.current
  }

  async function fetchUserProfileOnce(userId: string) {
    const maxAttempts = 3

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const { data, error } = await supabase.functions.invoke('get-private-profile', {
        method: 'GET',
      })

      if (!error) {
        setUserProfile(data as UserProfile)
        return
      }

      const message = `${error.message ?? ''} ${error.details ?? ''}`
      const isAuthLockRace = message.includes('auth-token') || message.includes('Lock')

      if (isAuthLockRace && attempt < maxAttempts) {
        await delay(250 * attempt)
        continue
      }

      console.error('Error fetching profile:', error)
      setUserProfile(null)
      return
    }
  }

  async function refreshProfile() {
    if (user) await fetchUserProfile(user.id)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      reportLoginEvent('login_failed', email)
      throw error
    }
  }

  // Fallback path for an EXISTING account whose password login just failed
  // (either a real typo, or — for accounts that somehow never got a real
  // password — there simply isn't one to check). shouldCreateUser: false
  // means this never silently creates a new user either way.
  async function sendLoginCode(email: string) {
    const normalizedEmail = email.trim().toLowerCase()
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: false },
    })
    if (error) {
      reportLoginEvent('otp_send_failed', normalizedEmail)
      throw error
    }
  }

  async function verifyCode(email: string, token: string) {
    const normalizedEmail = email.trim().toLowerCase()
    const { error } = await supabase.auth.verifyOtp({ email: normalizedEmail, token: token.trim(), type: 'email' })
    if (error) {
      reportLoginEvent('otp_verify_failed', normalizedEmail)
      throw error
    }
  }

  // Best-effort, fire-and-forget: gives the Centro de Seguridad visibility
  // into login attacks without ever slowing down or blocking a real login.
  function reportLoginEvent(eventType: 'login_failed' | 'otp_send_failed' | 'otp_verify_failed', email: string) {
    try {
      void Promise.resolve(supabase.functions.invoke('log-login-event', { body: { event_type: eventType, email } })).catch(() => {})
    } catch {
      // Logging must never be the reason a real login attempt reports the wrong error.
    }
  }

  async function signUp(email: string, password: string, metadata: { full_name: string; business_type: string }, consentNotice: ConsentSubmission, ageConfirmed: boolean) {
    const { data, error } = await supabase.functions.invoke('secure-register-user', {
      body: {
        email,
        password,
        full_name: metadata.full_name,
        business_type: metadata.business_type,
        consent_notice: consentNotice,
        age_gate: ageConfirmed,
      },
    })

    if (error) {
      // 4xx answers (409 notice_changed, 403 age_gate_failed…) arrive here, not in `data`.
      const { message, code } = await getSupabaseFunctionError(error)
      throw Object.assign(new Error(message), { code })
    }
    if (data?.error) {
      // .code lets RegisterScreen react to a specific outcome (e.g. re-show
      // the consent step on "notice_changed") while .message stays the
      // human-readable text everything else already just displays as-is.
      const thrown = new Error(typeof data.message === 'string' ? data.message : String(data.error)) as Error & { code?: string }
      if (typeof data.error === 'string') thrown.code = data.error
      throw thrown
    }

    await signIn(email, password)
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  // "Probar sin cuenta": a real Supabase Auth session (so the existing
  // belt/dojo RPCs work unchanged) but with no `users` row behind it — the
  // learning_overview RPC already treats a missing profile as belt rank 0,
  // which is exactly "only the first dojo unlocked". GuestGate (App.tsx) is
  // what stops this session from reaching anything past that.
  async function continueAsGuest() {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, signIn, sendLoginCode, verifyCode, signUp, signOut, refreshProfile, continueAsGuest }}>
      {children}
    </AuthContext.Provider>
  )
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

// `code` is only set when the server's `error` is a machine identifier (notice_changed…),
// never for the Spanish sentences older responses put there.
async function getSupabaseFunctionError(error: unknown): Promise<{ message: string; code?: string }> {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: unknown; context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } }
    try {
      const json = await candidate.context?.json?.()
      if (typeof json === 'object' && json !== null && 'error' in json) {
        const { error: serverError, message } = json as { error: unknown; message?: unknown }
        const code = typeof serverError === 'string' && /^[A-Za-z_]+$/.test(serverError) ? serverError : undefined
        return { message: typeof message === 'string' ? message : String(serverError), code }
      }
    } catch {
      try {
        const text = await candidate.context?.text?.()
        if (text) return { message: text }
      } catch {}
    }
    if (typeof candidate.message === 'string' && candidate.message) return { message: candidate.message }
  }
  if (error instanceof Error && error.message) return { message: error.message }
  return { message: 'No se pudo completar el registro. Verifica los datos e intenta nuevamente.' }
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
