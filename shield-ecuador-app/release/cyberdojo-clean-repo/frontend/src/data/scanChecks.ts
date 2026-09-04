import { checkOSVersion, checkBrowserVersion } from './vulnerableVersions'

export type RiskLevel = 'critico' | 'alto' | 'medio' | 'bajo'
export type Capa = 'RED' | 'SO' | 'NAVEGADOR' | 'USUARIO'

export interface ScanCheck {
  id: string
  nombre: string
  tecnico: string
  riesgo: RiskLevel
  capa: Capa
  capaLabel: string
  explicacion_simple: string
  verificar: (ctx: ScanContext) => boolean | Promise<boolean>
}

export interface ScanContext {
  os: string
  osVersion: string
  browser: string
  browserVersion: number
  isHttps: boolean
  connectionType: string
  effectiveType: string
}

export const SCAN_CHECKS: ScanCheck[] = [
  // ── CAPA 1: RED ──────────────────────────────────────────
  {
    id: "NET_001",
    nombre: "¿Tu conexión es segura?",
    tecnico: "Protocolo HTTPS activo",
    riesgo: "alto",
    capa: "RED",
    capaLabel: "⚔️ Red y Conectividad",
    explicacion_simple: "Es como verificar si la puerta de tu casa tiene cerradura buena",
    verificar: (ctx) => ctx.isHttps,
  },
  {
    id: "NET_002",
    nombre: "¿Tu velocidad de red es adecuada?",
    tecnico: "Effective connection type check (Network Information API)",
    riesgo: "bajo",
    capa: "RED",
    capaLabel: "⚔️ Red y Conectividad",
    explicacion_simple: "Una conexión muy lenta puede indicar que alguien intercepta tu tráfico",
    verificar: (ctx) => !["slow-2g", "2g"].includes(ctx.effectiveType),
  },
  {
    id: "NET_003",
    nombre: "¿Tu tipo de conexión es confiable?",
    tecnico: "Connection type detection via Network Information API",
    riesgo: "medio",
    capa: "RED",
    capaLabel: "⚔️ Red y Conectividad",
    explicacion_simple: "Las redes móviles desconocidas son como conversar en voz alta en un parque",
    verificar: (ctx) => ctx.connectionType !== "cellular" && ctx.connectionType !== "unknown",
  },

  // ── CAPA 2: SISTEMA OPERATIVO ─────────────────────────────
  {
    id: "OS_001",
    nombre: "¿Tu sistema operativo está al día?",
    tecnico: "OS version vs. known vulnerable versions database",
    riesgo: "critico",
    capa: "SO",
    capaLabel: "🛡️ Sistema Operativo",
    explicacion_simple: "Un sistema sin actualizar es como dejar la puerta trasera abierta",
    verificar: (ctx) => checkOSVersion(ctx.os, ctx.osVersion),
  },
  {
    id: "OS_002",
    nombre: "¿Usas un sistema moderno y soportado?",
    tecnico: "End-of-Life OS detection",
    riesgo: "critico",
    capa: "SO",
    capaLabel: "🛡️ Sistema Operativo",
    explicacion_simple: "Windows XP ya no recibe protección, como un guardia que se jubiló",
    verificar: (ctx) => {
      const eolList = ["XP", "Vista", " 7 ", "Windows 7", "Android 4", "Android 5", "Android 6", "iOS 12", "iOS 13"]
      const uaLower = (ctx.os + " " + ctx.osVersion).toLowerCase()
      return !eolList.some((e) => uaLower.includes(e.toLowerCase()))
    },
  },

  // ── CAPA 3: NAVEGADOR ────────────────────────────────────
  {
    id: "APP_001",
    nombre: "¿Tu navegador está protegido?",
    tecnico: "Browser version vs. minimum safe version database",
    riesgo: "alto",
    capa: "NAVEGADOR",
    capaLabel: "🔍 Navegador y Apps",
    explicacion_simple: "El navegador es tu ventana al mundo digital, debe estar blindado",
    verificar: (ctx) => checkBrowserVersion(ctx.browser, ctx.browserVersion),
  },
  {
    id: "APP_002",
    nombre: "¿Las cookies de tu navegador son seguras?",
    tecnico: "Third-party cookies and localStorage exposure check",
    riesgo: "medio",
    capa: "NAVEGADOR",
    capaLabel: "🔍 Navegador y Apps",
    explicacion_simple: "Las cookies son pequeñas fichas que los sitios usan para recordarte",
    verificar: () => {
      try {
        localStorage.setItem("_vs_test", "1")
        localStorage.removeItem("_vs_test")
        return navigator.cookieEnabled
      } catch {
        return false
      }
    },
  },
  {
    id: "APP_003",
    nombre: "¿Tu navegador tiene Do Not Track activo?",
    tecnico: "Navigator.doNotTrack property check",
    riesgo: "bajo",
    capa: "NAVEGADOR",
    capaLabel: "🔍 Navegador y Apps",
    explicacion_simple: "Como dejar huellas digitales en cada sitio que visitas",
    verificar: () => navigator.doNotTrack === "1",
  },
  {
    id: "APP_004",
    nombre: "¿Tu navegador soporta almacenamiento seguro?",
    tecnico: "IndexedDB and ServiceWorker availability check",
    riesgo: "bajo",
    capa: "NAVEGADOR",
    capaLabel: "🔍 Navegador y Apps",
    explicacion_simple: "Un navegador moderno guarda tu información de forma más segura",
    verificar: () => "indexedDB" in window && "serviceWorker" in navigator,
  },
  {
    id: "APP_005",
    nombre: "¿Tu navegador usa conexiones seguras?",
    tecnico: "SubtleCrypto / Web Crypto API availability",
    riesgo: "medio",
    capa: "NAVEGADOR",
    capaLabel: "🔍 Navegador y Apps",
    explicacion_simple: "Como el candado de una caja fuerte para tus datos",
    verificar: () => typeof window.crypto !== "undefined" && typeof window.crypto.subtle !== "undefined",
  },

  // ── CAPA 4: USUARIO ───────────────────────────────────────
  {
    id: "USR_001",
    nombre: "¿Tu sesión expira automáticamente?",
    tecnico: "Session storage timeout heuristic",
    riesgo: "medio",
    capa: "USUARIO",
    capaLabel: "👤 Hábitos del Usuario",
    explicacion_simple: "Si te olvidas de cerrar sesión, cualquiera puede entrar a tu cuenta",
    verificar: () => {
      const last = localStorage.getItem("_vs_session_check")
      if (!last) {
        localStorage.setItem("_vs_session_check", Date.now().toString())
        return true
      }
      const elapsed = Date.now() - parseInt(last)
      return elapsed < 8 * 60 * 60 * 1000
    },
  },
  {
    id: "USR_002",
    nombre: "¿Tu dispositivo soporta autenticación segura?",
    tecnico: "WebAuthn / PublicKeyCredential API availability",
    riesgo: "alto",
    capa: "USUARIO",
    capaLabel: "👤 Hábitos del Usuario",
    explicacion_simple: "La llave electrónica es más segura que una contraseña sola",
    verificar: () => typeof window.PublicKeyCredential !== "undefined",
  },
  {
    id: "USR_003",
    nombre: "¿Tu pantalla se bloquea automáticamente?",
    tecnico: "Page Visibility API + idle detection heuristic",
    riesgo: "medio",
    capa: "USUARIO",
    capaLabel: "👤 Hábitos del Usuario",
    explicacion_simple: "Dejar la pantalla sin bloqueo es como dejar tu oficina abierta",
    verificar: () => typeof document.hidden !== "undefined",
  },
]

export const CAPAS = [
  { id: "RED", label: "⚔️ Red y Conectividad", icon: "📡" },
  { id: "SO", label: "🛡️ Sistema Operativo", icon: "💻" },
  { id: "NAVEGADOR", label: "🔍 Navegador y Apps", icon: "🌐" },
  { id: "USUARIO", label: "👤 Hábitos del Usuario", icon: "👤" },
] as const
