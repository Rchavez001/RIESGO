# Paquete para asesoría legal — Módulo de consentimiento informado (CiberDojo)

**Para:** el abogado/a que revise el cumplimiento de la LOPDP (Ecuador) de este módulo.
**De:** equipo técnico de CiberDojo.
**Qué es esto:** un resumen en lenguaje simple (sin tecnicismos) de las decisiones que ya tomamos,
las que están pendientes, y los textos exactos que verá cada persona. Al final hay una lista
numerada de preguntas concretas que necesitamos que respondas antes de publicar esto en producción.

**Cómo exportar este documento a PDF:** si lo abres en Word, Google Docs o un editor de Markdown
(VS Code, Obsidian, etc.), usa la opción "Exportar a PDF" o "Imprimir → Guardar como PDF". También
se puede generar directamente desde la terminal con `pandoc PAQUETE_ASESORIA_LEGAL.md -o PAQUETE_ASESORIA_LEGAL.pdf`.

---

## 1. ¿Qué es este módulo?

Es la parte de la aplicación CiberDojo (una app educativa de ciberseguridad) que le pide permiso a
cada persona antes de usar sus datos, le explica para qué los usamos, y guarda la prueba de que
aceptó (o no). También permite que cualquier persona pida ver, corregir o borrar sus datos, o darse
de baja.

Hoy la aplicación ya existe y ya tiene usuarios registrados desde hace tiempo, pero **el aviso que
aceptaron esas personas en su momento era muy básico** (una sola frase, sin explicar casi nada —
ver sección 5). Este módulo nuevo reemplaza ese aviso por uno completo y añade el registro de
evidencia (quién aceptó qué, cuándo, y desde dónde).

---

## 2. Texto completo del aviso 1.0 (lo que verá cada persona al registrarse)

**Importante:** este texto tiene espacios marcados `{{así}}` que el sistema completa
automáticamente con los datos reales antes de mostrarlo (por ejemplo, el nombre del responsable).
Varios de esos espacios todavía NO tienen un valor real cargado. El sistema técnicamente no permite
publicar este aviso mientras queden espacios sin completar, así que antes de salir a producción
alguien debe llenarlos con los datos reales.

Dentro de la cita de abajo, cada vez que aparece una línea en *cursiva* que empieza con "*Nota
para asesoría legal: …*", es una aclaración nuestra para ti — **nunca** es texto que la persona
vaya a leer en la aplicación. El resto (texto normal, sin cursiva) es exactamente lo que verá
quien se registre.

