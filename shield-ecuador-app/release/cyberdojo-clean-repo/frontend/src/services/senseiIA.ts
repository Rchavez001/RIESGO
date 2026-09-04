import { supabase } from '../lib/supabase'
import type { ScanCheck, ScanContext } from '../data/scanChecks'

export interface SystemInfo {
  os: string
  osVersion: string
  browser: string
  browserVersion: number
  deviceType: string
}

export async function consultarSenseiIA(
  vulnerabilidad: ScanCheck,
  sistemaDetectado: SystemInfo,
  instruccionExtra?: string,
): Promise<string> {
  const payload = {
    mode: "sensei",
    vulnerabilidad: {
      id: vulnerabilidad.id,
      nombre: vulnerabilidad.nombre,
      tecnico: vulnerabilidad.tecnico,
      riesgo: vulnerabilidad.riesgo,
      explicacion_simple: vulnerabilidad.explicacion_simple,
      instruccion_extra: instruccionExtra,
    },
    sistemaDetectado: {
      os: sistemaDetectado.os,
      osVersion: sistemaDetectado.osVersion,
      browser: sistemaDetectado.browser,
      browserVersion: sistemaDetectado.browserVersion,
      deviceType: sistemaDetectado.deviceType,
    },
  }

  const { data, error } = await supabase.functions.invoke("vuln-scanner-ai", { body: payload })
  if (error) throw error
  return (data as { recomendacion: string }).recomendacion
}

export function detectSystemInfo(): SystemInfo & ScanContext {
  const ua = navigator.userAgent

  let os = "Desconocido"
  let osVersion = ""
  let deviceType: "Desktop" | "Mobile" | "Tablet" = "Desktop"

  if (/android/i.test(ua)) {
    os = "Android"
    osVersion = ua.match(/Android ([0-9.]+)/)?.[1] ?? ""
    deviceType = /tablet/i.test(ua) ? "Tablet" : "Mobile"
  } else if (/ipad/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
    os = "iOS"
    osVersion = ua.match(/OS ([0-9_]+)/)?.[1]?.replace(/_/g, ".") ?? ""
    deviceType = "Tablet"
  } else if (/iphone/i.test(ua)) {
    os = "iOS"
    osVersion = ua.match(/OS ([0-9_]+)/)?.[1]?.replace(/_/g, ".") ?? ""
    deviceType = "Mobile"
  } else if (/windows nt/i.test(ua)) {
    os = "Windows"
    const nt = ua.match(/Windows NT ([0-9.]+)/)?.[1] ?? ""
    const ntMap: Record<string, string> = {
      "10.0": "10/11",
      "6.3": "8.1",
      "6.2": "8",
      "6.1": "7",
      "6.0": "Vista",
      "5.1": "XP",
    }
    osVersion = ntMap[nt] ?? nt
  } else if (/mac os x/i.test(ua)) {
    os = "macOS"
    osVersion = ua.match(/Mac OS X ([0-9_]+)/)?.[1]?.replace(/_/g, ".") ?? ""
  } else if (/linux/i.test(ua)) {
    os = "Linux"
    osVersion = ""
  }

  if (/mobile/i.test(ua) && deviceType === "Desktop") deviceType = "Mobile"

  let browser = "Desconocido"
  let browserVersion = 0

  if (/edg\//i.test(ua)) {
    browser = "Edge"
    browserVersion = parseInt(ua.match(/Edg\/([0-9]+)/)?.[1] ?? "0")
  } else if (/opr\//i.test(ua) || /opera/i.test(ua)) {
    browser = "Opera"
    browserVersion = parseInt(ua.match(/OPR\/([0-9]+)/)?.[1] ?? "0")
  } else if (/firefox\//i.test(ua)) {
    browser = "Firefox"
    browserVersion = parseInt(ua.match(/Firefox\/([0-9]+)/)?.[1] ?? "0")
  } else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) {
    browser = "Chrome"
    browserVersion = parseInt(ua.match(/Chrome\/([0-9]+)/)?.[1] ?? "0")
  } else if (/safari\//i.test(ua)) {
    browser = "Safari"
    browserVersion = parseInt(ua.match(/Version\/([0-9]+)/)?.[1] ?? "0")
  }

  const nav = navigator as Navigator & {
    connection?: { type?: string; effectiveType?: string }
  }
  const connectionType = nav.connection?.type ?? "unknown"
  const effectiveType = nav.connection?.effectiveType ?? "4g"

  return {
    os,
    osVersion,
    deviceType,
    browser,
    browserVersion,
    isHttps: window.location.protocol === "https:",
    connectionType,
    effectiveType,
  }
}
