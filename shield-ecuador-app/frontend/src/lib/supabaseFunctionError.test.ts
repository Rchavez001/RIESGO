import { getSupabaseFunctionError } from './supabaseFunctionError'

const FALLBACK = 'mensaje por defecto'

test('extrae .code y .message del cuerpo JSON de un error 4xx/5xx', async () => {
  const error = { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'rate_limited', message: 'Demasiadas solicitudes.' }) } }
  await expect(getSupabaseFunctionError(error, FALLBACK)).resolves.toEqual({ code: 'rate_limited', message: 'Demasiadas solicitudes.' })
})

test('sin campo message en el cuerpo, usa el código como mensaje y no fija .code (no es un identificador simple)', async () => {
  const error = { context: { json: async () => ({ error: 'algo con espacios' }) } }
  await expect(getSupabaseFunctionError(error, FALLBACK)).resolves.toEqual({ code: undefined, message: 'algo con espacios' })
})

test('si context.json() falla, cae a context.text()', async () => {
  const error = { context: { json: async () => { throw new Error('no es JSON') }, text: async () => 'texto plano del servidor' } }
  await expect(getSupabaseFunctionError(error, FALLBACK)).resolves.toEqual({ message: 'texto plano del servidor' })
})

test('sin context, usa error.message', async () => {
  const error = { message: 'fallo de red' }
  await expect(getSupabaseFunctionError(error, FALLBACK)).resolves.toEqual({ message: 'fallo de red' })
})

test('con un Error nativo, usa su .message', async () => {
  await expect(getSupabaseFunctionError(new Error('fallo nativo'), FALLBACK)).resolves.toEqual({ message: 'fallo nativo' })
})

test('sin nada reconocible, usa el fallback dado por el llamante', async () => {
  await expect(getSupabaseFunctionError(null, FALLBACK)).resolves.toEqual({ message: FALLBACK })
  await expect(getSupabaseFunctionError('texto suelto', FALLBACK)).resolves.toEqual({ message: FALLBACK })
})