> ### Consentimiento informado y privacidad
>
> **CiberDojo · Información previa al registro**
> Versión {{version}} · Vigente desde {{fecha_vigencia}} · Ecuador
>
> *Nota para asesoría legal: la versión y la fecha de vigencia las completa el sistema
> automáticamente al publicar — no son un dato pendiente de decisión, solo un valor que todavía no
> existe porque el aviso no se ha publicado.*
>
> Tu privacidad también es parte de nuestro entrenamiento. Aprende ciberseguridad con información
> clara sobre tus datos y con control sobre tus decisiones.
>
> #### 1. ¿Quién es responsable de tus datos?
>
> CiberDojo es una iniciativa educativa sin fines de lucro que acerca la ciberseguridad a personas
> con distintos niveles de conocimientos tecnológicos.
>
> *Nota para asesoría legal: la frase "sin fines de lucro" de este párrafo debe validarse contra el
> modelo económico real del proyecto — ver la sección 9 de este documento, "Contexto del
> responsable del tratamiento".*
>
> - **Responsable legal:** {{responsable_nombre}}
> - **Domicilio legal:** {{responsable_domicilio}}
> - **Teléfono:** {{responsable_telefono}}
> - **Correo para privacidad y baja:** {{correo_privacidad}}
> - **Delegado de protección de datos:** {{dpo_contacto}}
>
> *Nota para asesoría legal: los cinco campos de arriba son marcadores `{{...}}` que hoy NO tienen
> ningún valor real cargado — el sistema no permite publicar el aviso mientras sigan vacíos. Ver la
> sección 9 de este documento para el contexto de quién debería aparecer aquí.*
>
> #### 2. ¿Qué datos se tratarán y para qué?
>
> Los datos que entregues y los generados al utilizar la plataforma se incorporarán a la base de
> datos de usuarios de CiberDojo. Se recopilarán, organizarán, almacenarán, consultarán y
> actualizarán para las finalidades informadas; al finalizar su conservación se eliminarán o
> anonimizarán según corresponda.
>
> - **Cuenta y aprendizaje:** nombre, correo, credenciales de autenticación, respuestas, resultados,
>   progreso y cinturones, para administrar tu acceso y registrar tu entrenamiento.
> - **Seguridad:** registros técnicos estrictamente necesarios para proteger la cuenta y mantener
>   el funcionamiento del servicio.
> - **Preferencias opcionales:** correo para novedades educativas y sector económico declarado
>   para personalizar publicidad, únicamente si autorizas cada finalidad.
>
> El registro ordinario no debe solicitar datos sensibles. Los campos obligatorios se identificarán
> en el formulario; no entregar los datos indispensables impedirá crear o mantener la cuenta. Los
> datos incorrectos pueden dificultar el acceso o la recuperación de tu cuenta. Rechazar finalidades
> opcionales no impedirá tu entrenamiento.
>
> #### 3. Base legal y decisiones opcionales
>
> En este modelo se solicita tu consentimiento para crear la cuenta y registrar tu aprendizaje, así
> como autorizaciones independientes para novedades y publicidad personalizada. Cualquier
> tratamiento sustentado en otra base legal deberá identificarse por finalidad en la política
> definitiva; una autorización general no habilita usos adicionales.
>
> La publicidad personalizada utilizará el sector económico que declares para seleccionar anuncios
> de auspiciantes. Puedes rechazarla o retirar ese permiso sin perder tu cuenta. Este consentimiento
> no autoriza entregar tus datos identificables a auspiciantes ni venderlos.
>
> #### 4. Inteligencia artificial y proveedores
>
> CiberDojo utiliza herramientas de inteligencia artificial para apoyar sus funciones educativas.
> Sus agentes pueden consultar, según la configuración, modelos de OpenAI, Anthropic (Claude),
> Moonshot AI (Kimi), DeepSeek u otros proveedores. Mencionarlos no significa que todos reciban
> datos personales.
>
> Antes de habilitar el envío de datos personales a servicios externos, la política debe identificar
> los proveedores efectivos, los datos enviados, las finalidades, los países o destinos y las
> garantías aplicables. La autorización de registro no equivale a un permiso ilimitado para
> compartir información con cualquier IA. Evita introducir datos sensibles o información personal
> de terceros en las consultas.
>
> La política definitiva debe explicar si existen perfiles o decisiones exclusivamente automatizadas,
> sus efectos y los mecanismos de revisión humana que correspondan.
>
> *Nota para asesoría legal: el siguiente párrafo es texto nuevo propuesto por el equipo técnico,
> todavía no aprobado. Para más contexto sobre el envío de correos a través de Resend, ver la
> sección 7 de este documento.*
>
> Para enviarte confirmaciones, avisos sobre solicitudes de derechos y códigos de verificación,
> CiberDojo utiliza el proveedor de correo transaccional Resend, con sede en Estados Unidos.
> Enviarte estos mensajes implica una transferencia internacional de tu dirección de correo
> electrónico y del contenido del mensaje a ese proveedor, bajo sus garantías contractuales de
> protección de datos.
>
> #### 5. Conservación y seguridad
>
> Los datos de cuenta y aprendizaje se conservarán mientras mantengas tu cuenta y sean necesarios
> para las finalidades informadas. Tras la baja se eliminarán o anonimizarán los datos que
> corresponda; cualquier conservación excepcional deberá tener una base legal y un plazo
> justificado.
>
> *Nota para asesoría legal: los plazos exactos de conservación todavía no están decididos — es
> una propuesta técnica sin validar, ver la sección 4 de este documento.*
>
> CiberDojo deberá mantener medidas técnicas y organizativas de protección, acceso restringido y
> gestión segura de credenciales. No debe almacenar contraseñas en texto legible ni solicitar que
> las envíes por correo.
>
> #### 6. Tus derechos
>
> Puedes ejercer gratuitamente tus derechos de acceso, rectificación y actualización, eliminación,
> oposición, suspensión del tratamiento y portabilidad, cuando corresponda; también revocar el
> consentimiento y ejercer los derechos relativos a decisiones basadas únicamente en valoraciones
> automatizadas.
>
> Puedes dirigir tus solicitudes a {{correo_privacidad}} o desde la sección **Mi privacidad** de tu
> cuenta. Si consideras que tus derechos han sido vulnerados o no recibes respuesta en el plazo
> legal, puedes reclamar ante la Superintendencia de Protección de Datos Personales: spdp.gob.ec.
>
> #### 7. ¿Cómo solicitar la baja?
>
> Desde **Mi privacidad → Solicitar baja**, o escribiendo a **{{correo_privacidad}}** con el asunto
> **{{asunto_baja}}**. Indica tu nombre, el correo asociado a tu cuenta y que deseas cancelar la
> cuenta y solicitar la eliminación de tus datos.
>
> Se verificará tu identidad de manera proporcional y segura. Si hace falta información para
> tramitar formalmente el derecho, se te indicará cómo completarla. No envíes contraseñas. La
> eliminación se atenderá en el plazo legal de {{plazo_respuesta_dias}} días de recibida la
> solicitud, conforme al artículo 15 de la LOPDP, considerando las excepciones legales y las reglas
> aplicables a solicitudes que requieran aclaración.
>
> *Nota para asesoría legal: a diferencia de los plazos de la sección 4 (todavía sin validar), este
> de 15 días calendario SÍ ya está decidido (días calendario, no hábiles — es la opción conservadora,
> siempre vencen antes que 15 días hábiles) y configurado como valor por defecto del sistema.*
>
> La baja implica perder el acceso a la cuenta y al progreso asociado que se elimine. Si algún dato
> debe conservarse por una obligación legal, se informará la razón y el período aplicable. Puedes
> retirar solo los permisos opcionales sin cancelar tu cuenta.
>
> La revocación no requiere justificación ni afecta la licitud de los tratamientos anteriores. El
> tratamiento que dependa del consentimiento revocado se suspenderá una vez recibida la
> notificación.
>
> #### 8. Declaración y autorizaciones separadas
>
> He recibido información sobre los datos tratados, las finalidades, su conservación, los
> destinatarios, mis derechos y los canales para ejercerlos. Comprendo las consecuencias de
> entregar o no entregar los datos y puedo consultar la Política de Privacidad completa antes de
> decidir.
>
> *Nota para asesoría legal: la "Política de Privacidad completa" que este párrafo menciona
> **todavía no está redactada** — hoy no existe ningún documento al que ese enlace pueda apuntar.
> Este aviso que estás revisando es, por ahora, el único texto de privacidad real de la
> aplicación.*
>
> *Nota para asesoría legal: el siguiente párrafo es texto nuevo propuesto por el equipo técnico,
> todavía no aprobado. Para más contexto sobre el registro de la IP como evidencia, ver la sección
> 6 de este documento; el plazo de 730 días (2 años) es la propuesta sin validar de la sección 4.*
>
> Para demostrar tu decisión, CiberDojo registrará la fecha y hora, la versión de este aviso, cada
> autorización que otorgues o rechaces y la dirección IP y el navegador desde los que lo hiciste.
> Esta información se guarda cifrada, solo puede consultarla personal autorizado de privacidad y la
> dirección IP se elimina transcurridos {{retencion_ip_dias}} días.
>
> Las autorizaciones se muestran como casillas separadas y desmarcadas (definidas en las finalidades
> de esta versión).
>
> #### 9. Niñas, niños y adolescentes
>
> Para menores de 15 años se requiere consentimiento del representante legal. Desde los 15 años el
> adolescente puede otorgar consentimiento explícito con información comprensible para su edad. El
> tratamiento de datos sensibles y las decisiones basadas en valoraciones automatizadas de menores
> requieren consentimiento expreso de su representante legal, conforme al artículo 19 del
> Reglamento.
>
> *Nota para asesoría legal: sobre este punto ya decidimos, a nivel técnico, bloquear el registro de
> quien declare tener menos de 15 años y mostrarle un mensaje para que un adulto responsable escriba
> al correo de privacidad — no se guarda fecha de nacimiento ni ningún otro dato de la persona
> menor. Ver la pregunta 13 de la sección 10 de este documento: necesitamos que confirmes si esto
> es suficiente para el artículo 19 del Reglamento.*

