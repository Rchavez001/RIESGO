// Supabase Auth returns raw English messages ("email rate limit exceeded", "Signups not allowed
// for otp", ...). Showing them leaks backend details, and "Signups not allowed" even reveals
// that an e-mail has no account. Only two cases get a specific message; everything else falls
// back to the caller's generic text.
export function friendlyAuthError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : ''
  if (/rate limit|too many|security purposes|\b429\b/i.test(msg)) {
    return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
  }
  if (/network|failed to fetch|fetch failed|load failed|timed? ?out/i.test(msg)) {
    return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.'
  }
  return fallback
}
