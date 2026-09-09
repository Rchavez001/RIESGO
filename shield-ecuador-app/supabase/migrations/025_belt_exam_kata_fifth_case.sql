-- Adds a 5th case to each belt-exam kata that only had 4, so every exam has at least
-- 5 cases with the last ones at medium/medium-high complexity: the correct answer is
-- not obvious at a glance and assumes the reader already completed the dojo's 20
-- manual questions. EXAM_MARRON_NEGRO already has 8 cases (merged in migration 017)
-- and is left untouched.

UPDATE public.katas
SET steps = steps || '[{
  "question": "Tu vecino, con su mismo numero de siempre, te escribe pidiendo que le deposites urgente porque esta varado y perdio su celular. Que haces?",
  "term": "Cuenta o numero suplantado",
  "term_explanation": "Es cuando alguien usa el numero o la cuenta real de una persona conocida para pedir algo, a veces porque esa cuenta fue robada.",
  "options": ["Depositar porque es el numero real de tu vecino", "Llamarlo por videollamada o buscarlo en persona antes de depositar algo", "Pedirle una foto de su cedula", "Depositar solo la mitad del monto"],
  "correct": 1,
  "explanation": "Que el numero parezca conocido no basta: si perdio el celular, no puede escribir desde ahi. La verificacion por otro canal sigue siendo obligatoria aunque el remitente parezca de confianza."
}]'::jsonb
WHERE kata_code = 'EXAM_BLANCO_AMARILLO';

UPDATE public.katas
SET steps = steps || '[{
  "question": "Una empresa conocida y real te contacta por una red social, no por su canal oficial, ofreciendo trabajo desde casa con buen pago, y pide que primero compres un kit de inicio. Que senal es la mas importante, aunque la empresa exista de verdad?",
  "term": "Canal no oficial",
  "term_explanation": "Es cuando el contacto llega por un medio que la empresa no usa normalmente para procesos serios, como un perfil de red social sin verificar.",
  "options": ["Que la empresa sea conocida", "Que el contacto no venga del canal oficial de la empresa y pida pago previo", "Que ofrezcan trabajo desde casa", "Que el sueldo sea bueno"],
  "correct": 1,
  "explanation": "Que una empresa sea real no garantiza que ese contacto especifico lo sea. Los procesos de contratacion reales no piden dinero por adelantado ni ocurren fuera de canales verificables."
}]'::jsonb
WHERE kata_code = 'EXAM_AMARILLO_NARANJA';

UPDATE public.katas
SET steps = steps || '[{
  "question": "Instalas una app de un banco real, descargada desde la tienda oficial de tu celular, pero te pide activar un permiso de accesibilidad que no es normal para una app bancaria. Que haces?",
  "term": "Permiso de accesibilidad",
  "term_explanation": "Es un permiso muy poderoso que permite a una app leer y controlar casi todo en el celular; rara vez lo necesita una app bancaria normal.",
  "options": ["Activarlo porque la app es del banco y vino de la tienda oficial", "No activarlo y consultar si es normal antes de continuar", "Activarlo solo un momento y luego desactivarlo", "Reinstalar la app para que no lo pida"],
  "correct": 1,
  "explanation": "Que la app venga de una tienda oficial no la hace automaticamente segura si pide permisos fuera de lo normal. Antes de dar accesos poderosos, hay que confirmar si es realmente necesario."
}]'::jsonb
WHERE kata_code = 'EXAM_NARANJA_VERDE';

UPDATE public.katas
SET steps = steps || '[{
  "question": "Recibes una llamada de un numero que si conoces, el de soporte de tu banco guardado en tus contactos, pidiendote el codigo que te llego por mensaje para verificar una transferencia sospechosa. Que haces?",
  "term": "Suplantacion de numero",
  "term_explanation": "Es una tecnica donde un atacante hace que la llamada muestre un numero que no es realmente el suyo.",
  "options": ["Dar el codigo porque el numero coincide con el guardado", "No dar el codigo y colgar para llamar tu mismo al numero oficial del banco", "Dar solo los primeros tres digitos", "Pedir que te envien otro codigo"],
  "correct": 1,
  "explanation": "El numero que se muestra en una llamada se puede falsificar. Ningun banco pide codigos de verificacion por telefono, sin importar que numero aparezca."
}]'::jsonb
WHERE kata_code = 'EXAM_VERDE_AZUL';

UPDATE public.katas
SET steps = steps || '[{
  "question": "Tu respaldo automatico en la nube se sincroniza cada 5 minutos con tu computadora. Un ataque de bloqueo de archivos cifra tus archivos y el respaldo en la nube tambien se actualiza con las versiones cifradas. Que fallo en la estrategia de respaldo?",
  "term": "Respaldo con versiones separadas",
  "term_explanation": "Un buen respaldo guarda versiones anteriores por separado, no solo la copia mas reciente sincronizada en tiempo real.",
  "options": ["Nada, la nube siempre es segura", "El respaldo no tenia versiones anteriores guardadas por separado del equipo infectado", "El respaldo era demasiado frecuente", "El ataque no deberia afectar la nube"],
  "correct": 1,
  "explanation": "Un respaldo que solo sincroniza en tiempo real sin conservar versiones anteriores se cifra junto con el original. Los respaldos seguros guardan versiones historicas separadas y, si es posible, desconectadas."
}]'::jsonb
WHERE kata_code = 'EXAM_AZUL_MARRON';