**Las tres casillas que la persona debe marcar o dejar sin marcar al registrarse:**
1. **Registro y aprendizaje** (obligatoria): "Autorizo el tratamiento de los datos estrictamente
   necesarios para crear y administrar mi cuenta y registrar mi progreso educativo, conforme a este
   aviso y a la Política de Privacidad."
2. **Opcional · Novedades**: "Deseo recibir por correo información sobre actividades,
   capacitaciones y novedades educativas de CiberDojo."
3. **Opcional · Publicidad personalizada**: "Autorizo el uso de mi sector económico declarado para
   seleccionar publicidad de auspiciantes dentro de CiberDojo."

Si la persona no marca la casilla 1 (obligatoria), no puede crear la cuenta. Las casillas 2 y 3 son
opcionales: puede dejarlas sin marcar y de todas formas registrarse.

---

## 3. Texto provisional del aviso para quienes "prueban sin crear cuenta" (invitados)

La aplicación permite entrar a practicar sin registrarse ("modo invitado"). Esa persona no da su
nombre ni correo, pero sí queda un registro de progreso en la base de datos, así que antes de
activar ese modo invitado le mostramos un aviso corto. **Este texto es un borrador del equipo
técnico, NO un texto final** — está marcado explícitamente dentro de la propia aplicación como
"[PENDIENTE DE VALIDACIÓN LEGAL]" para que nadie lo confunda con un texto ya aprobado:

