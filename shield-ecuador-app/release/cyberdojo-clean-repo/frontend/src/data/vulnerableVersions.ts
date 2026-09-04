export const VULNERABLE_OS_DB: Record<string, { eol: string[]; vulnerable: string[]; safe: string[] }> = {
  Windows: {
    eol: ["XP", "Vista", "7", "8", "8.1"],
    vulnerable: ["10 1909", "10 2004", "10 20H2"],
    safe: ["10 21H2", "10 22H2", "11 22H2", "11 23H2", "11 24H2"],
  },
  macOS: {
    eol: ["10.13", "10.14", "10.15", "11", "12"],
    vulnerable: ["13"],
    safe: ["14", "15"],
  },
  Android: {
    eol: ["4", "5", "6", "7", "8", "9", "10", "11"],
    vulnerable: ["12"],
    safe: ["13", "14", "15"],
  },
  iOS: {
    eol: ["12", "13", "14", "15"],
    vulnerable: ["16"],
    safe: ["17", "18"],
  },
  Linux: {
    eol: [],
    vulnerable: [],
    safe: ["any"],
  },
}

export const VULNERABLE_BROWSERS: Record<string, number> = {
  Chrome: 120,
  Firefox: 120,
  Safari: 17,
  Edge: 120,
  Opera: 106,
}

export const BELT_SYSTEM: Record<string, { min: number; color: string; emoji: string; mensaje: string; kanji: string }> = {
  negro:    { min: 90, color: "#1a1a1a", emoji: "🥋", mensaje: "¡Maestro de la ciberseguridad!", kanji: "黒" },
  rojo:     { min: 75, color: "#dc2626", emoji: "🔴", mensaje: "¡Guerrero digital avanzado!", kanji: "赤" },
  azul:     { min: 60, color: "#2563eb", emoji: "🔵", mensaje: "¡Buen progreso, sigue entrenando!", kanji: "青" },
  verde:    { min: 45, color: "#16a34a", emoji: "🟢", mensaje: "¡Vas por buen camino, aprendiz!", kanji: "緑" },
  amarillo: { min: 30, color: "#ca8a04", emoji: "🟡", mensaje: "¡Necesitas más entrenamiento!", kanji: "黄" },
  blanco:   { min: 0,  color: "#9ca3af", emoji: "⚪", mensaje: "¡El viaje comienza aquí!", kanji: "白" },
}

export function assignBelt(score: number): string {
  const levels = Object.entries(BELT_SYSTEM).sort((a, b) => b[1].min - a[1].min)
  return levels.find(([, v]) => score >= v.min)?.[0] ?? "blanco"
}

export function checkOSVersion(os: string, version: string): boolean {
  const db = VULNERABLE_OS_DB[os]
  if (!db) return true
  if (os === "Linux") return true
  const v = version.toLowerCase()
  const isEol = db.eol.some((e) => v.includes(e.toLowerCase()))
  const isVuln = db.vulnerable.some((e) => v.includes(e.toLowerCase()))
  return !isEol && !isVuln
}

export function checkBrowserVersion(browser: string, version: number): boolean {
  const min = VULNERABLE_BROWSERS[browser]
  if (!min) return true
  return version >= min
}
