import { consultarSenseiIA, type SystemInfo } from './senseiIA'
import { auditarRespuestaIA, type AuditoriaResult } from './auditorIA'
import type { ScanCheck } from '../data/scanChecks'

export type EstadoIA = 'idle' | 'sensei_pensando' | 'auditor_revisando' | 'aprobada' | 'error' | 'fallback'

export interface RecomendacionIA {
  recomendacion: string
  auditoria: AuditoriaResult | null
  intentos: number
  calidad: number
  esFallback?: boolean
}

function generarRespuestaFallback(vulnerabilidad: ScanCheck): string {
  return `🥋 **El Sensei tiene una recomendación básica para ti:**

Esta situación requiere atención. Te recomendamos:

1. ✅ Consulta con un especialista de confianza sobre: "${vulnerabilidad.nombre}"
2. 🔒 Mientras tanto, evita manejar información importante hasta resolver esto
3. 📞 Puedes contactar a INSTASEG para una evaluación personalizada

⚔️ *"El guerrero sabio sabe cuándo pedir ayuda. ¡Eso también es fortaleza!"*`
}

export async function obtenerRecomendacionValidada(
  vulnerabilidad: ScanCheck,
  sistemaDetectado: SystemInfo,
  onEstadoChange: (estado: EstadoIA) => void,
): Promise<RecomendacionIA> {
  const MAX_INTENTOS = 2
  let instruccionAdicional = ""

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    try {
      onEstadoChange("sensei_pensando")
      const recomendacion = await consultarSenseiIA(
        vulnerabilidad,
        sistemaDetectado,
        instruccionAdicional || undefined,
      )

      onEstadoChange("auditor_revisando")
      const auditoria = await auditarRespuestaIA(recomendacion, vulnerabilidad)

      if (auditoria.aprobada && auditoria.puntaje >= 75) {
        onEstadoChange("aprobada")
        return { recomendacion, auditoria, intentos: intento, calidad: auditoria.puntaje }
      }

      instruccionAdicional = `INTENTO ${intento} RECHAZADO. Problemas: ${auditoria.problemas_encontrados?.join(", ")}. CORRECCIÓN REQUERIDA: ${auditoria.sugerencia_mejora}`
    } catch {
      onEstadoChange("error")
      break
    }
  }

  onEstadoChange("fallback")
  return {
    recomendacion: generarRespuestaFallback(vulnerabilidad),
    auditoria: null,
    intentos: MAX_INTENTOS,
    calidad: 0,
    esFallback: true,
  }
}
