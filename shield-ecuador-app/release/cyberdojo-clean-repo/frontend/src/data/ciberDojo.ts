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
  { level: 'blanco', label: 'Blanco', kanji: 'B', color: '#eeeeee', iso: 'Conciencia basica', xp: 0 },
  { level: 'amarillo', label: 'Amarillo', kanji: 'A', color: '#f5c518', iso: 'Reglas claras de seguridad', xp: 600 },
  { level: 'naranja', label: 'Naranja', kanji: 'N', color: '#f97316', iso: 'Cuidar equipos, cuentas y datos', xp: 1300 },
  { level: 'verde', label: 'Verde', kanji: 'V', color: '#22c55e', iso: 'Control de entradas', xp: 2200 },
  { level: 'azul', label: 'Azul', kanji: 'Z', color: '#3b82f6', iso: 'Proteger informacion importante', xp: 3400 },
  { level: 'marron', label: 'Marron', kanji: 'M', color: '#8b5a2b', iso: 'Cuidar lugares, equipos y responder ante problemas', xp: 6000 },
  { level: 'negro', label: 'Negro', kanji: 'X', color: '#101827', iso: 'Revision completa de seguridad', xp: 9000 },
]

export const dojoModules = [
  {
    id: 'passwords',
    number: 1,
    kanji: 'CL',
    title: 'Cuidado de Contrasenas',
    isoControl: 'Tema: claves seguras',
    category: 'Identidad',
    requiredBelt: 'blanco' as BeltLevel,
    difficulty: 2,
    status: 'available' as KataStatus,
    xp: 150,
    enemy: 'Estafador de mensajes',
    questions: [
      {
        prompt: 'Una persona usa la misma contrasena para correo, banco y sistema de ventas. Que haces primero?',
        options: ['Bloquear todo internet', 'Activar verificacion en dos pasos y usar una contrasena diferente en cada cuenta', 'Cambiar el logo del sistema', 'Compartir una clave maestra'],
        correct: 1,
        explanation: 'La verificacion en dos pasos agrega un segundo candado, y las contrasenas diferentes evitan que una clave robada abra todas las cuentas.',
      },
    ],
  },
  {
    id: 'phishing',
    number: 2,
    kanji: 'MS',
    title: 'Defensa contra Mensajes Falsos',
    isoControl: 'Tema: correos y enlaces sospechosos',
    category: 'Conciencia',
    requiredBelt: 'blanco' as BeltLevel,
    difficulty: 3,
    status: 'available' as KataStatus,
    xp: 210,
    enemy: 'Correo falso',
    questions: [
      {
        prompt: 'Recibes un correo urgente con enlace acortado para pagar una factura. Cual es la accion correcta?',
        options: ['Abrir rapido', 'Reenviar a todos', 'Verificar quien lo envia y entrar solo por la pagina oficial', 'Responder con tus claves'],
        correct: 2,
        explanation: 'Revisar quien envia el mensaje y usar la pagina oficial evita caer en paginas falsas.',
      },
    ],
  },
  {
    id: 'assets',
    number: 3,
    kanji: 'EQ',
    title: 'Lista de Equipos y Cuentas',
    isoControl: 'Tema: saber que debes proteger',
    category: 'Equipos y cuentas',
    requiredBelt: 'amarillo' as BeltLevel,
    difficulty: 2,
    status: 'completed' as KataStatus,
    xp: 180,
    enemy: 'Inventario fantasma',
    questions: [],
  },
  {
    id: 'access',
    number: 4,
    kanji: 'EN',
    title: 'Control de Entradas',
    isoControl: 'Tema: quien puede entrar a cada cuenta',
    category: 'Acceso',
    requiredBelt: 'verde' as BeltLevel,
    difficulty: 4,
    status: 'locked' as KataStatus,
    xp: 320,
    enemy: 'Intruso escondido',
    questions: [],
  },
  {
    id: 'backup',
    number: 5,
    kanji: 'CS',
    title: 'Copias de Seguridad y Recuperacion',
    isoControl: 'Tema: recuperar informacion perdida',
    category: 'Continuidad',
    requiredBelt: 'naranja' as BeltLevel,
    difficulty: 3,
    status: 'available' as KataStatus,
    xp: 260,
    enemy: 'Secuestrador de archivos',
    questions: [],
  },
  {
    id: 'incident',
    number: 6,
    kanji: 'AL',
    title: 'Respuesta ante Problemas',
    isoControl: 'Tema: que hacer cuando algo sale mal',
    category: 'Emergencias',
    requiredBelt: 'marron' as BeltLevel,
    difficulty: 5,
    status: 'locked' as KataStatus,
    xp: 520,
    enemy: 'Alerta roja',
    questions: [],
  },
  {
    id: 'mentorship',
    number: 7,
    kanji: 'MT',
    title: 'Mentor del Dojo Digital',
    isoControl: 'Tema: ensenar y liderar seguridad en tu entorno',
    category: 'Liderazgo',
    requiredBelt: 'negro' as BeltLevel,
    difficulty: 5,
    status: 'locked' as KataStatus,
    xp: 600,
    enemy: 'Complacencia digital',
    questions: [
      {
        prompt: 'Ya dominas los fundamentos y varios companeros te piden ayuda. Notas que el personal nuevo evita el entrenamiento porque "no da tiempo". Que haces como referente del dojo?',
        options: [
          'Dejarlo pasar, no es tu responsabilidad',
          'Ensenar con ejemplos cortos, explicar el riesgo real sin usar miedo y dar tiempo protegido para practicar',
          'Reportar a Recursos Humanos sin hablar primero',
          'Obligar el entrenamiento con multas',
        ],
        correct: 1,
        explanation: 'Un cinturon negro protege ensenando con claridad y ejemplos, no solo exigiendo. Dar espacio real para practicar ayuda a que el aprendizaje se quede.',
      },
    ],
  },
]

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
