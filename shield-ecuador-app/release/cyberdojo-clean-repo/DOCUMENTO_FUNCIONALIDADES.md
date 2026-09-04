usuarios no informaticos ecuatorianos para formar con un lenguje no informatico sobre la ciberseguridad a traves de un juego o entrenamiento tipo Dojo de Karate donde al ir contestando bien las preguntas de seguridad informatica va subiendo de cinturon. El sistema combina:

- frontend en React + TypeScript;
- autenticacion y base de datos en Supabase;
- funciones Edge para calculo de riesgo, recomendaciones con IA y analisis de correos sospechosos.

El enfoque funcional actual gira alrededor de cuatro ejes:

- registro e inicio de sesion;
- evaluacion adaptativa de riesgo;
- gamificacion con cinturones y katas;
- alertas y capacidades backend de apoyo para ciberseguridad.

## 2. Funcionalidades visibles e implementadas en el frontend

### 2.1 Autenticacion de usuarios

La aplicacion permite:

- iniciar sesion con correo y contrasena;
- iniciar sesion con magic link enviado por correo;
- registrar nuevos usuarios;
- cerrar sesion;
- mantener la sesion activa al recargar;
- cargar el perfil del usuario autenticado desde la tabla `users`.

Durante el registro se recopilan estos datos:

- nombre completo;
- correo electronico;
- contrasena;
- sector/tipo de negocio;
- autorizacion de tratamiento de datos.

Los sectores disponibles ya no viven como lista fija en el frontend. Se leen desde `business_sectors`, solo si `active = true`.

Sectores iniciales sembrados por migracion:

- `comerciante`: Comerciante;
- `restaurante`: Restaurante / Comida;
- `ferreteria`: Ferreteria;
- `farmacia`: Farmacia;
- `agricultor`: Agricultor;
- `pescador`: Pescador;
- `otro`: Otro.

Comportamientos adicionales:

- el boton `COMENZAR ENTRENAMIENTO` lleva al flujo de ingreso por correo;
- muestra mensajes de error traducidos para login invalido o correo ya registrado;
- el magic link usa Supabase Auth `signInWithOtp` con `shouldCreateUser = false`, mensaje neutral y callback `/auth/callback`;
- si el usuario es nuevo o no recibe enlace, la misma pantalla ofrece `Crear cuenta` sin revelar si el correo existe;
- exige sector de negocio en registro;
- valida el sector en `secure-register-user` contra `business_sectors`;
- crea perfil en la tabla `users` despues del alta en Supabase Auth.

### 2.1.1 Mantenimiento de sectores

El administrador puede mantener sectores desde el admin interno:

- crear un nuevo sector;
- editar codigo interno, nombre visible, orden y estado;
- inhabilitar un sector para que no aparezca en nuevos registros;
- guardar cambios mediante `save_business_sector`.

Cuando cambia el codigo interno de un sector, la funcion SQL actualiza:

- `business_sectors.code`;
- `users.business_type`;
- `alerts.target_business_types`.

## 2.2 Carga inicial y control de acceso

Al abrir la app:

- se valida si existe sesion activa;
- se muestra una pantalla de carga mientras se resuelve autenticacion;
- si no hay usuario autenticado, se redirige a la pantalla de login;
- si el usuario existe, entra al dashboard.

## 2.3 Dashboard principal

El dashboard muestra informacion central del usuario:

- nombre o correo;
- cinturon actual;
- nivel de riesgo actual;
- puntos acumulados;
- boton para iniciar o repetir evaluacion.

Tambien incorpora navegacion por pestañas:

- `Dojo`;
- `Katas`;
- `Alertas`.

### 2.3.1 Pestaña Dojo

Muestra:

- resumen de progreso;
- cantidad de katas completados;
- puntos ganados;
- mensaje motivacional del "Sensei".

### 2.3.2 Pestaña Katas

Permite:

