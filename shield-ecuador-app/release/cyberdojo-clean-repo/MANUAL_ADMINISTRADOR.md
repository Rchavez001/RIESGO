# Manual Completo - Consola Central de Administración de Ciber Dojo

## Tabla de Contenidos

1. [Introducción](#introducción)
2. [Acceso y Navegación](#acceso-y-navegación)
3. [Panel de Resumen](#panel-de-resumen)
4. [Gestión de Dojos](#gestión-de-dojos)
5. [Banco de Preguntas](#banco-de-preguntas)
6. [Configuración de IA](#configuración-de-ia)
7. [Agente de Noticias](#agente-de-noticias)
8. [Alertas de Seguridad IA](#alertas-de-seguridad-ia)
9. [Estadísticas de Sensei IA](#estadísticas-de-sensei-ia)
10. [Gestión de Preguntas Abiertas](#gestión-de-preguntas-abiertas)
11. [Administración de Usuarios](#administración-de-usuarios)
12. [Campañas de Propaganda](#campañas-de-propaganda)
13. [Publicación y Guardado](#publicación-y-guardado)

---

## Introducción

La Consola Central de Administración de Ciber Dojo es una aplicación web dedicada a la configuración, gestión y monitoreo del sistema de capacitación en ciberseguridad Ciber Dojo.

**Acceso:**
- URL: `http://localhost:3100`
- Ambiente: Local (desarrollo)
- Puerto: 3100

**Objetivo:**
Permitir a los administradores:
- Configurar temas de entrenamiento (dojos)
- Crear y auditar bancos de preguntas
- Gestionar inteligencia artificial para generación de contenido
- Monitorear alertas de seguridad
- Revisar interacciones de usuarios
- Administrar campañas de comunicación

**Componentes principales:**
- Barra lateral (Rail) con navegación
- Área de trabajo (Workspace) con paneles dinámicos
- Barra superior (Topbar) con acciones globales

---

## Acceso y Navegación

### Estructura de la Interfaz

```
┌─────────────────────────────────────────────────────────────────┐
│  Administrador de Ciber Dojo - CONSOLA CENTRAL DE CONFIGURACION │
│  Gestiona dojos, preguntas, IA, usuarios y propaganda           │
│                                                                  │
│  [Frase dojo] [Guardar borrador] [Publicar configuración]       │
└─────────────────────────────────────────────────────────────────┘
┌──────────────┬────────────────────────────────────────────────┐
│   NAVEGA-    │                                                │
│   CIÓN       │           CONTENIDO ACTIVO                     │
│              │                                                │
│  > Resumen   │  Métrica 1    Métrica 2    Métrica 3           │
│  > Dojos     │                                                │
│  > Preguntas │  [Tarjeta de contenido]  [Tarjeta de edición]  │
│  > IA        │                                                │
│  > Agente    │                                                │
│  > Alertas   │                                                │
│  > Sensei    │                                                │
│  > Preguntas │                                                │
│  > Usuarios  │                                                │
│  > Propaganda│                                                │
│              │                                                │
│  Ambiente:   │                                                │
│  localhost   │                                                │
│  :3100       │                                                │
└──────────────┴────────────────────────────────────────────────┘
```

### Navegación de Paneles

Haz clic en los botones de la barra lateral izquierda para cambiar entre paneles:

| Botón | Panel | Función |
|-------|-------|---------|
| **Resumen** | Overview | Ver métricas generales y flujo de IA |
| **Dojos y progreso** | Dojos | Crear y editar temas de entrenamiento |
| **Preguntas** | Questions | Gestionar banco de 20 manuales + 30 IA |
| **IA y auditoría** | AI Config | Configurar proveedores y cadena de consulta |
| **Agente noticias** | News Agent | Automatizar búsqueda de noticias y generar katas |
| **Alertas IA** | News Alerts | Ver historial de alertas y preguntas generadas |
| **Sensei IA** | Sensei Stats | Monitorear consultas de usuarios y sentimiento |
| **Preguntas abiertas** | Open Questions | Validar preguntas enviadas por usuarios |
| **Usuarios** | Users | Suspender o ver estadísticas de usuarios |
| **Propaganda** | Ads | Crear campañas de comunicación |

---

## Panel de Resumen

### Vista General

El panel **Resumen** es el punto de entrada principal. Muestra:

#### Métricas en Tiempo Real

- **Dojos activos**: Cantidad de temas de entrenamiento disponibles
- **Preguntas objetivo**: Total de preguntas configuradas (20 manuales + 30 IA)
- **Usuarios activos**: Conteo de usuarios registrados en el sistema
- **Campañas activas**: Número de campañas de propaganda activas

#### Regla de Progreso: Cinturones y Katas

Visualización del sistema de avance:

```
Blanco  →  Amarillo  →  Naranja  →  Verde  →  Azul  →  Morado  →  Rojo  →  Negro
20%       15%         10%         5%       5%      5%       5%      35%
```

Cada cinturón tiene:
- Kata asociada (Kata 1, Kata 2, etc.)
- Examen de validación
- Requisito de progreso

#### Flujo de Inteligencia Artificial

Diagrama del orden de consulta:

```
IA 1 → IA 2 → IA 3 → Revisor
```

**Comportamiento:**
- Si IA 1 demora más de su timeout, se consulta IA 2
- Si IA 2 demora más de su timeout, se consulta IA 3
- El revisor (auditor) mejora la pregunta y respuesta generadas

---

## Gestión de Dojos

### Acceder al Panel de Dojos

1. Haz clic en **"Dojos y progreso"** en la barra lateral
2. Se abrirá una vista con:
   - Lista de dojos existentes (izquierda)
   - Editor de dojo seleccionado (derecha)
   - Botón "Agregar dojo"

### Crear un Nuevo Dojo

**Pasos:**

1. Haz clic en el botón **"Agregar dojo"**
2. Un nuevo dojo se añade a la lista
3. Completa los campos del editor:

| Campo | Descripción |
|-------|-------------|
| **Nombre del dojo** | Ej: "Mensajes falsos y correo seguro" |
| **Tema** | Ej: "Correos fraudulentos, enlaces sospechosos" |
| **Control ISO principal** | Ej: "Buenas prácticas de seguridad" |
| **Estado** | Activo / Borrador / Pausado |

### Distribución de Preguntas por Dojo

**Regla automática:**
- 20 preguntas manuales (ingresadas por el equipo)
- 30 preguntas generadas por IA (intercaladas)
- **Total: 50 preguntas por dojo**

### Reglas de Avance por Katas

Se visualizan las reglas de progresión configuradas (ej: 20% para Blanco, 15% para Amarillo).

### Editar un Dojo Existente

1. Haz clic en el dojo en la lista (izquierda)
2. Modifica los campos en el editor
3. Los cambios se guardan automáticamente en memoria
4. Haz clic en **"Guardar borrador"** o **"Publicar configuración"** al final

### Cambiar Estado de un Dojo

Usa el selector **"Estado"** en el editor:
- **Activo**: Disponible para usuarios
- **Borrador**: En desarrollo, no visible
- **Pausado**: Desactivado temporalmente

---

## Banco de Preguntas

### Acceder al Panel de Preguntas

1. Haz clic en **"Preguntas"** en la barra lateral
2. Selecciona el dojo desde el dropdown **"Dojo seleccionado"**
3. Verás dos columnas:
   - **Manuales** (20 ingresadas por equipo)
   - **IA** (30 generadas y auditadas)

### Estructura de una Pregunta

Cada pregunta contiene:

| Campo | Descripción |
|-------|-------------|
| **ID** | Identificador único |
| **Número** | Orden en el dojo |
| **Fuente** | Manual o IA |
| **Estado** | Pendiente / Aprobada / Auditada |
| **Pregunta** | Texto de la pregunta |
| **Respuesta** | Respuesta correcta (explicada para usuarios no técnicos) |
| **Explicación** | Razonamiento adicional |
| **Opciones** | A, B, C, D (correcta + incorrectas) |
| **Dificultad** | 1-5 (Blanco a Negro) |
| **Kata** | Kata asociada (Kata 1, Kata 2, etc.) |

### Ver Detalles de una Pregunta

1. Haz clic en la pregunta
2. Se expande mostrando:
   - Texto completo
   - Opciones de respuesta
   - Explicación
   - Dificultad y kata

### Guardar Preguntas

1. Modifica preguntas en los editores inline
2. Haz clic en **"Guardar preguntas"**
3. Se envían a Supabase con estado `sync: true`
4. Se muestra notificación de confirmación

### Generar Plan de 50 Preguntas

**Función:** Generar automáticamente 20 manuales + 30 IA para un dojo

**Pasos:**

1. Selecciona el dojo destino
2. Haz clic en **"Generar plan 50 preguntas"**
3. El sistema:
   - Crea 20 plantillas manuales (vacías inicialmente)
   - Solicita a IA 1 que genere 30 preguntas
   - Si IA 1 falla, intenta IA 2, luego IA 3
   - El auditor revisa y mejora las preguntas generadas
4. Se cargan en el panel listadas como "pendientes"

### Ejemplos de Preguntas Generadas

#### Pregunta: Mensajes Falsos

**Texto:** "Según una noticia revisada en cisa.gov, un atacante explota mensaje falso dirigido. ¿Qué control reduce mejor el riesgo en Mensajes falsos y correo seguro?"

**Respuesta (explicada para no técnicos):**
"Validar quién envía el mensaje, revisar si mete urgencia y confirmar por otro canal antes de actuar."

**Opciones:**
- A) ✓ Validar quién envía, revisar urgencia, confirmar por otro canal
- B) Ignorar la alerta y continuar operando igual
- C) Compartir credenciales para resolver más rápido
- D) Desactivar controles de seguridad temporalmente

**Dificultad:** 2 (Amarillo) | **Kata:** Kata noticia 1

#### Pregunta: Verificación en Dos Pasos

**Texto:** "¿Cómo proteger mejor una cuenta contra robo de claves?"

**Respuesta (explicada):**
"Activar verificación en dos pasos, que es cuando además de tu clave recibes un código o permiso en el celular, y usar un gestor de contraseñas: es una aplicación segura que guarda tus claves y las completa por ti, para que no tengas que recordar ni escribir todas las contraseñas manualmente."

---

## Configuración de IA

### Acceder al Panel de IA

1. Haz clic en **"IA y auditoría"** en la barra lateral
2. Verás dos secciones:
   - **Cadena de consulta** (izquierda)
   - **Instrucciones de IA** (derecha)

### Cadena de Consulta

Define el orden y características de los proveedores de IA.

#### Agregar un Proveedor de IA

1. Haz clic en **"Agregar IA"**
2. Completa los campos para cada proveedor:

| Campo | Descripción |
|-------|-------------|
| **IA 1, IA 2, IA 3** | Nombre del proveedor (DeepSeek, Kimi, Claude) |
| **Timeout ms** | Milisegundos antes de fallar (ej: 1800) |
| **Orden** | Prioridad de consulta (1, 2, 3) |

#### Ejemplo de Configuración

```
IA 1: DeepSeek, Timeout: 1800ms, Orden: 1
IA 2: Kimi, Timeout: 2200ms, Orden: 2
IA 3: Claude, Timeout: 2600ms, Orden: 3
```

**Comportamiento:**
- Se consulta DeepSeek primero
- Si demora > 1800ms, cancela y consulta Kimi
- Si Kimi demora > 2200ms, cancela y consulta Claude
- Si Claude demora > 2600ms, retorna error

### Instrucciones de IA

#### Generador de Preguntas

Prompt para crear nuevas preguntas:

```
Genera 30 preguntas por dojo, intercaladas con 20 manuales.
Aumenta dificultad gradualmente.
Devuelve JSON con pregunta, opciones, respuesta, explicación, 
dificultad, control ISO y sugerencia de kata.
```

**Elementos clave:**
- Instrucciones claras en español
- Formato de salida (JSON esperado)
- Reglas de dificultad progresiva
- Campos requeridos en respuesta

#### Auditor de Preguntas

Prompt para revisar preguntas generadas:

```
Audita y reformula preguntas generadas.
Valida que el tema sea ciberseguridad,
que la respuesta sea correcta,
que la explicación sea clara
y que la dificultad coincida con el cinturón.
```

**Validaciones automáticas:**
- Tema relevante para ciberseguridad
- Respuesta técnicamente correcta
- Explicación comprensible para no técnicos
- Nivel de dificultad apropiado

### Probar Algoritmo de IA

1. Haz clic en **"Probar algoritmo"**
2. El sistema:
   - Genera una pregunta de prueba
   - La envía a través de la cadena de IA
   - Registra tiempos de respuesta
   - Muestra resultado en la consola

---

## Agente de Noticias

### Acceder al Panel de Agente de Noticias

1. Haz clic en **"Agente noticias"** en la barra lateral
2. Verás:
   - Configuración del agente (izquierda)
   - Katas generadas simuladas (derecha)

### Configuración del Agente

#### Activar/Desactivar el Agente

Marca el checkbox **"Agente activo"** para:
- Habilitar ejecución automática según horario
- Permitir búsqueda de noticias

#### Horario de Ejecución

1. Configura **"Hora de activación"** (ej: 07:30)
2. El agente se ejecuta automáticamente cada día a esa hora
3. Busca en las fuentes configuradas
4. Genera preguntas y katas con noticias recientes

#### Fuentes de Noticias

Ingresa URLs de sitios de ciberseguridad:

```
https://www.cisa.gov/news-events/cybersecurity-advisories
https://www.bleepingcomputer.com/
https://thehackernews.com/
```

**Comportamiento:**
- El agente revisa estas fuentes automáticamente
- Extrae noticias de ciberataques recientes
- Convierte cada noticia en escenario de entrenamiento

#### Instrucciones para el Agente

Personaliza el prompt de búsqueda:

```
Buscar noticias recientes de ciberataques,
extraer táctica, impacto, control preventivo
y convertirlas en preguntas y katas prácticas.
```

**Variables disponibles:**
- Tácticas de ataque (phishing, ransomware, etc.)
- Impacto en negocio
- Control ISO preventivo
- Respuesta recomendada

### Ejecutar Manualmente

1. Haz clic en **"Ejecutar ahora"** (botón rojo)
2. El agente:
   - Busca noticias en las fuentes configuradas
   - Genera hasta 6 preguntas IA para el dojo seleccionado
   - Crea hasta 3 katas de simulación
   - Registra timestamp de ejecución

### Katas Generadas

Se visualizan las simulaciones creadas:

| Campo | Valor |
|-------|-------|
| **Título** | Kata de noticia 1: mensaje falso dirigido |
| **Fuente** | cisa.gov |
| **Escenario** | Descripción del ataque detectado |
| **Acción** | Pasos a seguir para resolver |
| **Dificultad** | 2-4 (escalada) |

### Última Ejecución

Muestra fecha/hora y resultado de la última ejecución:
- "Agente ejecutado: preguntas IA y katas generadas como borrador"

---

## Alertas de Seguridad IA

### Acceder al Panel de Alertas

1. Haz clic en **"Alertas IA"** en la barra lateral
2. Se muestra:
   - **Historial de alertas** (izquierda)
   - **Preguntas IA generadas** (derecha)

### Historial de Alertas

Cada alerta muestra:

| Campo | Descripción |
|-------|-------------|
| **Resumen** | Descripción breve de la alerta |
| **Fecha/Hora** | Cuándo se generó (ej: 16/06/2026 14:30) |
| **Dojo** | Tema de entrenamiento afectado |
| **Sitios revisados** | Fuentes que generaron la alerta |
| **Estado** | Guardada / Pendiente local |
| **Preguntas** | Lista con severidad y texto |

#### Ejemplo de Alerta

```
La IA revisó 3 sitios y generó 6 preguntas para Mensajes falsos
16/06/2026 07:30 | Dojo: Mensajes falsos y correo seguro

Estado: Guardada en Supabase

Sitios revisados: cisa.gov, bleepingcomputer.com, thehackernews.com

Preguntas generadas:
- ALTA: Según CISA, un atacante explota mensaje falso...
- MEDIA: ¿Cómo identificar un correo de suplantación?
- BAJA: ¿Qué datos NO debes compartir por correo?
```

### Preguntas IA Generadas

Listado de todas las preguntas creadas por alertas:

| Campo | Descripción |
|-------|-------------|
| **Pregunta** | Texto completo |
| **Fecha/Hora** | Cuándo se generó |
| **Dojo** | Tema asociado |
| **Severidad** | Baja / Media / Alta |
| **Kata** | Kata asociada (Kata noticia 1, 2, etc.) |

### Forzar Revisión IA

1. Haz clic en **"Forzar revisión IA"** (botón rojo)
2. Ejecuta inmediatamente el agente de noticias
3. Se generan nuevas alertas y preguntas
4. Se guardan en Supabase tabla `alerts`

### Persistencia en Supabase

Las alertas se guardan con esta estructura:

```json
{
  "title": "La IA revisó 3 sitios y generó 6 preguntas...",
  "description": "- Alta: Pregunta 1\n- Media: Pregunta 2\n...",
  "threat_type": "ciberataque",
  "severity": "media|alta",
  "source": "cisa.gov",
  "source_url": "https://cisa.gov/..., https://...",
  "published_at": "2026-06-16T14:30:00Z",
  "active": true
}
```

---

## Estadísticas de Sensei IA

### Acceder al Panel de Sensei

1. Haz clic en **"Sensei IA"** en la barra lateral
2. Se muestran tres secciones:
   - Gráfico de utilidad y sentimiento
   - Últimas consultas de usuarios
   - Resumen diario

### Utilidad, Sentimiento y Temas

**Gráfico de puntuación:**
- Eje X: Utilidad (0-100%)
- Eje Y: Sentimiento (Negativo → Positivo)
- Colores por tema consultado

**Indicadores:**
- Verde: Respuestas útiles y positivas
- Amarillo: Respuestas útiles pero neutras
- Rojo: Respuestas no útiles o negativas

### Últimas Consultas

Historial de preguntas hechas por usuarios al Sensei IA:

| Campo | Descripción |
|-------|-------------|
| **Pregunta** | Texto de la consulta del usuario |
| **Tema** | Categoría detectada automáticamente |
| **Utilidad** | Si marcó "¿Te fue útil?" |
| **Sentimiento** | Emoción detectada en respuesta |
| **Fecha** | Cuándo se hizo la consulta |

#### Ejemplo

```
"¿Qué es verificación en dos pasos?"
Tema: Seguridad de cuentas
Útil: Sí
Sentimiento: Positivo
Fecha: 16/06/2026 09:15
```

### Resumen Diario

Estadísticas del día actual:

| Métrica | Descripción |
|---------|------------|
| **Consultas totales** | Número de preguntas al Sensei |
| **Consultas sobre ciberseguridad** | % de preguntas relevantes |
| **Utilidad promedio** | % de respuestas marcadas como útiles |
| **Sentimiento promedio** | Promedio de sentimiento (negativo a positivo) |
| **Tema más consultado** | Categoría con más preguntas |

### Refrescar Estadísticas

1. Haz clic en **"Refrescar estadísticas"** 
2. Carga datos recientes de Supabase tabla `sensei_consultations`
3. Actualiza gráficos y contadores

---

## Gestión de Preguntas Abiertas

### Acceder al Panel de Preguntas Abiertas

1. Haz clic en **"Preguntas abiertas"** en la barra lateral
2. Se muestran tres secciones:
   - Validación de tema y respuesta con IA
   - Regla de decisión
   - Temas detectados

### Validación de Tema y Respuesta

Cuando un usuario envía una pregunta desde la app, el sistema:

1. **Detecta el tema** usando IA
2. **Valida coherencia** (pregunta + respuesta relación)
3. **Clasifica** como ciberseguridad sí/no

**Campos mostrados:**
- Pregunta original
- Respuesta propuesta
- Tema detectado (ej: "Verificación en dos pasos")
- Puntuación de coherencia (0-100%)
- Estado (Válida / Revisión / Rechazo)

### Regla de Decisión

Lógica automática para aceptar/rechazar:

```
SI tema == ciberseguridad Y coherencia > 75% 
  ENTONCES Aprobar para banco manual

SI tema == ciberseguridad Y coherencia 50-75%
  ENTONCES Enviar a revisión manual

SI tema != ciberseguridad O coherencia < 50%
  ENTONCES Rechazar
```

### Temas Detectados

Listado de categorías de preguntas enviadas:

| Tema | Cantidad | Validez |
|------|----------|---------|
| Mensajes falsos | 15 | 87% |
| Verificación en dos pasos | 12 | 92% |
| Copias de seguridad | 8 | 78% |
| Contraseñas | 20 | 95% |
| Uso de WhatsApp | 5 | 65% |

---

## Administración de Usuarios

### Acceder al Panel de Usuarios

1. Haz clic en **"Usuarios"** en la barra lateral
2. Se muestran estadísticas y lista de usuarios

### Estadísticas

| Métrica | Descripción |
|---------|------------|
| **Usuarios activos** | Con sesión en últimas 24h |
| **Usuarios totales** | Todos registrados |
| **Suspendidos** | Dados de baja |
| **Promedio progreso** | % avance general |

### Lista de Usuarios

Tabla con información de cada usuario:

| Columna | Descripción |
|---------|------------|
| **Nombre** | Nombre completo |
| **Dojo** | Tema que está entrenando |
| **Progreso** | % de avance (0-100%) |
| **Preguntas** | Cantidad resueltas |
| **Tema** | Tema más consultado |
| **Estado** | Activo / Suspendido |

#### Filtrado

Puedes filtrar por:
- Estado (Activo / Suspendido)
- Dojo asignado
- Rango de progreso

### Suspender Usuarios

**Opción individual:**
1. Haz clic en el usuario
2. Selecciona "Suspender"
3. El usuario no puede ingresar a la app

**Opción masiva:**
1. Marca checkbox de usuarios a suspender
2. Haz clic en **"Suspender seleccionados"**
3. Se suspenden todos marcados

### Ver Detalles de Usuario

Haz clic en un usuario para ver:
- Perfil completo
- Katas completados
- Historial de preguntas
- Puntos acumulados
- Cinturón actual
- Fecha de registro

---

## Campañas de Propaganda

### Acceder al Panel de Propaganda

1. Haz clic en **"Propaganda"** en la barra lateral
2. Se muestran campañas existentes y editor

### Crear Campaña

1. Haz clic en **"Agregar campaña"**
2. Completa los campos:

| Campo | Descripción |
|-------|------------|
| **Nombre** | Ej: "Plan de verificación en dos pasos" |
| **Momento** | Inicio / Sesión / Fin |
| **Duración** | Número (ej: 12) |
| **Validez** | Meses / Sesiones |
| **Mensaje** | Texto de la campaña |

#### Ejemplos

**Campaña 1: Inicio**
```
Nombre: Plan de verificación en dos pasos
Momento: inicio (al abrir la app)
Duración: 12 meses
Mensaje: "Activa el paquete de soporte para configurar 
la verificación en dos pasos en tu negocio."
```

**Campaña 2: Sesión**
```
Nombre: Curso contra mensajes falsos
Momento: sesión (durante uso)
Duración: 8 sesiones
Mensaje: "Refuerza a tu equipo con el curso rápido 
contra mensajes falsos."
```

### Activar/Desactivar Campaña

1. Marca/desmarca el checkbox "Activa"
2. Haz clic **"Guardar campaña"**
3. Usuarios verán el mensaje si activa

### Planificación de Campaña

**Duración y Validez:**
- 12 meses: La campaña funciona durante 12 meses
- 8 sesiones: La campaña aparece en 8 sesiones del usuario

**Momento de Aparición:**
- **Inicio**: Al abrir la app (splash screen)
- **Sesión**: Durante la sesión actual (modal emergente)
- **Fin**: Al cerrar la app (confirmación)

---

## Publicación y Guardado

### Diferencia entre Guardar y Publicar

#### Guardar Borrador
- **Acción:** Haz clic **"Guardar borrador"**
- **Alcance:** Se guarda en localStorage (solo tu navegador)
- **Efecto:** No afecta a usuarios de la app
- **Uso:** Guardar cambios mientras trabajas

#### Publicar Configuración
- **Acción:** Haz clic **"Publicar configuración"**
- **Alcance:** Se guarda en Supabase (todos lo ven)
- **Efecto:** Los usuarios ven los cambios
- **Uso:** Activar cambios en producción

### Flujo de Publicación

```
1. Realiza cambios en el admin
   (dojos, preguntas, IA, campañas, usuarios)
         ↓
2. Haz clic "Guardar borrador"
   (se guarda localmente)
         ↓
3. Revisa los cambios
   (verifica que todo sea correcto)
         ↓
4. Haz clic "Publicar configuración"
   (se envía a Supabase)
         ↓
5. Usuarios ven los cambios
   (se actualiza su aplicación)
```

### Confirmación de Publicación

Al hacer clic "Publicar configuración":
1. Se muestra notificación: "Configuración publicada para Ciber Dojo"
2. Los datos se sincronizan con Supabase
3. Se actualiza timestamp de última publicación
4. Los usuarios verán los cambios en su próxima sincronización

### Manejo de Errores en Publicación

Si hay un error:
1. Se muestra mensaje: "Error al publicar, intenta nuevamente"
2. Verifica conexión a Internet
3. Verifica que Supabase esté disponible
4. Intenta nuevamente

---

## Características Avanzadas

### Frase del Dojo (Sabiduría)

1. Haz clic en **"Frase dojo"** (botón gris, arriba)
2. Se abre un modal con una cita de sabiduría
3. Contiene:
   - Cita original (ej: Sun Tzu, Bushido)
   - Aplicación a ciberseguridad
   - Fuente de la cita

**Ejemplo:**
```
"Conoce al enemigo y conócete a ti mismo; 
en cien batallas no correrás peligro."
- El arte de la guerra, Sun Tzu

Aplicación: Antes de entrenar, identifica tus equipos, 
cuentas y datos importantes. Una buena defensa empieza 
sabiendo qué debes proteger.
```

### Almacenamiento Local vs. Supabase

**localStorage (navegador):**
- Almacena estado del admin
- Persiste entre sesiones en mismo navegador
- Límite: ~5-10MB
- Datos: JSON serializado

**Supabase (base de datos):**
- Almacena datos permanentes
- Accesible desde cualquier dispositivo
- Sincronizado con todos los usuarios
- Tablas: dojos, questions, users, etc.

### Validación de Datos

El sistema valida automáticamente:
- **URLs del agente:** Formato válido de URL
- **Tiempos:** Timeout en rango válido (100-5000ms)
- **Textos:** No vacíos ni muy largos
- **Dificultad:** Números 1-5
- **Estado:** Valores permitidos (activo/borrador/pausado)

---

## Troubleshooting

### La app no se carga

1. Verifica que el servidor está corriendo: `node server.js` en `central-admin-app/`
2. Abre `http://localhost:3100` en el navegador
3. Abre consola (F12) y busca errores

### Los cambios no se guardan

1. Haz clic "Guardar borrador" explícitamente
2. Verifica localStorage en DevTools (F12 → Application → localStorage)
3. Intenta abrir en modo incógnito (elimina cache)

### No puedo conectar a Supabase

1. Verifica que tienes conexión a Internet
2. Comprueba que la clave de API es válida en `app.js`
3. Verifica que el proyecto Supabase está activo (no pausado)
4. Revisa la consola del navegador (F12 → Console) para errores

### Las preguntas IA no se generan

1. Verifica que tienes al menos un proveedor de IA configurado
2. Comprueba los tiempos (timeout) de cada IA
3. Intenta "Probar algoritmo" para diagnosticar
4. Revisa logs de la app (terminal donde corre Node)

### Sensei IA no muestra datos

1. Haz clic "Refrescar estadísticas"
2. Verifica que hay consultas en Supabase tabla `sensei_consultations`
3. Comprueba fechas (datos pueden ser antiguos)
4. Intenta cerrar y abrir el panel nuevamente

---

## Mejores Prácticas

1. **Guarda regularmente:** Haz clic "Guardar borrador" mientras trabajas
2. **Publica con cuidado:** Revisa cambios antes de publicar
3. **Prueba IA:** Usa "Probar algoritmo" antes de ejecutar agente
4. **Monitorea usuarios:** Revisa panel de usuarios regularmente
5. **Actualiza prompts:** Personaliza instrucciones de IA para mejores resultados
6. **Revisa alertas:** Monitorea alertas de seguridad generadas
7. **Valida preguntas:** Audita preguntas abiertas de usuarios

---

## Conclusión

La Consola Central de Administración permite gestionar completamente el sistema Ciber Dojo: desde crear temas de entrenamiento, gestionar preguntas y IA, hasta monitorear usuarios y alertas de seguridad.

Usa esta guía como referencia para explorar todas las funcionalidades disponibles.

**Contacto:** support@cyberdojo.ec
