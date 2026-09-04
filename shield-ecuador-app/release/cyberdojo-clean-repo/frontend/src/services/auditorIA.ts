import { supabase } from '../lib/supabase'
import type { ScanCheck } from '../data/scanChecks'

export interface AuditoriaResult {
  aprobada: boolean
  puntaje: number
  criterios: Record<string, boolean>
  problemas_encontrados: string[]
  sugerencia_mejora: string
}

export async function auditarRespuestaIA(
  respuestaOriginal: string,
  vulnerabilidad: ScanCheck,
): Promise<AuditoriaResult> {
  const payload = {
    mode: "auditor",
    vulnerabilidad: {
      id: vulnerabilidad.id,
      nombre: vulnerabilidad.nombre,
      tecnico: vulnerabilidad.tecnico,
      riesgo: vulnerabilidad.riesgo,
      explicacion_simple: vulnerabilidad.explicacion_simple,
    },
    respuestaOriginal,
  }

  const { data, error } = await supabase.functions.invoke("vuln-scanner-ai", { body: payload })
  if (error) throw error

  const result = data as AuditoriaResult
  if (typeof result.aprobada !== "boolean") {
    return { aprobada: false, puntaje: 0, criterios: {}, problemas_encontrados: ["Respuesta inválida"], sugerencia_mejora: "" }
  }
  return result
}