- listar katas activas;
- ver nombre, descripcion, ensenanza, tiempo estimado, cinturon requerido y puntos;
- identificar si un kata ya fue completado;
- marcar un kata como completado.

Cuando se completa un kata:

- se inserta un registro en `kata_completions`;
- se invoca la Edge Function `complete-kata`;
- el servidor valida las respuestas contra `katas.steps`;
- se recalcula `users.total_points` desde `kata_completions.points_earned`;
- si aprueba, se actualiza el cinturon desde servidor;
- se refresca el perfil del usuario;
- la interfaz cambia el estado visual a completado.

### 2.3.3 Pestaña Alertas

Permite:

- consultar alertas activas desde la base de datos;
- mostrar las 5 alertas mas recientes;
- ver titulo, descripcion, severidad, fecha y fuente;
- presentar estados visuales por severidad;
- mostrar mensaje vacio si no hay alertas activas.

## 2.4 Evaluacion adaptativa de riesgo

La aplicacion incluye un cuestionario adaptativo que:

- arranca en la pregunta `A01`;
- obtiene cada pregunta desde la tabla `questions`;
- avanza segun `siguiente_pregunta` definida en cada opcion;
- termina automaticamente cuando llega a `FIN`;
- soporta rutas distintas segun la respuesta del usuario.

Capacidades del flujo:

- barra de progreso;
- conteo de preguntas respondidas;
- explicacion educativa despues de cada respuesta;
- alertas criticas inmediatas cuando una respuesta implica alto riesgo;
- transicion temporizada hacia la siguiente pregunta;
- pantalla de procesamiento final mientras se calcula el riesgo.

## 2.5 Calculo de resultado y almacenamiento de la evaluacion

Al finalizar el cuestionario:

- el frontend invoca la Edge Function `calculate-risk`;
- recibe puntaje total de riesgo, nivel de riesgo y detalle por vector;
- guarda la evaluacion en la tabla `evaluations`;
- actualiza el perfil del usuario con:
  - nivel de riesgo;
  - fecha de ultima evaluacion;
  - fecha de ultima evaluacion.

Nota importante:

- `calculate-risk` guarda el puntaje de riesgo en `evaluations.total_score`;
- `users.total_points` queda reservado para puntos de gamificacion;
- la suma de puntos se controla desde `complete-kata`, no desde el navegador.

## 2.6 Pantalla de resultados

Despues de la evaluacion se presenta:

- estado de evaluacion completada;
- cinturon obtenido;
- nivel de riesgo;
- puntaje de riesgo total;
- area mas debil;
- mensaje contextual segun el nivel de riesgo;
- detalle por vector con barras de progreso.

Vectores mostrados actualmente:

- `A`: Dispositivos;
- `B`: Contrasenas;
- `C`: Phishing;
- `I`: Tecnologia.

Ademas:

- el usuario puede volver al dashboard;
- existe un CTA de "Ver mis Katas recomendados", aunque hoy redirige al dashboard y no filtra recomendaciones especificas.

## 3. Funcionalidades backend desarrolladas

Estas capacidades existen en la base de datos y/o funciones Edge, aunque no todas estan conectadas al frontend actual.

### 3.1 Funcion Edge: `calculate-risk`

Responsabilidades:

- validar que exista un arreglo de respuestas;
- sumar `puntaje_riesgo` de cada respuesta;
- acumular puntajes por rama o vector;
- determinar nivel de riesgo;
- asignar cinturon;
- identificar el vector mas debil;
- devolver un resumen listo para la interfaz.
- guardar la evaluacion en `evaluations`;
- actualizar `users.current_risk_level` y `users.last_evaluation_at`.

Reglas de salida actuales:

- `>= 86`: riesgo `critico`, cinturon `white`;
- `>= 56`: riesgo `alto`, cinturon `yellow`;
- `>= 26`: riesgo `medio`, cinturon `orange`;
- `>= 11`: riesgo `bajo`, cinturon `green`;
- `< 11`: riesgo `bajo`, cinturon `brown`.

