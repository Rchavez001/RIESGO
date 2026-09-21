import learningCatalog from './learningCatalog.json'

export type BeltLevel = 'blanco' | 'amarillo' | 'naranja' | 'verde' | 'azul' | 'marron' | 'negro'
export type KataStatus = 'locked' | 'available' | 'completed'

export const beltPath: Array<{
  level: BeltLevel
  label: string
  kanji: string
  color: string
  iso: string
  xp: number
}> = [
  { level: 'blanco', label: 'Blanco', kanji: 'B', color: '#eeeeee', iso: 'Conciencia básica', xp: 0 },
  { level: 'amarillo', label: 'Amarillo', kanji: 'A', color: '#f5c518', iso: 'Reglas claras de seguridad', xp: 600 },
  { level: 'naranja', label: 'Naranja', kanji: 'N', color: '#f97316', iso: 'Cuidar equipos, cuentas y datos', xp: 1300 },
  { level: 'verde', label: 'Verde', kanji: 'V', color: '#22c55e', iso: 'Control de entradas', xp: 2200 },
  { level: 'azul', label: 'Azul', kanji: 'Z', color: '#3b82f6', iso: 'Proteger información importante', xp: 3400 },
  { level: 'marron', label: 'Marrón', kanji: 'M', color: '#8b5a2b', iso: 'Cuidar lugares, equipos y responder ante problemas', xp: 6000 },
  { level: 'negro', label: 'Negro', kanji: 'X', color: '#101827', iso: 'Revision completa de seguridad', xp: 9000 },
]

// The live catalogue contains metadata only; questions and progress come from
// the account-scoped learning service. Exam answers never ship in this bundle.
export const dojoModules = learningCatalog.map(d => ({
  id: d.id, number: d.rank + 1, kanji: '道', title: d.title,
  isoControl: '30 preguntas con explicación', category: d.title,
  requiredBelt: d.belt as BeltLevel, difficulty: d.rank + 1,
  status: 'available' as KataStatus, xp: 250,
}))

export const senseiQuotes = [
  { jp: 'Verifica antes de actuar', es: 'El conocimiento es tu herramienta mas fuerte.' },
  { jp: 'La defensa se practica cada dia', es: 'La defensa nace del entrenamiento diario.' },
  { jp: 'No te apresures', es: 'No te apresures: verifica.' },
  { jp: 'Todo negocio necesita proteccion', es: 'Un pequeno negocio tambien necesita un gran escudo.' },
]

export const leaderboard = [
  { rank: 1, name: 'Akira Manta', company: 'Manta Market', belt: 'negro' as BeltLevel, xp: 9420, katas: 48, streak: 31 },
  { rank: 2, name: 'Lina Quito', company: 'Andes Tech', belt: 'marron' as BeltLevel, xp: 8120, katas: 42, streak: 18 },
  { rank: 3, name: 'Marco Loja', company: 'Cafe Loja', belt: 'marron' as BeltLevel, xp: 6900, katas: 35, streak: 14 },
  { rank: 4, name: 'Diana Cuenca', company: 'Cuenca Farma', belt: 'azul' as BeltLevel, xp: 5520, katas: 28, streak: 9 },
  { rank: 5, name: 'Rafael Guayaquil', company: 'Puerto Seguro', belt: 'verde' as BeltLevel, xp: 3840, katas: 22, streak: 7 },
  { rank: 6, name: 'Tu Dojo', company: 'PYME Ecuador', belt: 'verde' as BeltLevel, xp: 2840, katas: 16, streak: 5 },
]
