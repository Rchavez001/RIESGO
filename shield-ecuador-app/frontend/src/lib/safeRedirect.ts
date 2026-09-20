// A "next" destination taken from a URL or router state must stay inside this app. The old check
// (startsWith('/') && !startsWith('//')) let "/\evil.com" through: browsers read the backslash as a
// slash, so it resolves to //evil.com — a different origin.
function hasBackslashOrControl(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code === 0x5c || code <= 0x1f) return true // "\" or a C0 control character
  }
  return false
}

export function safeLocalPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value || !value.startsWith('/') || hasBackslashOrControl(value)) return fallback
  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin) return fallback
    const path = url.pathname + url.search + url.hash
    if (path.startsWith('//') || path.startsWith('/login') || path.startsWith('/auth/callback')) return fallback
    return path
  } catch {
    return fallback
  }
}