Observacion:

- la funcion ya no debe escribir `users.total_points`, porque ese campo representa puntos de gamificacion.
- la funcion tampoco debe reemplazar el cinturon gamificado del usuario; la progresion de cinturones se maneja con katas.

### 3.2 Funcion Edge: `complete-kata`

Responsabilidades:

- validar sesion del usuario;
- cargar la kata activa por `kata_code`;
- evaluar `selected_answers` contra `katas.steps`;
- aprobar con umbral de 75%;
- insertar o actualizar `kata_completions`;
- recalcular `users.total_points` como suma de puntos ganados;
- actualizar `users.belt` al siguiente cinturon si aprueba.

Motivo:

- evita que el frontend escriba directamente `users.belt`;
- evita manipulacion de puntos desde el navegador;
- mantiene separados los puntos del dojo y el puntaje de riesgo.

### 3.3 Funcion Edge: `generate-recommendations`

Capacidad backend disponible para:

- recibir un perfil de riesgo y tipo de negocio;
- generar un hash para cache;
- revisar si ya existe recomendacion en `recommendations_cache`;
- reutilizar resultados cacheados;
- consultar configuracion activa de IA desde `ai_configs`;
- usar una cadena de fallback entre modelos/proveedores;
- persistir la recomendacion generada en cache.

Secuencia de proveedores configurada:

- DeepSeek;
- Kimi;
- Claude.

Caracteristicas funcionales:

- timeout configurable;
- temperatura y max tokens configurables;
- prompt controlado para evitar alucinaciones;
- respuesta obligatoria en JSON estricto.

Estado actual:

- la funcion existe en backend;
- no se encontraron invocaciones desde el frontend actual.

### 3.4 Funcion Edge: `analyze-email`

Capacidad backend disponible para analizar correos sospechosos.

Entradas soportadas:

- correo del remitente;
- nombre visible del remitente;
- asunto;
- cuerpo;
- headers;
- URLs detectadas.

Analisis realizados:

- validacion de autenticacion del usuario por token;
- extraccion del dominio remitente;
- comparacion contra whitelist de dominios conocidos;
- deteccion de typosquatting con distancia Levenshtein;
- revision de SPF, DKIM y DMARC si vienen en headers;
- conteo de URLs sospechosas;
- deteccion de palabras clave tipicas de phishing;
- calculo de puntaje de amenaza;
- clasificacion como `seguro`, `sospechoso` o `peligroso`.

Tambien:

- guarda el resultado en la tabla `email_analysis`;
- devuelve recomendacion textual segun el veredicto.

Estado actual:

- la funcion existe en backend;
- no se encontraron pantallas o componentes que la usen hoy en el frontend.

## 4. Funcionalidades de datos y seguridad en Supabase

## 4.1 Modelo de datos principal

Tablas funcionales identificadas:

- `users`: perfil del usuario, cinturon, puntos, tipo de negocio, nivel de riesgo;
- `evaluations`: historial de evaluaciones y respuestas;
- `questions`: banco de preguntas adaptativas;
- `katas`: catalogo de ejercicios de entrenamiento;
- `kata_completions`: trazabilidad de katas completados;
- `alerts`: alertas de ciberseguridad;
- `email_analysis`: resultados de analisis de correos;
- `domains_whitelist`: dominios oficiales confiables;
- `alert_deliveries`: registro de entrega y apertura de alertas;
- `sponsors`: socios/comercios/servicios de apoyo;
- `ai_configs`: configuracion de modelos de IA;
- `recommendations_cache`: cache de recomendaciones generadas.

## 4.2 Seguridad con Row Level Security

El proyecto activa RLS en tablas sensibles y define politicas para que:

