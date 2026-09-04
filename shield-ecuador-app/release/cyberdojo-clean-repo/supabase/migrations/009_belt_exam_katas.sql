-- Belt exam katas for Ciber Dojo.
-- Source material: kata/Analisis Ciberdelito Ecuador saved cases.

INSERT INTO public.katas (
  kata_code,
  name,
  description,
  teaching,
  estimated_minutes,
  required_belt,
  points_reward,
  steps,
  verification_type,
  active
) VALUES
(
  'EXAM_BLANCO_AMARILLO',
  'Examen para subir a cinturon amarillo',
  'Valida que el alumno reconozca mensajes falsos, enlaces peligrosos y pedidos de datos personales.',
  'Antes de hacer clic, respira, revisa y entra solo por canales oficiales.',
  12,
  'white',
  250,
  $json$[
    {
      "question": "Tu mama recibe un mensaje que promete un bono de 600 dolares. El enlace pide cedula, numero de cuenta y reenviar a cinco personas. Que debe hacer primero?",
      "term": "Enlace falso",
      "term_explanation": "Un enlace falso es una direccion que parece real, pero lleva a una pagina hecha para robar datos.",
      "options": ["Abrir el enlace para confirmar", "No abrir, guardar captura y verificar en el canal oficial", "Reenviar para que otros aprovechen", "Poner solo la cedula"],
      "correct": 1,
      "explanation": "La respuesta segura es no abrir ni reenviar. Primero se verifica en la pagina, aplicacion o telefono oficial."
    },
    {
      "question": "Llega un correo: su cuenta sera cerrada hoy, valide ahora. Que accion es mas segura?",
      "term": "Phishing",
      "term_explanation": "Phishing es un engaño por correo, mensaje o llamada para robar claves, dinero o datos.",
      "options": ["Entrar por el boton del correo", "Responder con la clave", "Cerrar el correo y entrar por la aplicacion oficial", "Enviar el correo a un familiar"],
      "correct": 2,
      "explanation": "Los mensajes urgentes suelen buscar que actues sin pensar. Entra siempre por la app o pagina oficial escrita por ti."
    },
    {
      "question": "Un supuesto banco te llama y pide usuario, clave y codigo para bloquear una transferencia rara. Que haces?",
      "term": "Codigo de verificacion",
      "term_explanation": "Es un numero temporal que sirve para confirmar entradas o pagos. No se comparte con nadie.",
      "options": ["Dar el codigo para que bloqueen", "Colgar y llamar al banco usando el numero oficial", "Dar solo el usuario", "Pedir que llamen mas tarde"],
      "correct": 1,
      "explanation": "Ningun banco debe pedir claves ni codigos por telefono. Corta y llama al numero oficial."
    },
    {
      "question": "Vendes un celular y el comprador manda una captura de transferencia. Quiere retirar el equipo enseguida. Que condicion debes esperar?",
      "term": "Acreditacion",
      "term_explanation": "Acreditacion significa que el dinero ya aparece realmente en tu cuenta, no solo en una captura.",
      "options": ["Entregar porque mando captura", "Esperar que el dinero aparezca en tu cuenta", "Aceptar si promete pagar luego", "Entregar si parece amable"],
      "correct": 1,
      "explanation": "Una captura puede ser falsa. Entrega solo cuando el dinero este confirmado en tu cuenta."
    }
  ]$json$::jsonb,
  'manual',
  TRUE
),
(
  'EXAM_AMARILLO_NARANJA',
  'Examen para subir a cinturon naranja',
  'Valida que el alumno detecte estafas por empleo, prestamos, tiendas falsas y paquetes retenidos.',
  'Una oferta demasiado facil suele pedir dinero o datos antes de tiempo.',
  14,
  'yellow',
  320,
  $json$[
    {
      "question": "Te ofrecen empleo publico y dicen que estas preseleccionado, pero debes pagar credencial y examen medico. Que haces?",
      "term": "Cobro previo",
      "term_explanation": "Es pedir dinero antes de entregar un trabajo, premio o prestamo. En estafas es una señal fuerte de alerta.",
      "options": ["Pagar rapido para no perder el cupo", "Verificar en canales oficiales y no pagar valores dudosos", "Enviar cedula y deposito", "Pedir descuento"],
      "correct": 1,
      "explanation": "Un proceso serio se verifica en canales oficiales. No pagues valores que no puedas comprobar."
    },
    {
      "question": "Un mensaje dice que tu paquete no llega si no actualizas direccion y tarjeta en un enlace. Que haces?",
      "term": "Suplantacion",
      "term_explanation": "Suplantacion es cuando alguien finge ser una empresa o persona real.",
      "options": ["Usar el enlace del mensaje", "Entrar a la pagina oficial escrita por ti y revisar la guia", "Enviar la tarjeta", "Responder el mensaje"],
      "correct": 1,
      "explanation": "Si el paquete existe, lo puedes revisar en la web o app oficial sin usar el enlace recibido."
    },
    {
      "question": "Una tienda en red social vende electrodomesticos a mitad de precio, no muestra datos claros y solo acepta transferencia total. Que señal pesa mas?",
      "term": "Trazabilidad",
      "term_explanation": "Trazabilidad es poder comprobar quien vende, donde esta y como respondera si hay problema.",
      "options": ["Precio muy bajo y poca informacion del vendedor", "Que tenga fotos bonitas", "Que responda rapido", "Que use muchas mayusculas"],
      "correct": 0,
      "explanation": "Precio imposible, pocos datos y transferencia total por adelantado son señales de riesgo."
    },
    {
      "question": "Una cuenta te ofrece credito aprobado sin revision y pide pagar un seguro para liberar el dinero. Que haces?",
      "term": "Entidad autorizada",
      "term_explanation": "Es una empresa que aparece en registros oficiales para dar servicios financieros.",
      "options": ["Pagar el seguro", "Verificar si la entidad esta autorizada antes de entregar dinero", "Enviar datos bancarios", "Aceptar si el interes es bajo"],
      "correct": 1,
      "explanation": "Los prestamos con pago adelantado suelen ser estafa. Verifica primero si la entidad existe y esta autorizada."
    }
  ]$json$::jsonb,
  'manual',
  TRUE
),
(
  'EXAM_NARANJA_VERDE',
  'Examen para subir a cinturon verde',
  'Valida proteccion de cuentas, codigos, redes publicas y aplicaciones falsas.',
  'Tu cuenta se protege con calma, canales oficiales y codigos privados.',
  14,
  'orange',
  380,
  $json$[
    {
      "question": "Un amigo te escribe: por error te llego un codigo mio, devuelvemelo. Que haces?",
      "term": "Codigo de seis digitos",
      "term_explanation": "Es una llave temporal. Si la entregas, otra persona puede entrar a tu cuenta.",
      "options": ["Mandar el codigo", "No compartirlo y avisar al amigo por otro medio", "Mandar solo tres numeros", "Ignorarlo sin avisar"],
      "correct": 1,
      "explanation": "Ese codigo puede abrir tu cuenta. No lo compartas y confirma por llamada u otro canal."
    },
    {
      "question": "Un enlace invita a instalar una aplicacion tributaria o ministerial fuera de la tienda oficial. Que haces?",
      "term": "Aplicacion falsa",
      "term_explanation": "Es una app que parece real, pero puede robar datos o controlar el telefono.",
      "options": ["Instalar porque usa logo oficial", "No instalar y buscar la app en la tienda o pagina oficial", "Instalar y borrar luego", "Mandar el enlace a otros"],
      "correct": 1,
      "explanation": "Instalar fuera de canales oficiales aumenta el riesgo de robo de datos."
    },
    {
      "question": "Estas en una red publica abierta y quieres entrar a tu banca. Que es mejor?",
      "term": "Red publica abierta",
      "term_explanation": "Es una red wifi sin proteccion clara, donde no sabes quien la administra.",
      "options": ["Usarla si tiene buen internet", "Evitar pagos y banca; usar datos moviles o una red confiable", "Entrar rapido y salir", "Pedir la clave a un desconocido"],
      "correct": 1,
      "explanation": "Para banca o pagos usa datos moviles o una red confiable. La comodidad no vale perder la cuenta."
    },
    {
      "question": "Una pagina con imagen oficial pide foto de cedula, selfie y datos bancarios para activar un beneficio. Que decides?",
      "term": "Datos sensibles",
      "term_explanation": "Son datos que permiten identificarte o mover dinero, como cedula, selfie, claves o tarjetas.",
      "options": ["Entregar todo si hay logo", "No entregar hasta verificar en la entidad real", "Mandar solo la selfie", "Pedir que lo hagan por WhatsApp"],
      "correct": 1,
      "explanation": "Cedula y selfie pueden servir para suplantarte. Verifica por canal oficial antes de entregar datos."
    }
  ]$json$::jsonb,
  'manual',
  TRUE
),
(
  'EXAM_VERDE_AZUL',
  'Examen para subir a cinturon azul',
  'Valida respuesta ante cuenta secuestrada, datos ya entregados, codigos QR y familiares falsos.',
  'Cuando el daño ya empezo, el orden de respuesta reduce perdidas.',
  16,
  'green',
  440,
  $json$[
    {
      "question": "Ya pusiste contrasena, cedula y tarjeta en una pagina falsa. Cual es el primer plan correcto?",
      "term": "Plan de respuesta",
      "term_explanation": "Es una lista ordenada de pasos para reducir el daño despues de un incidente.",
      "options": ["Esperar a ver que pasa", "Llamar al banco, bloquear tarjeta, cambiar claves desde equipo seguro y guardar pruebas", "Borrar el historial solamente", "Publicarlo en redes primero"],
      "correct": 1,
      "explanation": "Actuar rapido y en orden ayuda a cortar el acceso y dejar evidencia para reportar."
    },
    {
      "question": "No puedes entrar a tu mensajeria y tus contactos reciben pedidos de dinero desde tu numero. Que haces primero?",
      "term": "Cuenta secuestrada",
      "term_explanation": "Es cuando otra persona toma control de tu cuenta y la usa como si fueras tu.",
      "options": ["Avisar a contactos por otro medio y recuperar por canal oficial", "Pagar al atacante", "Crear otra cuenta sin avisar", "Esperar un dia"],
      "correct": 0,
      "explanation": "Avisa rapido para que nadie pague y guarda capturas como evidencia."
    },
    {
      "question": "Te dejan en el carro una notificacion con un codigo cuadrado para revisar una infraccion. Que haces?",
      "term": "Codigo QR",
      "term_explanation": "Es un codigo que abre una direccion al escanearlo. Tambien puede llevar a una pagina falsa.",
      "options": ["Escanear de inmediato", "Entrar por la pagina oficial de la autoridad y comparar la informacion", "Pagar por el enlace", "Compartirlo con vecinos"],
      "correct": 1,
      "explanation": "Un QR tambien puede ser trampa. Confirma en la pagina oficial escrita por ti."
    },
    {
      "question": "Recibes un audio parecido a la voz de tu hijo pidiendo dinero urgente desde otro numero. Que haces antes de transferir?",
      "term": "Voz clonada",
      "term_explanation": "Es una imitacion de voz creada o manipulada para engañar.",
      "options": ["Transferir si suena igual", "Verificar por videollamada o por un numero conocido", "Responder con datos bancarios", "Mandar un codigo"],
      "correct": 1,
      "explanation": "Aunque la voz parezca real, confirma por un canal conocido antes de mover dinero."
    }
  ]$json$::jsonb,
  'manual',
  TRUE
),
(
  'EXAM_AZUL_MORADO',
  'Examen para subir a cinturon morado',
  'Valida criterio para ransomware, reportes, evidencias y proteccion de respaldos.',
  'La mejor defensa combina prevencion, copias y una respuesta ordenada.',
  18,
  'blue',
  520,
  $json$[
    {
      "question": "Abres un adjunto extraño y luego tus archivos no abren. Aparece una nota pidiendo dinero. Que haces primero?",
      "term": "Ransomware",
      "term_explanation": "Es un ataque que bloquea archivos y pide pago para supuestamente liberarlos.",
      "options": ["Seguir usando el equipo", "Desconectar de internet, no pagar de inmediato, pedir ayuda confiable y revisar respaldos", "Pagar sin avisar", "Borrar todo sin guardar evidencia"],
      "correct": 1,
      "explanation": "El aislamiento limita el daño. Luego se revisan respaldos y evidencia con ayuda confiable."
    },
    {
      "question": "Que respaldo sirve mejor ante archivos bloqueados por ransomware?",
      "term": "Respaldo",
      "term_explanation": "Es una copia de tus archivos importantes guardada en otro lugar.",
      "options": ["Una copia conectada todo el tiempo al mismo equipo", "Una copia reciente, probada y separada del equipo principal", "Una foto de la pantalla", "Una copia vieja sin revisar"],
      "correct": 1,
      "explanation": "Si el respaldo esta separado y probado, hay mas posibilidad de recuperar sin pagar."
    },
    {
      "question": "Despues de una estafa digital, que pruebas conviene guardar?",
      "term": "Evidencia",
      "term_explanation": "Son datos que ayudan a demostrar que paso: capturas, numeros, correos, enlaces y comprobantes.",
      "options": ["Borrar todo por vergüenza", "Capturas, enlaces, numeros, correos, comprobantes y fechas", "Solo contar de memoria", "Cambiar el nombre del contacto"],
      "correct": 1,
      "explanation": "La evidencia permite denunciar, bloquear movimientos y aprender del caso."
    },
    {
      "question": "Un familiar quiere invertir en una empresa de rendimientos altos que nadie conoce. Que verificas?",
      "term": "Rendimiento alto",
      "term_explanation": "Es una promesa de ganar mucho dinero. Si es demasiado buena, puede esconder fraude.",
      "options": ["Depositar antes de que cierre la oferta", "Revisar si aparece en listados oficiales de entidades autorizadas", "Confiar si tiene redes sociales", "Pedir que prometa por escrito"],
      "correct": 1,
      "explanation": "Verificar autorizacion protege el dinero y evita caer en entidades falsas."
    }
  ]$json$::jsonb,
  'manual',
  TRUE
),
(
  'EXAM_MORADO_ROJO',
  'Examen para subir a cinturon rojo',
  'Valida decisiones en incidentes que afectan a familia, negocio y clientes.',
  'Un buen lider digital protege personas, datos y evidencia.',
  18,
  'purple',
  600,
  $json$[
    {
      "question": "En tu negocio alguien abrio un archivo raro y ahora una computadora falla. Que instruccion das al equipo?",
      "term": "Incidente",
      "term_explanation": "Es una situacion que puede afectar datos, dinero, equipos o cuentas.",
      "options": ["Que todos prueben el archivo", "Detener uso del equipo afectado, desconectarlo y avisar al responsable", "Ocultarlo para no preocupar", "Reiniciar varias veces"],
      "correct": 1,
      "explanation": "El equipo afectado se aisla y se reporta. Probar el archivo en otros equipos puede ampliar el daño."
    },
    {
      "question": "Un cliente reporta que recibio un mensaje falso usando el nombre de tu negocio. Que haces?",
      "term": "Suplantacion de negocio",
      "term_explanation": "Es cuando delincuentes usan el nombre o imagen de una empresa para engañar.",
      "options": ["Ignorarlo", "Avisar por canales oficiales, guardar evidencia y revisar cuentas del negocio", "Pedir al cliente que pague", "Cambiar solo la foto de perfil"],
      "correct": 1,
      "explanation": "Comunicar rapido reduce victimas y revisar cuentas ayuda a saber si hubo acceso indebido."
    },
    {
      "question": "Cual dato nunca debe pedir tu personal por llamada o chat?",
      "term": "Secreto digital",
      "term_explanation": "Es informacion que abre cuentas o pagos: claves, codigos, tokens o PIN.",
      "options": ["Nombre del producto", "Clave, codigo de verificacion o PIN", "Horario de atencion", "Numero de pedido publico"],
      "correct": 1,
      "explanation": "El negocio debe enseñar que nunca se piden secretos digitales por llamada o chat."
    },
    {
      "question": "Si un empleado cayo en phishing, cual respuesta mejora la seguridad del negocio?",
      "term": "Aprendizaje sin culpa",
      "term_explanation": "Es corregir el error sin ocultarlo, para que todos aprendan y reporten a tiempo.",
      "options": ["Castigarlo y no investigar", "Cambiar claves, revisar accesos, guardar evidencia y capacitar", "Borrar el correo y seguir", "Desactivar internet para siempre"],
      "correct": 1,
      "explanation": "La respuesta correcta corrige el riesgo y enseña al equipo a reportar pronto."
    }
  ]$json$::jsonb,
  'manual',
  TRUE
),
(
  'EXAM_ROJO_NEGRO',
  'Examen para subir a cinturon negro',
  'Valida criterio integral para prevenir, responder, reportar y enseñar ciberseguridad a otros.',
  'El cinturon negro protege su entorno y ayuda a otros a decidir con claridad.',
  20,
  'red',
  750,
  $json$[
    {
      "question": "Un vecino recibio multa urgente, empleo con pago previo y prestamo facil. Que regla simple le enseñas?",
      "term": "Regla de pausa",
      "term_explanation": "Es detenerse antes de actuar cuando un mensaje mete apuro, miedo o promesa demasiado buena.",
      "options": ["Si urge, pagar rapido", "Pausar, no usar enlaces recibidos y verificar en canales oficiales", "Confiar si hay logo", "Responder para pedir explicaciones"],
      "correct": 1,
      "explanation": "La pausa corta el impulso que buscan los delincuentes."
    },
    {
      "question": "Debes explicar que hacer con una clave. Cual consejo es correcto para gente comun?",
      "term": "Clave unica",
      "term_explanation": "Es una clave que usas solo en una cuenta, no repetida en otros servicios.",
      "options": ["Usar la misma para recordar", "Usar claves unicas y activar verificacion en dos pasos cuando exista", "Compartirla con familiares", "Poner la fecha de nacimiento"],
      "correct": 1,
      "explanation": "Si una clave se filtra, las demas cuentas siguen protegidas cuando cada una tiene una clave diferente."
    },
    {
      "question": "Alguien pide ayuda porque ya entrego datos bancarios. Que orden recomiendas?",
      "term": "Prioridad",
      "term_explanation": "Es decidir que va primero para reducir el daño.",
      "options": ["Publicar en redes, luego llamar al banco", "Bloquear con el banco, cambiar claves, guardar pruebas y denunciar", "Esperar al lunes", "Borrar mensajes"],
      "correct": 1,
      "explanation": "Primero se corta el daño economico y de acceso; luego se conserva evidencia y se reporta."
    },
    {
      "question": "Como conviertes una noticia de ciberataque en aprendizaje para el Dojo?",
      "term": "Kata",
      "term_explanation": "En Ciber Dojo, un kata es un examen o practica guiada para demostrar una habilidad.",
      "options": ["Copiar titulares sin explicar", "Crear un caso simple, explicar terminos y preguntar que haria la persona", "Hacerlo tecnico y largo", "Usar solo miedo"],
      "correct": 1,
      "explanation": "Un buen kata usa lenguaje sencillo, explica terminos y entrena una decision concreta."
    }
  ]$json$::jsonb,
  'manual',
  TRUE
)
ON CONFLICT (kata_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  teaching = EXCLUDED.teaching,
  estimated_minutes = EXCLUDED.estimated_minutes,
  required_belt = EXCLUDED.required_belt,
  points_reward = EXCLUDED.points_reward,
  steps = EXCLUDED.steps,
  verification_type = EXCLUDED.verification_type,
  active = EXCLUDED.active;
