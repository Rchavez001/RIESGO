import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase, UserProfile } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  userProfile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  sendLoginCode: (email: string) => Promise<void>
  verifyCode: (email: string, token: string) => Promise<void>
  signUp: (email: string, password: string, metadata: Partial<UserProfile>) => Promise<void>
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

  async function signUp(email: string, password: string, metadata: Partial<UserProfile>) {
    const { data, error } = await supabase.functions.invoke('secure-register-user', {
      body: {
        email,
        password,
        full_name: metadata.full_name,
        business_type: metadata.business_type,
        data_processing_authorized: metadata.data_processing_authorized,
      },
    })

    if (error) throw new Error(await getSupabaseFunctionErrorMessage(error))
    if (data?.error) throw new Error(String(data.error))

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

async function getSupabaseFunctionErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: unknown; context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } }
    try {
      const json = await candidate.context?.json?.()
      if (typeof json === 'object' && json !== null && 'error' in json) {
        return String((json as { error: unknown }).error)
      }
    } catch {
      try {
        const text = await candidate.context?.text?.()
        if (text) return text
      } catch {}
    }
    if (typeof candidate.message === 'string' && candidate.message) return candidate.message
  }
  if (error instanceof Error && error.message) return error.message
  return 'No se pudo completar el registro. Verifica los datos e intenta nuevamente.'
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