> **[PENDIENTE DE VALIDACIÓN LEGAL]**
>
> Como invitado puedes practicar el primer dojo sin crear una cuenta. Registramos que aceptaste
> este aviso (fecha y dirección IP, cifradas) y tu sesión de invitado caduca automáticamente tras
> un tiempo de inactividad. No enviamos tus datos a ningún proveedor de inteligencia artificial.
> Si creas una cuenta más adelante, verás el aviso completo de privacidad antes de registrarte.

Esta ventana aparece con dos botones: "Cancelar" y "Continuar como invitado", y un enlace para leer
el aviso completo de la sección 2. Si la persona no hace clic en "Continuar como invitado", nunca
se crea la sesión de invitado ni se guarda nada de ella.

**Lo que necesitamos de ti para este punto:** un texto corto (2-4 frases) que reemplace el de
arriba, igual de claro para alguien sin conocimientos técnicos, que cubra lo mismo: qué se guarda,
que no se manda a ninguna IA, y que la sesión caduca sola.

---

## 4. Qué datos se guardan y por cuánto tiempo (propuesta técnica, sin validar)

El equipo técnico armó una propuesta de plazos de conservación, pero **ninguno de estos números está
decidido ni aprobado legalmente todavía** — son solo lo que usamos como valor de referencia mientras
se construye el sistema. Necesitamos que los revises y nos digas si corresponde cambiarlos:

