// `code` is only set when the server's `error` is a machine identifier (notice_changed,
// rate_limited…), never for the Spanish sentences older responses put there.
export async function getSupabaseFunctionError(error: unknown, fallback: string): Promise<{ message: string; code?: string }> {
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
  return { message: fallback }
}
