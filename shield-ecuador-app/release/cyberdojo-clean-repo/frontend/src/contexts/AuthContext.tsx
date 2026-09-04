import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase, UserProfile } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  userProfile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signInWithMagicLink: (email: string, redirectPath?: string) => Promise<void>
  signUp: (email: string, password: string, metadata: Partial<UserProfile>) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
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
    if (error) throw error
  }

  async function signInWithMagicLink(email: string, redirectPath = '/dashboard') {
    const normalizedEmail = email.trim().toLowerCase()
    const safeRedirectPath = normalizeLocalRedirect(redirectPath)
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeRedirectPath)}`

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: false,
        emailRedirectTo,
      },
    })

    if (error) throw error
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

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, signIn, signInWithMagicLink, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function normalizeLocalRedirect(value: string) {
  if (!value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  if (value.startsWith('/login') || value.startsWith('/auth/callback')) return '/dashboard'
  return value
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