| Qué dato | Propuesta (sin validar) | Por qué existe este dato |
|---|---|---|
| Dirección IP y navegador de quien aceptó (o rechazó) el aviso, cifrados | **2 años** desde la decisión (730 días) | Sirve como evidencia de que la aceptación vino de verdad de esa persona, en caso de un reclamo o auditoría |
| Evidencia de consentimiento, después de que la persona se da de baja | **5 años**, guardada de forma que ya no se puede volver a asociar al nombre de la persona ("seudonimizada") | Para poder demostrar, incluso después de la baja, que en su momento sí hubo un consentimiento válido |
| Bitácora de acciones administrativas (quién publicó qué aviso, quién cambió una configuración, etc.) | **5 años** | Para poder reconstruir qué pasó si alguna vez hay que investigar un reclamo o un error |
| Solicitudes de acceso/baja/corrección que alguien envía | **5 años** desde que se cierra el caso | Para poder demostrar que se respondió a tiempo y cómo se resolvió |

**Lo que necesitamos de ti para este punto:** confirmar si estos 4 plazos son razonables para la
LOPDP ecuatoriana, o decirnos qué plazo correcto usar en cada caso. Mientras no nos contestes, no
activamos el borrado/anonimización automático de ninguno de estos datos en producción.

---

## 5. La decisión de pedirle a TODO el mundo que acepte el aviso nuevo

**El problema:** las personas que ya tenían cuenta antes de este módulo solo aceptaron, hace
tiempo, una frase muy simple (sin firma digital, sin fecha de aceptación guardada con detalle, sin
IP, sin explicar quién es el responsable ni por cuánto tiempo se guardan sus datos):

> "Autorizo el tratamiento de mis datos personales para fines internos de la aplicación, incluyendo
> registro, gestión de usuario, operación del servicio y clasificación estadística durante la
> vigencia de mi uso de la aplicación."

De esa aceptación antigua solo tenemos la fecha en que ocurrió — nada más. No hay copia guardada
del texto exacto que esa persona vio en pantalla (lo reconstruimos leyendo versiones antiguas del
código de la aplicación).

**Lo que decidimos hacer con eso:**
1. Guardamos esa aceptación antigua como un "historial" — una nota que dice "esta persona aceptó
   algo en esa fecha, pero con las limitaciones de arriba (sin IP, sin separar finalidades, etc.)".
   No inventamos ningún dato que no exista.
2. La próxima vez que cada una de esas personas inicie sesión, verá el aviso nuevo completo (el de
   la sección 2) y tendrá que aceptarlo para seguir usando la cuenta — exactamente igual que
   alguien que se registra por primera vez hoy.
3. A quien no haya autorizado nunca nada (cuentas muy antiguas sin ningún registro de aceptación)
   no le inventamos ninguna autorización: simplemente, cuando entre, verá el aviso nuevo como si
   fuera la primera vez.
4. Las casillas opcionales (novedades, publicidad) nunca se marcan automáticamente para nadie:
   cada persona debe elegirlas ella misma, aunque antes hubiera algún tipo de autorización general.

**Esta decisión ya se tomó a nivel técnico, pero está anotada como "pendiente de que asesoría legal
confirme que es suficiente ante la LOPDP"** — por eso está en este paquete. No es una pregunta de
"qué deberíamos hacer técnicamente" (eso ya está resuelto), sino de "¿esto es legalmente válido o
hace falta algo más?".

---

## 6. Por qué registramos la dirección IP como evidencia

Cuando alguien acepta o rechaza el aviso, además de guardar "aceptó / no aceptó" guardamos **la
hora exacta y la dirección IP** desde la que lo hizo. La idea es poder demostrar, si alguna vez hay
un reclamo o una disputa ("yo nunca acepté esto"), que la aceptación vino de verdad de un
dispositivo conectado en ese momento — no es una prueba perfecta de identidad, pero es la evidencia
técnica estándar para este tipo de casos.

Detalles que pueden importarte para evaluar esto:
- La IP se guarda **cifrada**, nunca en texto plano. Solo el personal con el rol más alto del panel
  de administración puede pedir "revelarla" — y cuando lo hace, esa acción también queda anotada en
  la bitácora (quién la reveló, cuándo y por qué).
- Para el personal administrativo normal, la IP se muestra "tapada" (por ejemplo `192.0.2.xxx` en
  vez de la dirección completa).
- La persona titular de los datos (quien aceptó el aviso) **nunca puede ver su propia IP guardada**,
  ni siquiera cifrada — solo ve que aceptó, cuándo, y qué versión del aviso.
