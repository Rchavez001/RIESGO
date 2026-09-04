import { useEffect, useRef, useState } from 'react'

export type PWAPlatform = 'ios' | 'android' | 'desktop' | 'standalone'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const STORAGE_KEY = '_pwa_hidden_until'
const DELAY_MS    = 4000

export function usePWAInstall() {
  const [platform, setPlatform]         = useState<PWAPlatform>('desktop')
  const [visible, setVisible]           = useState(false)
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)

  // Capture Android native prompt event as early as possible
  useEffect(() => {
    const onBefore = (e: Event) => {
      e.preventDefault()
      deferredRef.current = e as BeforeInstallPromptEvent
    }
    window.addEventListener('beforeinstallprompt', onBefore)
    return () => window.removeEventListener('beforeinstallprompt', onBefore)
  }, [])

  useEffect(() => {
    const ua  = navigator.userAgent
    const ios = /iphone|ipad|ipod/i.test(ua) ||
                (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
    const android = /android/i.test(ua)

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true

    if (standalone)      { setPlatform('standalone'); return }
    if (ios)             { setPlatform('ios') }
    else if (android)    { setPlatform('android') }
    else                 { setPlatform('desktop'); return } // no prompt on desktop

    // Respect user's dismiss choice
    const hiddenUntil = parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10)
    if (Date.now() < hiddenUntil) return

    const timer = setTimeout(() => setVisible(true), DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  async function triggerAndroidInstall() {
    if (!deferredRef.current) return false
    await deferredRef.current.prompt()
    const { outcome } = await deferredRef.current.userChoice
    deferredRef.current = null
    if (outcome === 'accepted') { hide(365) } // permanently on accept
    else                       { hide(14) }
    return outcome === 'accepted'
  }

  function hide(days = 14) {
    localStorage.setItem(STORAGE_KEY, String(Date.now() + days * 86_400_000))
    setVisible(false)
  }

  return {
    platform,
    visible,
    hasNativePrompt: !!deferredRef.current,
    triggerAndroidInstall,
    dismiss: () => hide(14),
  }
}
