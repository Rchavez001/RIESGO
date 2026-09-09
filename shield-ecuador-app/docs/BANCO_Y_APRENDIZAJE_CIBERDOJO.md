# Banco y aprendizaje de ciberDojo

Adaptación del material proporcionado, versión 3.0.0, 9 de septiembre de 2026.

## Publicación en línea — 9 de septiembre de 2026

Publicado por solicitud del usuario en [ciberDojo](https://cyberdojo-61855290194.us-central1.run.app/dojos). Cloud Run sirve el 100 % del tráfico con la revisión `cyberdojo-00057-gip` del proyecto `polar-plate-499719-r1`, región `us-central1`. Se conserva la revisión anterior `cyberdojo-00056-wbz`.

Las migraciones 026 y 027 se aplicaron al proyecto Supabase conectado y se desplegó `complete-kata`. Una cuenta temporal verificó en producción: siete dojos, bloqueo sin entrenamiento, 30 respuestas guardadas, recuperación del progreso, examen privado de cinco casos, aprobación con cuatro aciertos y ascenso a amarillo con 250 puntos. Se eliminó la cuenta temporal al concluir.

La revisión se comprobó antes de activar el tráfico. Después se verificaron ambas direcciones públicas, las rutas de entrada y dojos, y la coincidencia exacta del archivo JavaScript con la compilación probada localmente. `scripts/stage_learning_release.py` prepara el contenedor sin credenciales; `scripts/verify_learning_web.py` verifica la publicación. `scripts/verify_learning_online.py` utiliza una cuenta temporal y requiere acceso administrativo para crearla y eliminarla.

## Resultado y alcance

El banco contiene **700 preguntas y 300 casos**, con cuatro opciones y una respuesta correcta por ejercicio. Está en `Banco de preguntas/optimizado/banco_700_preguntas_300_casos.json`, acompañado de dos exportaciones CSV para revisión editorial. Los archivos originales se conservan.

La aplicación tiene siete dojos, uno por cinturón. Cada persona recibe 30 preguntas del cinturón correspondiente, elegidas del banco completo y guardadas en su cuenta. El conjunto y el orden permanecen estables al salir, volver a entrar o cambiar de dispositivo. La selección combina diez preguntas de cada subnivel y favorece temas aún no tratados. Las listas de 30 incluidas en el catálogo son secuencias de referencia reproducibles; las asignaciones personales se guardan en `learning_progress`.

| Cinturón | Aprendizaje principal | Preguntas disponibles | Casos disponibles | Preguntas por dojo |
|---|---|---:|---:|---:|
| Blanco | Reconocer engaños, cuidar secretos y pedir ayuda | 140 | 60 | 30 |
| Amarillo | Proteger cuentas, compras y pagos | 140 | 60 | 30 |
| Naranja | Cuidar el celular, las instalaciones y los permisos | 91 | 39 | 30 |
| Verde | Proteger, compartir y recuperar información | 77 | 33 | 30 |
| Azul | Reconocer suplantaciones y engaños combinados | 105 | 45 | 30 |
| Marrón | Contener daños y recuperar accesos | 84 | 36 | 30 |
| Negro | Dar seguimiento, recuperar actividades y acompañar a otros | 63 | 27 | 30 |
| **Total** | | **700** | **300** | **210 por recorrido** |

La distribución conserva las 100 familias temáticas del material. No se agregan preguntas repetidas solo para lograr cantidades iguales por cinturón. El banco es mayor que un recorrido individual: permite variación entre personas y entre los intentos de examen.

## Análisis de las fuentes recibidas

- El documento Word presenta 100 preguntas de referencia sobre situaciones cotidianas y respuesta ante incidentes. Su enfoque ciudadano sirve como base temática. Algunas formulaciones requieren matices: una llamada con voz familiar no prueba identidad; un logotipo o una conexión cifrada no demuestran que una página sea honesta; una señal aislada de lentitud no confirma una infección.
- El JSON completo ya contenía 700 preguntas, 300 casos, 100 familias, explicaciones y glosario. Utilizaba cinco cinturones y una regla de 20 preguntas. Se adaptó a los siete cinturones de la aplicación y al requisito de 30.
- Los CSV contienen las mismas cantidades; la base SQLite contiene tablas de cinturones, preguntas, casos, metadatos y configuración. Se emplea el JSON como fuente reproducible para evitar mezclar representaciones del mismo banco.
- El archivo `preguntas_manual_supabase_payload.json` contiene 60 entradas para la integración anterior; no alcanza a cubrir los nuevos dojos.
- Se simplificaron **855 opciones incorrectas** que tenían al final otra afirmación incorrecta de la misma familia. El proceso solo elimina sufijos completos identificados en la fuente y conserva cuatro opciones diferentes y la respuesta correcta.
- La versión anterior de la aplicación reconstruía distractores genéricos, podía reemplazar un dojo por una sola pregunta y reiniciaba el cursor al entrar. También mostraba resultados del examen antes de poder leer la explicación final. Estas conductas se sustituyen por el flujo de aprendizaje descrito aquí.

## Criterios pedagógicos

1. **Comprender y reconocer:** lenguaje cotidiano, una decisión concreta, señales básicas.
2. **Aplicar:** usar lo aprendido en otro contexto, prevenir y comprobar antes de actuar.
3. **Responder y dar seguimiento:** decidir qué hacer después de un error o ante varias consecuencias. La dificultad aumenta por las decisiones que hay que combinar, no por vocabulario técnico.

Los escenarios incluyen labores de cocina, conducción, agricultura, comercio y trabajo de oficina. Las equivocaciones no quitan vidas ni bloquean el aprendizaje. Siempre se indica la respuesta recomendada y su explicación, con un mensaje de apoyo. No se exige memorizar siglas: cuando aparecen, el apartado «Palabras que te pueden ayudar» contiene su significado y una explicación sencilla. Las preguntas y explicaciones mantienen su texto íntegro; no se sustituyen opciones por distractores genéricos al mostrarlas.

No hay reloj obligatorio. La persona avanza después de leer la explicación; la pantalla no cambia automáticamente ni la tapa una celebración. Si sale después de responder, vuelve a esa pregunta con la respuesta y explicación visibles. Un fallo de conexión muestra un aviso y no se presenta como un guardado exitoso; hace falta conexión para confirmar la respuesta en la cuenta.

Los controles automáticos comprueban cantidades, identidades, opciones distintas, explicaciones, cobertura y orden. No equivalen a una validación pedagógica con participantes. Para el pilotaje se recomienda observar comprensión de instrucciones, interpretación de las cuatro opciones, capacidad de explicar con palabras propias la decisión y aplicación en una situación nueva; revisar los ejercicios que generen confusión antes de interpretar los resultados como evidencia de aprendizaje.

## Katas y ascenso

- El servidor exige las **30 preguntas respondidas**, no 30 aciertos. Abrir una URL directa tampoco evita este requisito.
- Cada intento contiene exactamente **cinco casos de cinco familias distintas**: subniveles **1, 1, 2, 2 y 3**. El quinto es el de mayor complejidad.
- Cada caso tiene igual peso. El umbral es 75 %; los porcentajes posibles son 0, 20, 40, 60, 80 y 100 %. Por tanto, se requieren **4 de 5 aciertos (80 %)**.
- Las respuestas enviadas quedan fijas. Se muestran las cinco explicaciones al finalizar, incluidas las de los errores y la del quinto caso.
- Los reintentos priorizan casos no vistos. No se vuelve a exigir completar el entrenamiento después de reprobar.
- El ascenso y 250 puntos se registran dentro de una transacción; repetir una solicitud no duplica premios. Revisar un cinturón anterior no reduce el actual. El kata negro concluye el recorrido, sin inventar un cinturón adicional ni una certificación profesional.

## Implementación y puesta en servicio

1. Aplicar `026_learning_progress.sql` y después `027_learning_bank_seed.sql` en Supabase, sobre la estructura existente hasta la migración 025. La primera crea almacenamiento privado, operaciones con sesión y protección del ascenso; la segunda carga el banco y el catálogo.
2. Actualizar la función `complete-kata` para cerrar la ruta de ascenso anterior.
3. Publicar la compilación del frontend que utiliza `learning_*`. Desplegar primero el servidor evita mostrar pantallas que dependan de funciones todavía inexistentes.
4. Verificar con una cuenta de prueba: pregunta respondida → salir → volver → misma explicación; bloqueo con 29; apertura con 30; resultado con 3/5 y con 4/5.

El código y las migraciones se preparan localmente. La comprobación con PostgreSQL temporal no aplica cambios al Supabase de producción. Los cinturones existentes se conservan. Como la pantalla anterior no guardaba el entrenamiento individual, no se inventan respuestas históricas: el nuevo registro comienza al entrar a cada dojo. Los intentos y preguntas guardan versión e identificadores; una futura edición del contenido debe crear una versión e identificadores nuevos para no alterar intentos ya iniciados.

El cliente no recibe el banco completo ni las respuestas correctas del examen abierto. Las tablas de progreso e intentos no admiten escritura directa de usuarios. La calificación, el requisito de entrenamiento y el ascenso se comprueban en el servidor.

El perfil y la barra de navegación sincronizan el cinturón y los puntos reales de la cuenta. El perfil explica que se asciende por el kata, no por alcanzar un total de puntos. Se conservan las demás modificaciones que ya existían en el proyecto.

## Reproducción y pruebas

```text
python scripts/build_learning_bank.py
python -m unittest discover -s tests -p test_learning_bank.py -v
```

En `frontend`: ejecutar TypeScript sin emisión, la compilación de producción y `LearningFlow.test.tsx` con el ejecutor de pruebas del proyecto. `tests/learning_database.sql` se ejecuta exclusivamente en una base PostgreSQL vacía y desechable: crea una estructura mínima de autenticación, carga las migraciones reales y prueba todos los cinturones. No ejecutar ese archivo de pruebas contra producción.

Validación realizada: tres pruebas del banco, cinco pruebas de interfaz, comprobación de tipos y pruebas SQL del requisito 29/30, recuperación del cursor, aislamiento entre cuentas, acceso privado al banco, reintentos, calificación 3/5 y 4/5, siete cinturones y repetición de solicitudes. La comprobación visual con Chromium verifica celular de 390 píxeles, ausencia de desbordamiento horizontal, reanudación al recargar y catálogo de escritorio. Utiliza respuestas de servidor simuladas y no envía datos a producción. Las capturas quedan en `test-results/learning-mobile.png` y `test-results/learning-dojos-desktop.png`.

La compilación de producción se genera con seis avisos de lint preexistentes en `VulnScanner`, `LandingPage`, `ResetPasswordPage` y `SenseiConsultPage`. El modo estricto que convierte avisos en errores sigue condicionado por esos avisos; no corresponden al nuevo flujo de aprendizaje.

Fuentes oficiales consultadas para contrastar criterios de la adaptación: [INCIBE, autenticación de doble y múltiple factor](https://www.incibe.es/ciudadania/blog/el-factor-de-autenticacion-doble-y-multiple), [Google, protección con verificación en dos pasos](https://support.google.com/accounts/answer/10956730?hl=es-419) y [Fiscalía de Ecuador, cómo hacer una denuncia](https://www.fiscalia.gob.ec/como-hacer-una-denuncia/). Las demás referencias incluidas en el banco se conservan como referencias del material recibido; no se presentan como una nueva verificación exhaustiva de cada enlace.