- Como se explicó en la sección 4, la propuesta (sin validar todavía) es borrar la IP automáticamente
  después de 2 años.
- Si alguien intenta enviar una dirección IP falsa desde su propio navegador (manipulando la
  aplicación), el sistema la ignora por completo: la IP que se guarda siempre es la que detecta
  nuestro propio servidor, nunca un dato que el navegador de la persona pueda inventar.

**Lo que necesitamos de ti para este punto:** confirmar si guardar la IP de esta manera (cifrada,
con acceso restringido, revelación registrada) es una práctica válida y proporcional para este
propósito bajo la LOPDP, o si hace falta ajustar algo (por ejemplo, un plazo de conservación
distinto, o un texto más explícito en el aviso).

---

## 7. Transferencia internacional de datos: el proveedor de correo (Resend)

Para enviar los correos automáticos de la aplicación (confirmaciones, avisos de que alguien pidió
la baja, códigos de verificación), usamos un servicio llamado **Resend**, que es una empresa con
sede en **Estados Unidos**.

Esto significa que, cada vez que la aplicación le envía un correo a alguien, la **dirección de
correo de esa persona y el contenido del mensaje** pasan por los servidores de Resend en Estados
Unidos antes de llegar a su bandeja de entrada. Eso es, técnicamente, una **transferencia
internacional de datos personales**.

Lo que ya existe hoy:
- El texto del aviso (sección 2, punto 4) ya menciona esto, pero está marcado como "texto nuevo,
  pendiente de que tú lo revises" — todavía no es definitivo.
- Resend tiene sus propias garantías contractuales de protección de datos (cláusulas estándar,
  certificaciones, etc.), pero no hemos verificado formalmente con un abogado si esas garantías
  son suficientes para cumplir con la LOPDP ecuatoriana específicamente.
- Existe una alternativa (usar un servidor de correo de una institución ecuatoriana en vez de
  Resend) que todavía no se ha decidido si se va a usar.

**Lo que necesitamos de ti para este punto:** decirnos si usar Resend (con sede en EE. UU.) para
estos correos es aceptable bajo la LOPDP, qué debe decir exactamente el aviso sobre esta
transferencia, y si hace falta algún documento o cláusula adicional con Resend.

---

## 8. Dónde se guardan los datos y quién los procesa

Para que tengas el cuadro completo de "quién toca los datos personales" (más allá de CiberDojo
como responsable), aquí están los cuatro proveedores externos que participan, con qué hace cada
uno y si recibe datos personales o no:

| Proveedor | Qué hace | ¿Dónde está? | ¿Recibe datos personales? |
|---|---|---|---|
| **Supabase** | Guarda toda la base de datos de la aplicación (cuentas, progreso, evidencia de consentimiento, todo) | Región **us-west-1** (Norte de California, Estados Unidos) | **Sí, todos los datos personales que existen en la aplicación** — es donde vive la base de datos completa |
| **Google Cloud Run** | Hospeda el sitio web y el panel de administración (el código que la gente visita en el navegador) | Región **us-central1** (Iowa, Estados Unidos) | **Sí** — por ahí pasa cada solicitud que alguien hace desde su navegador, aunque no guarda los datos de forma permanente ahí (eso lo hace Supabase) |
| **Resend** | Envía los correos automáticos (confirmaciones, avisos de baja, códigos de verificación) — ver sección 7 | Estados Unidos | **Sí** — recibe la dirección de correo de la persona y el contenido de cada mensaje que se le envía |
| **Proveedores de inteligencia artificial** (OpenAI, Anthropic/Claude, Moonshot/Kimi, DeepSeek, según cuál esté configurado) | Generan contenido educativo y dan respuestas en algunas secciones de la app | Fuera de Ecuador (cada proveedor tiene sus propios países/servidores) | **Depende de la función** — ver el detalle abajo |