- cada usuario vea solo su propio perfil;
- cada usuario actualice solo su propio perfil;
- cada usuario inserte solo su propio perfil;
- cada usuario vea solo sus evaluaciones;
- cada usuario inserte solo sus evaluaciones;
- cada usuario vea solo sus completaciones de kata;
- cada usuario inserte solo sus completaciones de kata;
- cada usuario vea solo sus analisis de correo;
- cada usuario inserte solo sus analisis de correo;
- cada usuario vea solo sus entregas de alertas.

Tablas publicas de solo lectura para usuarios autenticados:

- `alerts` activas;
- `katas` activas;
- `questions` activas;
- `domains_whitelist` activos.

## 4.3 Seeds funcionales cargados

El proyecto ya trae datos de arranque para:

- preguntas del cuestionario;
- katas;
- whitelist de dominios ecuatorianos;
- configuracion IA por defecto;
- alertas de ejemplo.

## 5. Inventario funcional por modulo

### 5.1 Frontend

- Login y registro.
- Persistencia de sesion.
- Carga de perfil.
- Dashboard con progreso.
- Listado y completado de katas.
- Listado de alertas.
- Cuestionario adaptativo.
- Resultados de evaluacion.

### 5.2 Backend Supabase

- Autenticacion por email/password.
- Base de datos relacional para usuarios, evaluaciones, katas, alertas e IA.
- Politicas RLS.
- Funcion de calculo de riesgo.
- Funcion de recomendaciones con IA y cache.
- Funcion de analisis de email sospechoso.

## 6. Funcionalidades previstas o parcialmente implementadas

Se encontraron capacidades modeladas en backend pero no conectadas completamente en la interfaz actual:

- recomendaciones personalizadas con IA para mostrar al usuario;
- analizador de correos sospechosos en una pantalla dedicada;
- entrega y seguimiento de apertura de alertas (`alert_deliveries`);
- integracion de patrocinadores/tecnicos/servicios (`sponsors`);
- uso de `onboarding_completed`;
- uso de `prompt_version`, `ai_used` y tiempos de respuesta de IA en frontend;
- katas automaticos o con verificacion avanzada mas alla del marcado manual;
- filtrado de katas recomendados segun el resultado de la evaluacion;
- cinturon negro, definido en datos pero no asignado por la logica actual.

## 7. Observaciones de estado actual

### 7.1 Lo que si esta operativo en este workspace

- flujo completo de autenticacion;
- dashboard basico;
- evaluacion adaptativa end-to-end;
- calculo de riesgo mediante Edge Function;
- almacenamiento de evaluacion;
- consulta y marcado de katas;
- visualizacion de alertas.

### 7.2 Lo que existe tecnicamente pero no esta expuesto al usuario final

- generacion de recomendaciones con IA;
- analisis de phishing por correo;
- tracking de entregas de alertas;
- gestion funcional de sponsors.

### 7.3 Riesgos o inconsistencias funcionales detectadas

- revisar historicos antiguos donde `total_points` pudo haber sido usado como puntaje de riesgo;
- el CTA de katas recomendados no lleva a recomendaciones reales;
- la progresion completa de cinturones requiere tener aplicada la migracion `015_align_belt_progression_and_points.sql`;
- `supabase/config.toml` referencia `seed.sql`, pero los datos sembrados reales estan en `migrations/003_seed_data.sql`;
- el frontend no refleja varias capacidades backend ya construidas.

## 8. Conclusion ejecutiva

Shield Ecuador ya implementa un MVP funcional centrado en:

- autenticacion;
- evaluacion adaptativa de riesgo;
- gamificacion por cinturones y katas;
- visualizacion de alertas.

Adicionalmente, el backend ya tiene bases solidas para una siguiente fase con:

- recomendaciones personalizadas por IA;
- analisis de correos phishing;
- gestion de alertas mas avanzada;
- integracion de sponsors o tecnicos de apoyo.

En otras palabras, el proyecto no solo evalua riesgo: tambien esta preparado para evolucionar hacia una plataforma de acompanamiento y entrenamiento continuo en ciberseguridad para pequenos negocios ecuatorianos.
