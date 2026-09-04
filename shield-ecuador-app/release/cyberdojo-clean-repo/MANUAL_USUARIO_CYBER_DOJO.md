# Manual Completo - Cyber Dojo: Aplicación de Entrenamiento en Ciberseguridad

## Tabla de Contenidos

1. [Introducción](#introducción)
2. [Registro e Inicio de Sesión](#registro-e-inicio-de-sesión)
3. [Dashboard Principal](#dashboard-principal)
4. [Sistema de Cinturones y Progreso](#sistema-de-cinturones-y-progreso)
5. [Dojos - Temas de Entrenamiento](#dojos---temas-de-entrenamiento)
6. [Katas - Simulaciones Prácticas](#katas---simulaciones-prácticas)
7. [Exámenes de Validación](#exámenes-de-validación)
8. [Sistema de Puntos y Recompensas](#sistema-de-puntos-y-recompensas)
9. [Sensei IA - Consultas Inteligentes](#sensei-ia---consultas-inteligentes)
10. [Alertas y Notificaciones](#alertas-y-notificaciones)
11. [Perfil de Usuario](#perfil-de-usuario)
12. [Tabla de Posiciones](#tabla-de-posiciones)
13. [Configuración y Ayuda](#configuración-y-ayuda)

---

## Introducción

Cyber Dojo es una plataforma interactiva de entrenamiento en ciberseguridad diseñada especialmente para pequeñas y medianas empresas (MIPYMEs) ecuatorianas.

**Objetivo:** Enseñar prácticas seguras a través de un sistema gamificado de cinturones y katas (simulaciones prácticas).

**¿Para quién es?**
- Empleados de empresas sin conocimiento técnico previo
- Dueños de negocios que quieren mejorar seguridad
- Cualquier persona interesada en ciberseguridad básica

**Características principales:**
- Explicaciones claras y sencillas (sin jerga técnica innecesaria)
- Simulaciones prácticas y realistas
- Sistema de progresión por cinturones
- Mentor de IA (Sensei) disponible 24/7
- Alertas sobre amenazas actuales
- Comunidad con tabla de posiciones

**¿Cuánto tiempo toma?**
- Entrenamiento completo: 30-60 horas
- Por sesión: 15-30 minutos recomendados

---

## Registro e Inicio de Sesión

### Crear una Cuenta

**Paso 1: Ir a la pantalla de registro**

Haz clic en **"¿No tienes cuenta? Regístrate aquí"** en la pantalla de inicio.

**Paso 2: Completa el formulario**

| Campo | Descripción | Ejemplo |
|-------|------------|---------|
| **Nombre completo** | Tu nombre real | Juan Pérez |
| **Correo electrónico** | Tu email válido | juan@miempresa.ec |
| **Contraseña** | Mínimo 8 caracteres | MySecurePass123! |
| **Confirmar contraseña** | Repite la contraseña | MySecurePass123! |
| **Tipo de negocio** | Selecciona el tuyo | Restaurante |

**Tipos de negocio disponibles:**
- Comerciante
- Restaurante
- Ferretería
- Farmacia
- Agricultor
- Pescador
- Otro

**Paso 3: Validaciones**

El sistema verifica:
- ✓ Email válido (contiene @)
- ✓ Contraseña suficientemente fuerte (8+ caracteres)
- ✓ Contraseñas coinciden
- ✓ Email no está ya registrado

**Paso 4: Confirmar registro**

1. Haz clic en **"Crear cuenta"**
2. Se te redirige al login automáticamente
3. Recibe email de confirmación (opcional)

### Iniciar Sesión

**Opción 1: Con correo y contraseña**

1. Ingresa tu correo en el campo **"Correo"**
2. Ingresa tu contraseña en el campo **"Contraseña"**
3. Haz clic en **"Iniciar sesión"**
4. Se valida tu cuenta en Supabase
5. Se carga tu perfil y ubicación
6. Eres redirigido al Dashboard

**Opción 2: Recuperar contraseña**

Si olvidaste tu contraseña:

1. Haz clic en **"¿Olvidaste tu contraseña?"**
2. Ingresa tu correo
3. Se envía link de recuperación a tu email
4. Haz clic en el link
5. Establece nueva contraseña
6. Intenta iniciar sesión nuevamente

**Manteniendo la sesión activa**

La app recuerda tu sesión:
- Si cierras el navegador, sigues dentro
- Se sincroniza entre dispositivos si usas la misma cuenta
- Puedes cerrar sesión en cualquier momento

### Problemas de Login

**"Email no registrado"**
- Verifica que escribiste bien el correo
- Asegúrate de haber completado el registro
- Intenta registrarte nuevamente

**"Contraseña incorrecta"**
- Verifica que escribiste bien la contraseña
- Sensibilidad: Mayúscula/minúscula importa
- Usa "Recuperar contraseña" si la olvidaste

**"Otro error"**
- Verifica conexión a Internet
- Intenta en modo incógnito (elimina cookies)
- Limpia cache del navegador

---

## Dashboard Principal

### Pantalla de Inicio

Cuando ingresas, ves el **Dashboard** con:

```
┌─────────────────────────────────────────────┐
│  ¡Bienvenido, Juan!                         │
│                                              │
│  Tu Cinturón: AMARILLO (⚡ 45% → Verde)      │
│  Riesgo Actual: MEDIO-BAJO (↓ Mejorando)   │
│  Puntos Totales: 2,450 pts                  │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │ Continuar con Dojo: Mensajes Falsos    │ │
│  │ [Botón: COMENZAR LECCIÓN]              │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  ┌──────────┬──────────┬──────────────────┐ │
│  │ 📚 DOJOS │ 🥋 KATAS │ 🚨 ALERTAS       │ │
│  └──────────┴──────────┴──────────────────┘ │
└─────────────────────────────────────────────┘
```

### Información del Dashboard

| Elemento | Descripción |
|----------|------------|
| **Bienvenida personalizada** | Muestra tu nombre |
| **Cinturón actual** | Tu nivel de avance y % hacia el siguiente |
| **Nivel de riesgo** | Evaluación de tu estado de ciberseguridad |
| **Puntos totales** | Acumulados en todo el sistema |
| **Dojo activo** | Tema que estás entrenando actualmente |
| **Botón Comenzar** | Para iniciar la siguiente lección |

### Pestañas Principales

Accede a tres áreas principales:

#### 1. 📚 DOJOS
Visualiza todos los temas de entrenamiento disponibles.

#### 2. 🥋 KATAS
Observa las simulaciones prácticas que has completado y las pendientes.

#### 3. 🚨 ALERTAS
Recibe notificaciones sobre amenazas actuales de ciberseguridad.

---

## Sistema de Cinturones y Progreso

### Los 8 Cinturones del Camino

Cyber Dojo utiliza un sistema de cinturones similar al karate, con progresión clara:

| Cinturón | Color | Progreso | Examen | Requisito Pts |
|----------|-------|----------|--------|---------------|
| 1. **Blanco** | ⚪ Blanco | 20% | Fundamentos | 0 pts |
| 2. **Amarillo** | 🟡 Amarillo | 15% | Reglas básicas | 200 pts |
| 3. **Naranja** | 🟠 Naranja | 10% | Equipos y cuentas | 400 pts |
| 4. **Verde** | 🟢 Verde | 5% | Acceso | 500 pts |
| 5. **Azul** | 🔵 Azul | 5% | Información | 550 pts |
| 6. **Morado** | 🟣 Morado | 5% | Cuidado | 600 pts |
| 7. **Rojo** | 🔴 Rojo | 5% | Respuesta a problemas | 650 pts |
| 8. **Negro** | ⚫ Negro | 35% | Revisión integral | 1000+ pts |

### Cómo Subes de Cinturón

**Para cada cinturón necesitas:**

1. **Completar katas del nivel**
   - Resuelve todas las simulaciones prácticas
   - Entiende los conceptos

2. **Acumular puntos**
   - Responde preguntas correctamente
   - Completa simulaciones
   - Ayuda a otros usuarios (bonus)

3. **Pasar el examen**
   - Responde 10-20 preguntas de validación
   - Calificación mínima: 70%
   - Puedes intentar ilimitadamente

4. **Demostrar conocimiento**
   - El sistema evalúa tu progresión
   - Se otorga el nuevo cinturón automáticamente

### Visualización del Progreso

En tu perfil ves:

```
Blanco ░░░░░░░░░░ 100% ✓ COMPLETADO
Amarillo ░░░░░░░░░░ 45% ← TÚ AQUÍ (2450/5000 pts)
Naranja ░░░░░░░░░░ 0% Bloqueado
Verde ░░░░░░░░░░ 0% Bloqueado
...
```

### Bonificación por Avance Rápido

Si completas un cinturón en menos de 7 días:
- +100 puntos de bonificación
- +50 puntos extra si completas en 3 días
- El tiempo no afecta tu aprobación, solo bonifica puntos

---

## Dojos - Temas de Entrenamiento

### ¿Qué es un Dojo?

Un Dojo es un **tema de entrenamiento** enfocado en un aspecto específico de ciberseguridad.

**Analogía:** Si la ciberseguridad es un arte marcial, cada Dojo es un estilo diferente.

### Dojos Disponibles

#### 1. 🔴 Mensajes Falsos y Correo Seguro

**¿De qué trata?**
Aprende a identificar correos fraudulentos, mensajes de phishing y suplantación de identidad.

**Lo que aprenderás:**
- Señales de un correo sospechoso (urgencia falsa, solicitudes de dinero)
- Cómo verificar si un remitente es real
- Acciones seguras cuando recibes un mensaje dudoso
- Dónde reportar correos maliciosos

**Nivel recomendado:** Blanco (principiante)

**Tiempo estimado:** 2-3 horas

**Ejemplo de lección:**
```
Recibiste un correo que dice:
"¡URGENTE! Tu cuenta bancaria será bloqueada. 
Ingresa aquí para verificar: link-falso.com"

¿Qué haces?
A) Haces clic en el link inmediatamente ✗
B) Ignoras el correo pero tienes dudas ✗
C) Llamas al banco por teléfono oficial para verificar ✓
D) Reenvías a tus amigos para avisar ✗
```

#### 2. 🟠 Contraseñas y Verificación en Dos Pasos

**¿De qué trata?**
Protege tus cuentas con contraseñas fuertes y un segundo nivel de seguridad.

**Lo que aprenderás:**
- Cómo crear contraseñas que no puedan adivinar
- Qué es verificación en dos pasos (código del celular)
- Uso seguro de gestores de contraseñas
- Cuándo cambiar contraseña

**Nivel recomendado:** Amarillo

**Tiempo estimado:** 2-3 horas

**Explicaciones claras:**
- **Gestor de contraseñas:** Una aplicación que guarda tus claves de forma segura y las completa automáticamente. No tienes que recordarlas todas.
- **Verificación en dos pasos:** Además de tu contraseña, debes ingresar un código que recibes por SMS en tu celular.

#### 3. 🟡 Copias de Seguridad y Recuperación

**¿De qué trata?**
Protege tus datos importantes contra pérdida, robo o bloqueo por ransomware.

**Lo que aprenderás:**
- Importancia de tener copias de seguridad
- Dónde guardar copias (nube segura, disco externo)
- Cómo restaurar desde una copia
- Plan de recuperación ante desastre

**Nivel recomendado:** Naranja

**Tiempo estimado:** 2-3 horas

**Ejemplo:**
```
Tu negocio sufre un ataque ransomware.
Los archivos se cifran y piden dinero para desbloquear.

¿Qué haces?
A) Pagas el rescate ✗
B) No tienes backup, pierdes todo ✗
C) Restauras desde backup segura que tenías ✓
```

### Estructura de un Dojo

Cada Dojo contiene:

#### 📖 Lecciones
Textos educativos sobre el tema, explicados de forma simple.

#### ❓ Preguntas de Evaluación
50 preguntas totales por Dojo:
- 20 preguntas manuales (escritas por expertos)
- 30 preguntas generadas por IA (adaptadas)

Las preguntas cubren:
- Conceptos básicos
- Identificación de problemas
- Toma de decisiones
- Respuesta ante emergencias

#### 🥋 Katas Asociadas
Simulaciones prácticas relacionadas con el tema.

#### 📊 Progreso
Muestra qué % del Dojo has completado.

### Seleccionar un Dojo

1. Ve a la pestaña **"DOJOS"**
2. Ves la lista de todos los temas disponibles
3. Haz clic en el que quieres comenzar
4. Se carga la primera lección
5. Puedes pausar/reanudar en cualquier momento

### Cambiar de Dojo

1. Desde el Dashboard, selecciona otro Dojo
2. Tu progreso anterior se guarda
3. Puedes entrenar múltiples Dojos simultáneamente

---

## Katas - Simulaciones Prácticas

### ¿Qué es una Kata?

Una Kata es una **simulación práctica** basada en un escenario real de ciberseguridad.

**Objetivo:** Practicar tu respuesta ante situaciones peligrosas en un ambiente seguro.

### Estructura de una Kata

```
Nama: "Identificar un correo de phishing"
Cinturón: Blanco (principiante)
Tiempo: 10 minutos
Puntos: 50 pts

ESCENARIO:
Trabajas en un restaurante. Recibes un email con asunto:
"URGENTE: Problema con cuenta Bancaria - Acción requerida"

El email dice: "Tu cuenta ha sido comprometida. 
Haz clic aquí para verificar tu identidad: link-dudoso.com"

TAREAS:
1. Identifica 3 señales de que es un email falso
2. Describe qué harías en realidad
3. Explica por qué es importante no hacer clic

RESPUESTAS ESPERADAS:
✓ Señal 1: Urgencia falsa (presión temporal)
✓ Señal 2: Solicitud de verificación por email (bancos no piden esto)
✓ Señal 3: Enlace sospechoso (no del banco oficial)

Tu respuesta: "Llamaría al banco por teléfono oficial 
para verificar si hay problema real."

PUNTOS OBTENIDOS: 50/50 - ¡Excelente!
CINTURÓN: +1 hacia Verde
```

### Tipos de Katas

#### 1. 🔍 Identificación
Reconoce amenazas en situaciones cotidianas.

**Ejemplo:** "¿Qué está mal en este correo?"

#### 2. 🛡️ Protección
Implementa medidas de seguridad.

**Ejemplo:** "¿Cuál es la contraseña más segura?"

#### 3. 🚨 Respuesta
Actúa correctamente ante un problema.

**Ejemplo:** "Tu computadora está lenta y muestra pop-ups. ¿Qué haces?"

#### 4. 📚 Investigación
Documenta y reporta correctamente.

**Ejemplo:** "Alguien intenta acceder a tu cuenta. ¿Dónde y cómo lo reportas?"

### Hacer una Kata

**Paso 1: Seleccionar Kata**

1. Ve a la pestaña **"KATAS"**
2. Ves lista de Katas disponibles
3. Lee el nombre, descripción y tiempo estimado
4. Haz clic en "Comenzar Kata"

**Paso 2: Leer el Escenario**

Cuidadosamente lee la situación presentada.

**Paso 3: Responder Preguntas**

El sistema puede pedir:
- Respuestas de opción múltiple (A, B, C, D)
- Identificación de problemas
- Explicación de tu decisión

**Paso 4: Validación**

El sistema valida:
- Tu respuesta es correcta
- Entiendes el concepto
- Sumas puntos si es correcto

**Paso 5: Retroalimentación**

Recibes:
- Puntos ganados
- Explicación de por qué esa es la respuesta correcta
- Consejo de seguridad adicional

### Ejemplo Completo de Kata

```
KATA: "Gestión de Contraseña Comprometida"

ESCENARIO:
Cambias de laptop. En la antigua quedó guardada una contraseña 
en el navegador. Alguien más accede a esa computadora.

PREGUNTA 1:
¿Qué debería haber hecho ANTES de dejar la computadora?

A) Nada, las contraseñas guardadas son seguras
B) Borrar el historial del navegador
C) Limpiar el cache pero dejar contraseñas
D) Cerrar sesión y limpiar datos del navegador ✓

TU RESPUESTA: D

RESULTADO: ✓ CORRECTO
Explicación: Es importante limpiar todo al dejar una computadora. 
Las contraseñas guardadas pueden ser fácil acceso para otros usuarios 
del mismo equipo.

Puntos: +50
Progreso Cinturón: +2%
```

### Kata vs. Examen

| Aspecto | Kata | Examen |
|--------|------|--------|
| **Objetivo** | Practicar | Validar |
| **Intentos** | Ilimitados | Máximo 3 |
| **Penalización** | No hay | Esperar 24h si repruebas |
| **Calificación** | Progresiva | Pase/No pase (70%) |
| **Puntos** | Se cuentan todos | Si pasas |

---

## Exámenes de Validación

### ¿Qué es un Examen?

Un Examen es la **prueba final** para subir de cinturón.

Debes demostrar que comprendiste completamente el tema.

### Requisitos para Tomar un Examen

1. **Completar todas las Katas del cinturón**
2. **Acumular puntos mínimos**
3. **Pasar validación de conocimiento**

### Estructura del Examen

```
EXAMEN: "Validación Cinturón Amarillo"
Cinturón: Amarillo → Verde
Duración: 30 minutos
Preguntas: 15 preguntas de opción múltiple
Puntuación mínima: 70% (10-11 preguntas correctas)
```

### Durante el Examen

**Instrucciones:**
1. Se muestra cronómetro (30 minutos)
2. Ves una pregunta a la vez
3. No puedes retroceder
4. No puedes usar ayudas externas
5. Ambiente tranquilo recomendado

**Tipo de preguntas:**

- Conceptos clave (¿Qué es verificación en dos pasos?)
- Análisis de situaciones (¿Qué haces si...?)
- Identificación de problemas (¿Cuál es el riesgo?)
- Decisiones estratégicas (¿Cuál es la mejor medida?)

### Después del Examen

**Si apruebas (70%+):**
```
¡FELICIDADES! ¡HAS ASCENDIDO!

Tu nuevo cinturón: VERDE ✅
Puntos ganados: +200
Certificado generado
```

Recibes:
- ✓ Nuevo cinturón
- ✓ Puntos de bonificación
- ✓ Certificado descargable
- ✓ Acceso a siguiente nivel

**Si repruebas (<70%):**
```
No alcanzaste el 70% requerido (obtuviste 65%)

Puntuación: 9.75/15

Próximo intento disponible en 24 horas.
Recomendamos repasar las lecciones.
```

Puedes:
- Repasar lecciones y katas
- Consultar al Sensei IA
- Intentar nuevamente mañana
- Máximo 3 intentos, luego esperas 7 días

### Consejos para Pasar Exámenes

1. **Completa todas las Katas primero**
   - Refuerza el aprendizaje
   - Ganas puntos para el siguiente cinturón

2. **Lee cuidadosamente cada pregunta**
   - No apresures las respuestas
   - Piensa en la situación real

3. **Usa la retroalimentación de Katas**
   - Aprende de errores pasados
   - Entiende conceptos, no memorices

4. **Tómate tu tiempo**
   - 30 minutos para 15 preguntas = 2 min por pregunta
   - Usa todo el tiempo disponible

5. **Sé honesto**
   - No uses ayudas externas
   - El examen te enseña dónde necesitas mejorar

---

## Sistema de Puntos y Recompensas

### Cómo Ganas Puntos

| Actividad | Puntos | Detalles |
|----------|--------|---------|
| Completar Kata fácil | 25 pts | Cinturón Blanco |
| Completar Kata moderada | 50 pts | Cinturón Amarillo |
| Completar Kata difícil | 100 pts | Cinturón Rojo/Negro |
| Pasar Examen | +200 pts | Por nuevo cinturón |
| Bonificación rápida | +100 pts | Si completas en < 7 días |
| Ayudar otro usuario | +10 pts | Responder correctamente |
| Racha de días activos | +5 pts | Por cada día consecutivo |

### Tus Puntos Totales

Se muestran en:
- Dashboard (parte superior)
- Perfil de usuario
- Tabla de posiciones
- Historial de logros

### Recompensas por Hito

Cuando alcanzas puntos específicos:

| Puntos | Recompensa |
|--------|-----------|
| 500 pts | 🏆 Logro: "Primer paso" |
| 1000 pts | 🥉 Medalla de bronce |
| 2500 pts | 🥈 Medalla de plata |
| 5000 pts | 🥇 Medalla de oro |
| 10000 pts | 👑 Experto en ciberseguridad |

### Racha de Actividad

Mantén tu consistencia:

- **Día 1-3:** "Iniciado" 🔥
- **Día 4-7:** "Comprometido" 🔥🔥
- **Día 8-14:** "Dedicado" 🔥🔥🔥
- **Día 15+:** "Maestro" 🔥🔥🔥🔥

Cada día consecutivo activo suma +5 puntos.
Si no ingresas un día, se reinicia.

---

## Sensei IA - Consultas Inteligentes

### ¿Quién es Sensei?

**Sensei** es un mentor de Inteligencia Artificial disponible 24/7 para responder tus preguntas sobre ciberseguridad.

```
          👾 SENSEI 👾
      El Maestro Digital
      
"Soy tu tutor en ciberseguridad.
Puedo explicar conceptos, responder 
dudas y guiarte en tu camino."
```

### Acceder a Sensei

1. Desde cualquier pantalla, haz clic en **"💬 Hablar con Sensei"**
2. Se abre una ventana de chat
3. Escribe tu pregunta en lenguaje natural
4. Sensei responde en segundos

### Tipos de Preguntas

#### ✅ Preguntas que Sensei Puede Responder

- "¿Qué es un gestor de contraseñas?"
- "¿Cómo reconozco un correo de phishing?"
- "¿Qué debo hacer si creo que mi cuenta fue hackeada?"
- "¿Cuál es la contraseña más segura?"
- "¿Necesito verificación en dos pasos?"
- "¿Cómo hago una copia de seguridad?"

#### ❌ Preguntas Fuera de Alcance

- "¿Cuál es la respuesta de la Kata 5?"
- Preguntas sin relación con ciberseguridad
- Solicitudes de ayuda para hacer trampas

### Conversación con Sensei

**Ejemplo:**

```
TÚ: "¿Qué es un gestor de contraseñas y por qué lo necesito?"

SENSEI: "Excelente pregunta. Un gestor de contraseñas 
es una aplicación segura que:

1. GUARDA tus contraseñas de forma cifrada
2. COMPLETA automáticamente al ingresar a una cuenta
3. GENERA contraseñas fuertes y únicas para cada sitio
4. SINCRONIZA entre tus dispositivos

¿Por qué lo necesitas?

✓ No tienes que recordar 50+ contraseñas
✓ Usas contraseñas más fuertes (no simplificas)
✓ Proteges contra phishing (el gestor solo 
   completa en sitios legítimos)

Opciones seguras:
- Bitwarden (gratis)
- 1Password (pago, pero muy seguro)
- KeePass (gratis, local)"

TÚ: "¿Cuál me recomiendas para empezar?"

SENSEI: "Recomiendo Bitwarden porque:
- Es gratis
- Muy fácil de usar
- Sincroniza entre dispositivos
- Confiable para pequeños negocios"
```

### Evaluación de Respuestas

Después de que Sensei responde:

1. Ves la respuesta
2. Marcas si fue **"Útil"** o **"No útil"**
3. Sensei aprende de tu feedback

### Sentimiento Detectado

Sensei monitorea:
- Si entendiste la respuesta
- Si quedaste satisfecho
- Si necesitas más clarificación

Si detecta confusión, ofrece ejemplos adicionales.

### Limitaciones

Sensei es una IA, no humana:
- A veces da respuestas generales
- Puede no captar contexto complejo
- Para casos graves, recomienda experto humano

**Cuándo contactar soporte humano:**
- Tu cuenta fue comprometida
- Sospechas de delito cibernético
- Situación de emergencia

---

## Alertas y Notificaciones

### ¿Qué son las Alertas?

Las **Alertas** son notificaciones sobre amenazas actuales de ciberseguridad.

Te ayudan a:
- Entender amenazas recientes
- Practicar con casos reales
- Mejorar tus defensas

### Acceder a Alertas

1. Ve a la pestaña **"ALERTAS"** en el Dashboard
2. O haz clic en el ícono 🚨

### Tipos de Alertas

#### 1. 🔴 Alertas Críticas
Amenazas muy serias y recientes.

**Ejemplo:**
```
Vulnerabilidad crítica en WordPress encontrada

La semana pasada se descubrió una vulnerabilidad 
que afecta a millones de sitios web. Los hackers 
ya la están usando.

¿Qué hacer si tu negocio usa WordPress?
- Actualiza inmediatamente
- Cambia todas tus contraseñas de admin
- Instala plugin de seguridad
- Haz copia de seguridad antes de actualizar
```

#### 2. 🟠 Alertas Importantes
Amenazas generales que afectan muchos negocios.

**Ejemplo:**
```
Aumento de emails phishing dirigidos a restaurantes

En el último mes, hemos visto 50% más intentos 
de phishing contra negocios de comida.

Los atacantes:
- Suplantaban proveedores de pago
- Solicitaban datos bancarios urgentemente
- Amenazaban con cortar servicio

Cómo protegerte:
1. No hagas clic en enlaces de correos "urgentes"
2. Verifica con proveedor por teléfono
3. Revisa email de proveedor en lista de contactos
```

#### 3. 🟡 Alertas Informatativas
Novedades útiles de seguridad.

**Ejemplo:**
```
Nueva mejor práctica: Autenticación sin contraseña

Cada vez más sitios permiten ingresar sin contraseña.
¿Cómo? Reciben código en tu celular.

Ventajas:
✓ Más seguro (el atacante no conoce tu teléfono)
✓ Más rápido (no tienes que recordar contraseña)
✓ Funciona bien si te hackean

Busca opciones "Ingresa sin contraseña" en cuentas importantes.
```

### Preguntas Generadas de Alertas

Con cada alerta, el sistema genera preguntas de práctica:

```
ALERTA: "Nueva vulnerabilidad en navegadores"

PREGUNTA GENERADA:
"Recibes notificación de que tu navegador 
tiene una actualización de seguridad urgente.

¿Qué haces primero?"

A) Ignoras porque estás ocupado
B) Cierras la notificación
C) Actualizas inmediatamente
D) Esperas a más tarde ✓ (correcta)

Explicación: Las actualizaciones de seguridad 
son críticas. Deberías hacerlas tan pronto como 
sea práctico, preferiblemente hoy mismo.
```

### Configurar Alertas

En tu perfil, puedes elegir:
- **Frecuencia:** Diaria / Semanal / Solo críticas
- **Temas:** Selecciona qué amenazas te interesan
- **Notificaciones:** Email / SMS / En-app

---

## Perfil de Usuario

### Acceder a tu Perfil

1. Haz clic en tu nombre (esquina superior derecha)
2. O haz clic en el ícono 👤
3. Se abre tu página de perfil

### Información en tu Perfil

```
┌─────────────────────────────────────┐
│ JUAN PÉREZ                          │
│ juan@restaurante.ec                 │
│                                     │
│ 🥇 Cinturón: AMARILLO (45% avance)  │
│ 📊 Puntos: 2,450 pts                │
│ 📚 Dojos completados: 1/3           │
│ 🥋 Katas completados: 8/20          │
│ 🔥 Racha de días: 7 días activos    │
│                                     │
│ Tipo de negocio: Restaurante        │
│ Fecha de registro: 15/03/2026       │
│ Última sesión: Hoy 14:30            │
│                                     │
│ [Editar Perfil] [Cambiar Contraseña]│
└─────────────────────────────────────┘
```

### Editar Perfil

Puedes cambiar:
- Nombre completo
- Tipo de negocio
- Foto de perfil
- Preferencias de notificaciones

### Cambiar Contraseña

1. Haz clic en **"Cambiar Contraseña"**
2. Ingresa contraseña actual
3. Ingresa nueva contraseña (mínimo 8 caracteres)
4. Confirma nueva contraseña
5. Haz clic **"Guardar cambios"**

**Consejos:**
- Usa combinación de mayúscula, minúscula, números, símbolos
- No uses información personal (tu nombre, fecha nacimiento)
- No reutilices contraseñas de otras cuentas

### Historial de Logros

Se muestra:
- 🏆 Medallas obtenidas
- 🎖️ Certificados descargables
- 📜 Exámenes pasados con fecha
- 🌟 Hitos alcanzados

### Exportar Certificados

Cuando completas un cinturón:

1. Se genera certificado
2. Haz clic **"Descargar Certificado"**
3. Se descarga en PDF
4. Puedes imprimirlo o compartirlo en LinkedIn

---

## Tabla de Posiciones

### Acceder a Tabla de Posiciones

1. Desde el Dashboard, haz clic en **"POSICIONES"**
2. O desde el perfil, haz clic en **"Ver ranking"**

### Estructura

```
TABLA DE POSICIONES - CIBERSEGURIDAD

Posición │ Usuario          │ Cinturón │ Puntos  │ Racha
────────┼──────────────────┼──────────┼─────────┼───────
  🥇 1   │ Ana Paredes      │ ⚫ Negro │ 12,450  │ 45 días
  🥈 2   │ Luis Mora        │ 🔴 Rojo  │ 9,280   │ 22 días
  🥉 3   │ Rosa Vera        │ 🔴 Rojo  │ 8,950   │ 18 días
  4      │ Carlos Gómez     │ 🔵 Azul  │ 5,300   │ 12 días
  5      │ María López      │ 🔵 Azul  │ 5,100   │ 8 días
  ...
  42     │ JUAN PÉREZ       │ 🟡 Amarillo │ 2,450 │ 7 días
```

### Filtros

Puedes ver ranking por:
- **General:** Todos los usuarios
- **Por Cinturón:** Solo Amarillo, Verde, etc.
- **Por Tipo de Negocio:** Restaurantes, Comercios, etc.
- **Por Mes:** Este mes, últimos 3 meses, año

### Tu Posición

Se destaca tu fila:
- Ves dónde estás en el ranking
- Cuántos puntos te faltan para subir posición
- Cómo va tu racha comparada con otros

### Competencia Amigable

La tabla fomenta:
- Motivación para continuar entrenando
- Comunidad de aprendizaje
- Reconocimiento de esfuerzo

**Nota:** No es una competencia deshonesta. Los datos se usan solo con propósitos motivacionales.

---

## Configuración y Ayuda

### Configuración General

Ve a **Configuración** (engranaje ⚙️) para:

| Opción | Descripción |
|--------|------------|
| **Notificaciones** | Elige qué notificaciones recibir |
| **Idioma** | Español / Inglés |
| **Tema** | Claro / Oscuro |
| **Privacidad** | Control de datos personales |
| **Ayuda** | Preguntas frecuentes |

### Notificaciones

**Tipos de notificaciones:**
- ✉️ Email cuando subes de cinturón
- 📱 SMS para alertas críticas
- 🔔 En-app para cualquier actualización
- 🚨 Push para alertas de seguridad

Puedes desactivar cualquiera sin problema.

### Centro de Ayuda

Haz clic en **"❓ Ayuda"** para acceder a:

- **Preguntas Frecuentes (FAQ)**
  - ¿Cómo funciona el sistema de cinturones?
  - ¿Qué pasa si no paso un examen?
  - ¿Cómo uso el gestor de contraseñas?

- **Tutoriales en Video**
  - Cómo comenzar
  - Cómo completar Katas
  - Cómo hablar con Sensei

- **Contacto con Soporte**
  - Formulario de contacto
  - Correo: support@cyberdojo.ec
  - Teléfono: +593 2 1234567

### Cerrar Sesión

1. Haz clic en tu nombre (esquina superior derecha)
2. Selecciona **"Cerrar sesión"**
3. Se limpia la sesión
4. Vuelves a pantalla de login

Para volver a entrar, usa tu correo y contraseña nuevamente.

### Eliminar Cuenta

**Advertencia:** Esta acción es irreversible.

1. Ve a **Configuración → Privacidad**
2. Haz clic en **"Eliminar cuenta"**
3. Confirma tu decisión
4. Se borran todos tus datos:
   - Puntos
   - Cinturón
   - Katas completados
   - Historial

No se puede recuperar después.

---

## Troubleshooting - Solución de Problemas

### No puedo iniciar sesión

**"Email no registrado"**
1. Verifica que escribiste bien el correo
2. Intenta registrarte si no tienes cuenta
3. Usa "Recuperar contraseña"

**"Contraseña incorrecta"**
1. Verifica mayúscula/minúscula
2. Intenta "Recuperar contraseña"
3. Copia/pega contraseña (evita errores de tipeo)

**"Otro error"**
1. Cierra el navegador completamente
2. Abre modo incógnito
3. Intenta nuevamente

### La app está lenta

1. Verifica tu conexión a Internet
2. Cierra otras pestañas/aplicaciones
3. Limpia cache del navegador (Ctrl+Shift+Delete)
4. Intenta en otro navegador

### No veo mis puntos/progreso

1. Recarga la página (F5)
2. Haz clic "Refrescar" si hay botón
3. Cierra sesión y vuelve a entrar
4. Espera 5 minutos (datos se sincronizan)

### No puedo completar una Kata

1. Lee el escenario cuidadosamente
2. Asegúrate de entender qué se pregunta
3. Intenta nuevamente
4. Si sigues con duda, pregunta a Sensei IA

### No recibo alertas

1. Ve a Configuración → Notificaciones
2. Verifica que están activadas
3. Revisa tu email de spam
4. Permite notificaciones del navegador

### ¿Perdí mi cinturón?

No, tu cinturón se guarda permanentemente. Una vez que lo obtienes, es tuyo para siempre.

Si crees que hay error, contacta a soporte.

---

## Mejores Prácticas

### Para Máximo Aprendizaje

1. **Dedica tiempo regular**
   - 15-30 minutos diarios
   - Mejor que maratones ocasionales

2. **Completa Katas antes de examen**
   - No saltes directamente al examen
   - Las Katas enseñan más

3. **Lee explicaciones completas**
   - No solo busques respuestas correctas
   - Entiende el "por qué"

4. **Consulta al Sensei**
   - Preunta cuando no entiendas
   - Valida tu comprensión

5. **Aplica en tu negocio**
   - Implementa medidas que aprendas
   - Comparte con tu equipo

### Seguridad Personal

1. **Usa contraseña fuerte**
   - Mínimo 8 caracteres
   - Mezcla mayúscula, minúscula, números, símbolos

2. **Activa verificación en dos pasos**
   - En tu cuenta Cyber Dojo
   - En tus cuentas importantes (email, banco)

3. **Usa gestor de contraseñas**
   - Para almacenar contraseñas seguras
   - Nunca las compartas

4. **Mantén equipo actualizado**
   - Instala actualizaciones de seguridad
   - Usa antivirus

5. **Sé escéptico en Internet**
   - Verifica remitentes de correo
   - No hagas clic en enlaces sospechosos
   - Valida requests por otro canal

---

## Conclusión

Cyber Dojo te enseña ciberseguridad de forma práctica y gamificada.

El camino del aprendizaje es progresivo:
- Comienza con conceptos básicos (Cinturón Blanco)
- Practica con simulaciones (Katas)
- Valida tu conocimiento (Exámenes)
- Avanza a temas más complejos

**Tu compromiso:** Invertir 15-30 minutos diarios
**Tu recompensa:** Proteger tu negocio y datos

Recuerda: La ciberseguridad es un viaje, no un destino.

¡Bienvenido al Dojo! 🥋

---

## Contacto y Recursos

- **Email:** support@cyberdojo.ec
- **Teléfono:** +593 2 1234567
- **Web:** www.cyberdojo.ec
- **Chat en vivo:** Disponible en la app

**Síguenos:**
- Facebook: @CyberDojoEC
- LinkedIn: Cyber Dojo Ecuador
- Instagram: @cyberdojo.ec