**Detalle de qué le llega a cada agente de inteligencia artificial** (esto lo revisamos directamente
en el código de la aplicación; está marcado como *según revisión del código; pendiente de confirmar
en la configuración de producción*, porque una revisión de código no sustituye una auditoría formal
del entorno real):
- **Buscador de noticias, generador de preguntas a partir de noticias, y revisor de esas
  preguntas:** trabajan solo con noticias públicas de internet. No reciben ningún dato de ninguna
  persona usuaria.
- **"Sensei" (el asistente que responde dudas de ciberseguridad):** recibe únicamente el texto que
  la persona escribe en su pregunta. No se le envía su nombre, correo ni ningún identificador —
  pero si la persona decide escribir un dato personal dentro de su propia pregunta (por ejemplo,
  "mi correo es nombre@ejemplo.com, ¿es seguro?"), eso sí llegaría al proveedor de IA, porque el
  sistema no revisa ni bloquea el contenido de lo que la persona escribe.
- **Agente que resume los registros internos de seguridad para el equipo administrativo:** le
  enviamos una lista de eventos de seguridad con fecha, el nombre del endpoint, el tipo de evento,
  la severidad y un campo de "metadata" (información adicional variable según el evento). **No** le
  enviamos la dirección IP de nadie ni el identificador de ningún usuario — esas columnas
  explícitamente no se incluyen en lo que se le manda a la IA. El campo "metadata" revisado hoy en
  el código solo contiene códigos internos (por ejemplo, "motivo: límite de intentos superado"),
  nunca un correo, nombre o IP sin cifrar — pero esto no está garantizado por ningún control
  automático: es el resultado de revisar cada uno de los 17 lugares del código que escriben ese
  campo hoy, no una regla que impida agregar un dato personal ahí en el futuro.
- **Estadísticas compartidas con cualquier proveedor de IA:** siempre son agregadas (totales,
  promedios), nunca datos de una persona identificable.

**Lo que necesitamos de ti para este punto:** confirmar si Supabase, Google Cloud Run y Resend
deben tratarse como **transferencias internacionales** y como **encargados del tratamiento**
(empresas que procesan datos personales por cuenta de CiberDojo, no como un tercero independiente),
y si hace falta un contrato o cláusula específica con cada uno más allá de sus términos de servicio
estándar.

---

## 9. Contexto del responsable del tratamiento

Esto no está en el aviso todavía (son justo los campos marcados como pendientes en la sección 2),
pero te lo explicamos aquí para que tengas el contexto completo antes de decirnos qué poner:

- **CiberDojo es un proyecto educativo cuyos derechos de uso para Ecuador se ceden al club Phycom
  de la ESPOL** (Escuela Superior Politécnica del Litoral). Quien firma este documento es el autor
  original de la aplicación y actúa, además, como consultor del proyecto.
- **Modelo económico:** proyecto educativo cuyos derechos para Ecuador se ceden al club Phycom de
  la ESPOL; se financia con donaciones y venta de publicidad de auspiciantes dentro de la app, y la
  utilidad neta se reparte entre el club y el autor.
- Como se señaló en la sección 2, el aviso actual dice que CiberDojo es una "iniciativa educativa
  **sin fines de lucro**" — esa frase necesita validarse contra el modelo económico real de arriba
  (que incluye publicidad pagada y reparto de utilidad), porque podría no ser exacta.

**Lo que necesitamos de ti para este punto:**
1. Con esta estructura (cesión de derechos a un club universitario, financiamiento con donaciones y
   publicidad, reparto de utilidad entre el club y el autor), ¿quién debería figurar como
   "responsable del tratamiento" en el aviso: el club Phycom, el autor a título personal, ambos, o
   depende de algo que todavía no hemos definido?
2. ¿La frase "sin fines de lucro" del aviso actual debe cambiarse o eliminarse dado este modelo
   económico?

---

## 10. Preguntas concretas que necesitamos que respondas

1. Los datos del responsable legal y del delegado de protección de datos (nombre, domicilio,
   teléfono, correo) — sección 2 de este documento — ¿quién debe aparecer ahí exactamente, dado el
   contexto de la sección 9 (cesión de derechos al club Phycom de la ESPOL, rol del autor como
   consultor)? ¿La organización, una persona específica, el club, o una combinación?
2. ¿Cuál es la base legal correcta para la cuenta y el tratamiento de datos de aprendizaje: el
   consentimiento (como está planteado hoy en el aviso) o una relación contractual/de prestación de
   un servicio educativo? ¿Cambia esto algo de lo que ya construimos?
3. ¿Es obligatorio, bajo la LOPDP, designar formalmente un delegado de protección de datos para un
   proyecto de este tamaño y naturaleza, o es opcional?
4. ¿Este proyecto necesita un registro de actividades de tratamiento, una evaluación de impacto de
   protección de datos, o un registro ante la Superintendencia de Protección de Datos Personales
   (SPDP) antes de publicarse?
5. Los dos párrafos marcados "texto nuevo, pendiente de que tú lo revises" (sobre el uso de
   inteligencia artificial/Resend, y sobre el registro de evidencia con IP) — sección 2, puntos 4 y
   8 — ¿los apruebas tal como están, o necesitan cambios?
6. Los 4 plazos de conservación de la sección 4 (IP/UA: 2 años; evidencia tras baja: 5 años;
   bitácora: 5 años; solicitudes: 5 años) — ¿son correctos, o cuáles deberían ser?
7. ¿Es válido, bajo la LOPDP, tratar el consentimiento antiguo (una sola frase, sin IP, de hace
   tiempo) como "historial limitado" y pedirle a todos que acepten el aviso nuevo en su próximo
   inicio de sesión (sección 5), en vez de borrar esas cuentas o tratarlas de otra forma?
8. El texto provisional del aviso para invitados (sección 3) — ¿qué debería decir exactamente el
   texto definitivo?
9. ¿Es aceptable guardar la dirección IP cifrada como evidencia de consentimiento, con las
   condiciones de acceso descritas en la sección 6, o hace falta ajustar algo?
10. ¿Es aceptable usar Resend (con sede en Estados Unidos) para el correo transaccional de la
    aplicación bajo las condiciones descritas en la sección 7, y qué debe decir el aviso al
    respecto?
11. Para Supabase, Google Cloud Run y Resend (sección 8) — como encargados del tratamiento con
    transferencia internacional — ¿qué cláusulas mínimas necesitamos tener con cada uno más allá de
    sus términos de servicio estándar?
12. ¿Qué procedimiento y plazo debemos seguir para notificar una vulneración de seguridad de datos
    personales (a la SPDP y/o a las personas afectadas), y a partir de qué tipo de incidente aplica
    esa obligación?
13. El bloqueo del registro para menores de 15 años (sección 2, punto 9) — mostrando solo un mensaje
    para que un adulto escriba al correo de privacidad, sin pedir fecha de nacimiento ni ningún otro
    dato — ¿es una forma válida de cumplir con el artículo 19 del Reglamento, o hace falta algo más?
14. La frase "sin fines de lucro" del aviso (sección 2, punto 1) frente al modelo económico real
    (sección 9: donaciones + publicidad de auspiciantes + reparto de utilidad) — ¿debe cambiarse, y
    con qué texto?
15. La "Política de Privacidad completa" que el aviso menciona (sección 2, punto 8) todavía no
    existe como documento — ¿debemos redactarla antes de publicar el aviso, o puede publicarse el
    aviso primero y la política completa después?
16. ¿Hay algún otro requisito de la LOPDP o su Reglamento que no esté reflejado en el texto del
    aviso (sección 2) y que debamos agregar antes de publicarlo?
17. Una vez que respondas las preguntas anteriores, ¿necesitas revisar una versión final del texto
    completo antes de que se publique, o con tus respuestas a este documento es suficiente?

---

*Este documento lo generó el equipo técnico a partir del código real de la aplicación (no es una
descripción aproximada): cada texto citado en las secciones 2 y 3 es exactamente el que vería una
persona usando la aplicación hoy. Cualquier duda sobre cómo funciona algo técnicamente, contáctanos
directamente antes de responder.*

