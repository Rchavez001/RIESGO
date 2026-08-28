# Arquitectura General de Cyber Dojo y Agentes de IA

## Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Stack Tecnológico](#stack-tecnológico)
4. [Estructura del Proyecto](#estructura-del-proyecto)
5. [Base de Datos - Supabase](#base-de-datos---supabase)
6. [Agentes de IA](#agentes-de-ia)
7. [Flujos de Datos](#flujos-de-datos)
8. [Seguridad y Autenticación](#seguridad-y-autenticación)
9. [Escalabilidad y Performance](#escalabilidad-y-performance)
10. [Deployment](#deployment)

---

## Visión General

**Cyber Dojo** es una plataforma de entrenamiento en ciberseguridad gamificada que utiliza múltiples agentes de IA para:

- Generar contenido dinámico de capacitación
- Evaluar respuestas de usuarios
- Monitorear amenazas actuales
- Asistir a usuarios con consultas inteligentes

**Objetivo:** Proteger MIPYMEs ecuatorianas educando sus empleados en ciberseguridad mediante simulaciones prácticas y evaluaciones adaptativas.

**Componentes principales:**
```
┌─────────────────────────────────────────────────────────────┐
│                    CYBER DOJO ECOSYSTEM                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  FRONTEND (React + TypeScript)                      │   │
│  │  - Dashboard, Dojos, Katas, Exámenes               │   │
│  │  - Consultas Sensei IA                             │   │
│  │  - Análisis de emails sospechosos                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ↕                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  BACKEND (Node.js + Supabase)                      │   │
│  │  - Autenticación y autorización                    │   │
│  │  - API REST para datos                             │   │
│  │  - Edge Functions para lógica compleja             │   │
│  │  - RLS (Row Level Security) para privacidad        │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ↕                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  BASE DE DATOS (PostgreSQL en Supabase)            │   │
│  │  - 10+ tablas para gamificación                     │   │
│  │  - Registros de consultas IA                        │   │
│  │  - Historiales de evaluaciones                      │   │
│  │  - Alertas de seguridad                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ↕                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  AGENTES DE IA (Externos)                          │   │
│  │  - DeepSeek, Kimi, Claude                          │   │
│  │  - Generar preguntas                               │   │
│  │  - Auditar respuestas                              │   │
│  │  - Análisis de emails                              │   │
│  │  - Consultas de usuarios (Sensei)                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Arquitectura del Sistema

### Capas de Arquitectura

```
┌──────────────────────────────────────────────────────┐
│           PRESENTACIÓN (Frontend)                    │
│  React + TypeScript + Framer Motion                  │
│  - Login / Registro                                  │
│  - Dashboard                                         │
│  - Dojos y Katas                                     │
│  - Exámenes                                          │
│  - Chat Sensei                                       │
│  - Análisis de Emails                                │
└──────────────────────────────────────────────────────┘
                        ↓ HTTP/JSON
┌──────────────────────────────────────────────────────┐
│         APLICACIÓN (Backend & API)                   │
│  Node.js + Supabase                                  │
│  - Autenticación (Supabase Auth)                     │
│  - REST API (Supabase PostgREST)                     │
│  - Edge Functions (Lógica compleja)                  │
│  - RLS Policies (Seguridad)                          │
└──────────────────────────────────────────────────────┘
                        ↓ SQL/Connection
┌──────────────────────────────────────────────────────┐
│         DATOS (Base de Datos)                        │
│  PostgreSQL (Supabase)                               │
│  - Usuarios y autenticación                          │
│  - Preguntas y respuestas                            │
│  - Evaluaciones y progreso                           │
│  - Consultas Sensei IA                               │
│  - Alertas de seguridad                              │
└──────────────────────────────────────────────────────┘
                        ↓ API Calls
┌──────────────────────────────────────────────────────┐
│      INTELIGENCIA ARTIFICIAL (Externos)              │
│  - Generación de preguntas                           │
│  - Auditoría de contenido                            │
│  - Análisis de emails                                │
│  - Consultas de usuarios                             │
│  - Validación temática                               │
└──────────────────────────────────────────────────────┘
```

### Patrones Arquitectónicos

1. **MVC (Model-View-Controller)**
   - Vista: Componentes React
   - Lógica: Hooks y funciones en Supabase
   - Datos: Tablas PostgreSQL

2. **API-First**
   - Frontend consume API REST de Supabase
   - Edge Functions para lógica compleja
   - Desacoplamiento entre capas

3. **Event-Driven**
   - Triggers en BD para eventos (completar kata, cambiar cinturón)
   - Funciones serverless ejecutadas bajo demanda
   - Webhooks para alertas

4. **Microservicios**
   - Cada Edge Function es un microservicio
   - Independientes y escalables
   - Responsabilidad única

---

## Stack Tecnológico

### Frontend
```
React 19.2.5
├── TypeScript (type safety)
├── React Router 7.15.0 (navegación)
├── Framer Motion 12.38.0 (animaciones)
├── Supabase JS 2.104.1 (cliente)
├── Zustand 5.0.13 (estado global)
└── Lucide React 1.11.0 (iconos)
```

### Backend
```
Supabase
├── PostgreSQL 15+ (base de datos)
├── PostgREST (API automática)
├── Supabase Auth (autenticación)
├── Edge Functions (Node.js)
├── Realtime (subscripciones)
└── Storage (archivos)
```

### IA / Externos
```
Proveedores de IA
├── DeepSeek (generación de preguntas)
├── Kimi (auditoría)
├── Claude (análisis y consultas)
└── Posibilidad de agregar más
```

### DevOps
```
Desarrollo Local
├── Node.js 18+
├── NPM / Yarn (package manager)
├── Supabase CLI (emulador local)
└── Git (control de versiones)

Producción
├── Supabase Cloud (alojamiento)
├── Vercel / Netlify (frontend)
├── HTTPS/TLS (seguridad)
└── CDN (distribución)
```

---

## Estructura del Proyecto

```
shield-ecuador-app/
├── frontend/                          # Aplicación React
│   ├── src/
│   │   ├── components/               # Componentes reutilizables
│   │   │   ├── AdaptiveQuestionnaire.tsx
│   │   │   ├── PageTransition.tsx
│   │   │   ├── CyberBushido.tsx
│   │   │   └── CyberToast.tsx
│   │   ├── screens/                  # Pantallas principales
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── DashboardScreen.tsx
│   │   │   ├── DojoDetailPage.tsx
│   │   │   ├── KataExamPage.tsx
│   │   │   ├── SenseiConsultPage.tsx
│   │   │   ├── ProfilePage.tsx
│   │   │   ├── LeaderboardPage.tsx
│   │   │   └── AdminCenterScreen.tsx
│   │   ├── contexts/                 # Context API para estado
│   │   ├── hooks/                    # Hooks personalizados
│   │   ├── data/                     # Datos estáticos
│   │   ├── lib/                      # Utilidades y helpers
│   │   ├── store/                    # Zustand stores
│   │   ├── App.tsx                   # Router principal
│   │   └── index.tsx                 # Entrada
│   ├── public/                        # Archivos estáticos
│   └── package.json
│
├── central-admin-app/                 # Consola de administración
│   ├── index.html
│   ├── app.js                        # Lógica principal del admin
│   ├── styles.css                    # Estilos
│   ├── server.js                     # Servidor Node.js local
│   └── cyber-sensei.png              # Imagen de Sensei
│
├── supabase/                          # Configuración Supabase
│   ├── config.toml                   # Configuración local
│   ├── migrations/                   # Scripts SQL
│   │   ├── 001_initial_schema.sql    # Tablas base
│   │   ├── 002_rls_policies.sql      # Seguridad
│   │   ├── 003_seed_data.sql         # Datos iniciales
│   │   ├── 004_admin_center.sql      # Admin console
│   │   ├── 005_security_hardening.sql
│   │   ├── 006_ai_question_workflow_defaults.sql
│   │   ├── 007_central_admin_ciber_dojo.sql
│   │   ├── 008_sensei_consultations.sql
│   │   ├── 009_belt_exam_katas.sql
│   │   └── 010_plain_language_portal_text.sql
│   └── functions/                    # Edge Functions (Node.js)
│       ├── ask-sensei/               # Responder consultas
│       ├── generate-recommendations/ # Generar recomendaciones
│       ├── audit-generated-questions/# Auditar preguntas IA
│       ├── analyze-email/            # Analizar emails
│       ├── calculate-risk/           # Calcular riesgo
│       └── run-daily-agent-workflows/# Agente de noticias
│
├── MANUAL_ADMINISTRADOR.md            # Manual del admin
├── MANUAL_USUARIO_CYBER_DOJO.md       # Manual del usuario
└── DOCUMENTO_FUNCIONALIDADES.md       # Funcionalidades
```

---

## Base de Datos - Supabase

### Esquema Principal

```
PostgreSQL Database
│
├── USUARIOS
│   └── users (id, email, full_name, belt, total_points, risk_level, ...)
│
├── ENTRENAMIENTO
│   ├── questions (id, branch, question_text, options, ...)
│   ├── katas (id, name, description, required_belt, ...)
│   ├── kata_completions (user_id, kata_id, completed_at, ...)
│   └── evaluations (user_id, total_score, risk_level, ...)
│
├── INTELIGENCIA ARTIFICIAL
│   ├── sensei_consultations (user_id, question_text, answer_text, ...)
│   ├── sensei_consultation_stats (vista agregada)
│   └── open_questions (user_id, question_text, status, ...)
│
├── SEGURIDAD
│   ├── alerts (id, title, threat_type, severity, ...)
│   ├── email_analysis (user_id, verdict, threat_type, ...)
│   └── domains_whitelist (entity_name, domains, ...)
│
└── CONFIGURACIÓN
    ├── dojos (id, name, theme, iso_control, status, ...)
    ├── belt_definitions (belt, progress%, points_required, ...)
    └── ai_providers (name, timeout_ms, order, ...)
```

### Tablas Críticas

#### 1. users
Información de usuarios registrados.
```sql
- id: UUID (clave primaria)
- email: TEXT (único)
- full_name: TEXT
- belt: TEXT ('white', 'yellow', 'orange', 'green', 'blue', 'purple', 'red', 'black')
- total_points: INT
- current_risk_level: TEXT ('bajo', 'medio', 'alto', 'crítico')
- business_type: ENUM (restaurante, comerciante, farmacia, etc.)
- created_at: TIMESTAMPTZ
```

#### 2. questions
Banco de preguntas (20 manuales + 30 IA por dojo).
```sql
- id: TEXT (código único)
- branch: TEXT (dojo ID)
- question_text: TEXT
- options: JSONB (A, B, C, D con correcta)
- active: BOOLEAN
- source_type: TEXT ('manual' | 'incident_investigation')
- audit_status: TEXT ('pending' | 'approved')
- difficulty: INT (1-5)
```

#### 3. katas
Simulaciones prácticas.
```sql
- id: UUID
- name: TEXT
- description: TEXT
- required_belt: TEXT
- points_reward: INT
- steps: JSONB (pasos del kata)
- verification_type: TEXT ('manual', 'automatic', 'self_report')
```

#### 4. kata_completions
Registro de katas completados.
```sql
- user_id: UUID (FK → users)
- kata_id: UUID (FK → katas)
- completed_at: TIMESTAMPTZ
- points_earned: INT
```

#### 5. evaluations
Evaluaciones de riesgo tomadas por usuarios.
```sql
- user_id: UUID
- total_score: INT
- risk_level: TEXT
- responses: JSONB (respuestas del usuario)
- ai_used: TEXT (qué IA procesó)
- completed: BOOLEAN
```

#### 6. sensei_consultations
Historial de consultas al Sensei IA.
```sql
- user_id: UUID
- question_text: TEXT
- is_cybersecurity: BOOLEAN
- answer_text: TEXT
- feedback_helpful: BOOLEAN
- sentiment_label: TEXT ('positivo', 'neutral', 'negativo')
- created_at: TIMESTAMPTZ
```

#### 7. alerts
Alertas de ciberseguridad.
```sql
- id: UUID
- title: TEXT
- description: TEXT
- threat_type: TEXT ('malware', 'phishing', 'ransomware', etc.)
- severity: TEXT ('baja', 'media', 'alta')
- source: TEXT (sitio de donde se tomó)
- published_at: TIMESTAMPTZ
- active: BOOLEAN
```

### Políticas de Seguridad (RLS)

Cada tabla tiene políticas de control de acceso:

1. **Users solo ven sus propios datos**
   ```
   SELECT: auth.uid() = user_id OR is_admin()
   ```

2. **Preguntas visibles a usuarios autenticados**
   ```
   SELECT: authenticated
   ```

3. **Consultas Sensei solo del propietario**
   ```
   SELECT: auth.uid() = user_id OR is_admin()
   INSERT: auth.uid() = user_id
   ```

4. **Alertas visibles a todos**
   ```
   SELECT: authenticated
   ```

5. **Administrador acceso total**
   ```
   Bypass con is_admin() check
   ```

---

## Agentes de IA

### Arquitectura de Agentes

```
┌─────────────────────────────────────────────────────┐
│         CADENA DE AGENTES DE IA (Fallback)         │
└─────────────────────────────────────────────────────┘

Solicitud IA
    ↓
┌─────────────────────────┐
│  IA 1 (DeepSeek)        │  Timeout: 1800ms
│  Orden: 1               │  
└─────────────────────────┘
    ↓ (si falla)
┌─────────────────────────┐
│  IA 2 (Kimi)            │  Timeout: 2200ms
│  Orden: 2               │
└─────────────────────────┘
    ↓ (si falla)
┌─────────────────────────┐
│  IA 3 (Claude)          │  Timeout: 2600ms
│  Orden: 3               │
└─────────────────────────┘
    ↓ (si falla)
┌─────────────────────────┐
│  AUDITOR/REVISOR        │  Mejora la respuesta
│  (Otro modelo IA)       │
└─────────────────────────┘
    ↓
Respuesta final al usuario
```

### 1. Agente Generador de Preguntas

**Propósito:** Crear nuevas preguntas de entrenamiento automáticamente.

**Trigger:** 
- Manual: Admin hace clic "Generar plan 50 preguntas"
- Automático: Agente de noticias cada día

**Flujo:**
```
1. Admin selecciona Dojo
2. Sistema consulta IA 1 con prompt:
   "Genera 30 preguntas sobre [tema] 
    con opciones A/B/C/D, respuesta correcta y explicación"
3. IA devuelve JSON con preguntas
4. Si timeout > 1800ms, intenta IA 2
5. Si todas fallan, muestra error
6. Preguntas se guardan como "pendientes" en DB
7. Auditor revisa y aprueba
8. Se marcan como "aprobadas"
```

**Estructura de salida esperada:**
```json
{
  "questions": [
    {
      "question_text": "¿Qué es verificación en dos pasos?",
      "options": [
        {
          "label": "A",
          "text": "Un código que recibes por SMS además de tu contraseña",
          "is_correct": true
        },
        {
          "label": "B",
          "text": "Una contraseña más larga",
          "is_correct": false
        }
      ],
      "explanation": "La verificación en dos pasos...",
      "difficulty": 1,
      "iso_control": "AC-2: Gestión de acceso"
    }
  ]
}
```

### 2. Agente Auditor de Preguntas

**Propósito:** Revisar y mejorar preguntas generadas por IA.

**Trigger:** Después de generar preguntas

**Flujo:**
```
1. Preguntas generadas se envían a Auditor
2. Auditor valida:
   - Tema es sobre ciberseguridad ✓
   - Respuesta es técnicamente correcta ✓
   - Explicación es clara y accesible ✓
   - Dificultad coincide con cinturón ✓
   - Opciones son plausibles ✓
3. Si alguna falla, reformula
4. Marca como aprobada
5. Se guardan en DB con audit_status='approved'
6. Disponibles para usuarios
```

**Prompt del Auditor:**
```
Audita estas preguntas de ciberseguridad:
- Valida que sean claras para usuarios no técnicos
- Asegúrate de que la respuesta sea correcta
- Reformula si la explicación es muy técnica
- Mantén dificultad apropiada
```

### 3. Agente de Noticias (News Agent)

**Propósito:** Generar contenido dinámico basado en amenazas actuales.

**Configuración:**
```
- Activo: Sí/No (checkbox)
- Horario: 07:30 cada día
- Fuentes: CISA.gov, BleepingComputer, HackerNews
- Instrucciones: "Busca noticias recientes de ciberataques..."
```

**Flujo:**
```
1. Cada día a las 07:30 (configurable)
2. Scrape de 3 fuentes de noticias
3. IA genera hasta 6 preguntas del dojo actual
4. IA crea hasta 3 katas de simulación
5. Se insertan en tabla `alerts`
6. Se marcan como "pendientes"
7. Admin revisa y publica
8. Se crean evaluaciones "News-based"
9. Usuarios ven preguntas sobre amenazas recientes
```

**Ejemplo de salida:**
```
NOTICIA: Vulnerabilidad en WordPress
↓
PREGUNTA GENERADA:
"Según un exploit descubierto en WordPress, 
los atacantes pueden acceder a... 
¿Cuál es la defensa más efectiva?"

KATA GENERADA:
Escenario: "Tu sitio web es hackeado"
Tareas: 
- Identifica qué pasó
- Toma acción inmediata
- Documenta el incidente
```

### 4. Sensei IA (Consultas de Usuarios)

**Propósito:** Responder preguntas de usuarios sobre ciberseguridad.

**Trigger:** Usuario hace clic "Hablar con Sensei"

**Flujo:**
```
1. Usuario escribe pregunta en chat
2. Envía a Edge Function ask-sensei
3. Sistema valida tema (¿es sobre ciberseguridad?)
4. Si es relevante:
   a. Busca respuesta en banco de preguntas
   b. Si no encuentra, consulta IA
   c. IA genera respuesta clara y accesible
5. Respuesta se muestra al usuario
6. Se registra en tabla `sensei_consultations`
7. Usuario marca si fue útil
8. Sistema aprende del feedback
```

**Arquitectura de Sensei:**
```
Entrada: Pregunta del usuario
   ↓
┌─────────────────────────────────────────┐
│ 1. Validar tema                         │
│    - ¿Es sobre ciberseguridad?          │
│    - Detectar intención                 │
└─────────────────────────────────────────┘
   ↓ (si sí)
┌─────────────────────────────────────────┐
│ 2. Buscar en banco de preguntas         │
│    - Búsqueda por keywords              │
│    - Similitud semántica                │
└─────────────────────────────────────────┘
   ↓ (si no encuentra)
┌─────────────────────────────────────────┐
│ 3. Consultar IA externa                 │
│    - DeepSeek / Kimi / Claude           │
│    - Con prompt de ciberseguridad       │
│    - Lenguaje claro y accesible         │
└─────────────────────────────────────────┘
   ↓
┌─────────────────────────────────────────┐
│ 4. Registrar consulta                   │
│    - Guardar en BD                      │
│    - Marcar tema detectado              │
│    - Timestamp                          │
└─────────────────────────────────────────┘
   ↓
┌─────────────────────────────────────────┐
│ 5. Mostrar respuesta                    │
│    - Respuesta clara                    │
│    - Botón "¿Te fue útil?"              │
│    - Opción de profundizar              │
└─────────────────────────────────────────┘
   ↓
┌─────────────────────────────────────────┐
│ 6. Recopilar feedback                   │
│    - Utilidad (Sí/No)                   │
│    - Sentimiento (positivo/neutral/negativo)
│    - Comentario adicional               │
└─────────────────────────────────────────┘
```

**Ejemplos de consultas:**

**Usuario:** "¿Qué es un gestor de contraseñas y por qué lo necesito?"

**Sensei (búsqueda en banco):** 
```
Encontrado en pregunta #23:
"Un gestor de contraseñas es una aplicación 
segura que guarda tus claves de forma cifrada 
y las completa automáticamente..."
```

**Usuario:** "¿Mi celular puede ser hackeado si está conectado a WiFi pública?"

**Sensei (consulta IA):**
```
Sí, WiFi pública es muy riesgosa. Los atacantes pueden:
1. Interceptar tu tráfico de datos
2. Crear WiFi falsa ("Evil Twin")
3. Inyectar malware

Cómo protegerte:
- Usa VPN en WiFi pública
- No accedas a datos sensibles
- Desactiva Bluetooth/compartición de archivos
```

### 5. Agente Analizador de Emails

**Propósito:** Detectar emails de phishing y análisis de seguridad.

**Trigger:** Usuario carga email en la app

**Flujo:**
```
1. Usuario pega headers de email
2. Sistema extrae información:
   - Dominio del remitente
   - SPF/DKIM/DMARC verificación
   - URLs en el email
   - Palabras clave sospechosas
3. IA analiza:
   - ¿Parece phishing?
   - Riesgo de typosquatting
   - URLs maliciosas
4. Resultado: "Seguro" / "Sospechoso" / "Peligroso"
5. Explicación accesible
6. Se guarda análisis en BD
```

### 6. Agente Calculador de Riesgo

**Propósito:** Evaluar nivel de riesgo cibernético del usuario.

**Trigger:** Al completar evaluación

**Flujo:**
```
1. Usuario responde evaluación adaptativa
2. Respuestas se envían a Edge Function
3. IA calcula puntuación por vector:
   - Gestión de acceso
   - Protección de datos
   - Conciencia de amenazas
   - Respuesta ante incidentes
4. Resultado: "Bajo" / "Medio" / "Alto" / "Crítico"
5. Se otorga cinturón correspondiente
6. Se guardan vector_scores en DB
7. Se envía reporte personalizado
```

**Matriz de riesgo:**
```
Puntuación          Riesgo      Cinturón
0-20%              Crítico      Blanco
21-40%             Alto         Blanco-Amarillo
41-60%             Medio        Amarillo-Naranja
61-80%             Medio-Bajo   Naranja-Verde
81-100%            Bajo         Verde+
```

---

## Flujos de Datos

### 1. Flujo de Registro de Usuario

```
Usuario ingresa datos de registro
    ↓
┌──────────────────────────────────────────────┐
│ Frontend (LoginScreen.tsx)                   │
│ - Valida formato email                       │
│ - Valida contraseña (8+ chars)               │
│ - Requiere tipo de negocio                   │
└──────────────────────────────────────────────┘
    ↓ POST /auth/v1/signup
┌──────────────────────────────────────────────┐
│ Supabase Auth                                │
│ - Crea usuario en auth.users                 │
│ - Genera UUID único                          │
│ - Envía email de confirmación (opcional)     │
└──────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────────┐
│ Trigger SQL                                  │
│ - Crea fila en tabla users                   │
│ - Establece cinturón inicial (blanco)        │
│ - total_points = 0                           │
│ - risk_level = "medio"                       │
└──────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────────┐
│ Edge Function (new-user-setup)               │
│ - Asigna primeros katas                      │
│ - Crea perfil de onboarding                  │
│ - Envía email de bienvenida                  │
└──────────────────────────────────────────────┘
    ↓
Usuario completa onboarding y comienza entrenamiento
```

### 2. Flujo de Evaluación Adaptativa

```
Usuario inicia evaluación
    ↓
┌──────────────────────────────────────────────┐
│ AdaptiveQuestionnaire.tsx                    │
│ - Carga preguntas del dojo seleccionado      │
│ - Muestra una pregunta a la vez              │
│ - Usuario responde (A/B/C/D)                 │
│ - Valida respuesta en tiempo real            │
└──────────────────────────────────────────────┘
    ↓ (después de 10 preguntas)
┌──────────────────────────────────────────────┐
│ Edge Function (calculate-risk)               │
│ - IA analiza patrón de respuestas            │
│ - Calcula puntuación por vector              │
│ - Determina cinturón y riesgo                │
│ - Genera recomendaciones                     │
└──────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────────┐
│ Backend (Supabase)                           │
│ - Inserta fila en evaluations                │
│ - Actualiza users.belt si ascendió           │
│ - Suma puntos en users.total_points          │
│ - Registra vector_scores en JSONB            │
└──────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────────┐
│ Triggers                                     │
│ - Si belt cambió, envía notificación         │
│ - Si nuevo logro, agrega medalla             │
│ - Si top 10, actualiza tabla de posiciones   │
└──────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────────┐
│ Frontend (ResultsScreen.tsx)                 │
│ - Muestra resultados detallados              │
│ - Visualiza progreso                         │
│ - Ofrece siguiente paso                      │
└──────────────────────────────────────────────┘
```

### 3. Flujo de Generar Preguntas con IA

```
Admin hace clic "Generar plan 50 preguntas"
    ↓
┌──────────────────────────────────────────────┐
│ central-admin-app/app.js                     │
│ - Selecciona Dojo destino                    │
│ - Prepara prompt con contexto                │
│ - Consulta IA 1 (DeepSeek)                   │
└──────────────────────────────────────────────┘
    ↓ (timeout 1800ms)
┌──────────────────────────────────────────────┐
│ DeepSeek API                                 │
│ Prompt: "Genera 30 preguntas sobre           │
│          [Dojo] para usuarios no técnicos..."│
│ - Responde con JSON de preguntas             │
│ - O timeout → intenta IA 2 (Kimi)            │
└──────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────────┐
│ Edge Function (audit-generated-questions)    │
│ - Auditor IA revisa cada pregunta            │
│ - Valida tema, respuesta, dificultad         │
│ - Reformula si es necesario                  │
│ - Devuelve preguntas mejoradas               │
└──────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────────┐
│ Backend (Supabase)                           │
│ - Inserta filas en tabla questions           │
│ - Marca como audit_status='approved'         │
│ - Branch = Dojo ID                           │
│ - source_type = 'incident_investigation'     │
│ - source_type: 'manual' para manuales        │
└──────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────────┐
│ Frontend (Questions Panel)                   │
│ - Muestra 50 preguntas (20+30)                │
│ - Editor permite editar antes de publicar    │
│ - Admin revisa y publica                     │
└──────────────────────────────────────────────┘
```

### 4. Flujo de Consulta Sensei IA

```
Usuario escribe pregunta en chat
    ↓
┌──────────────────────────────────────────────┐
│ SenseiConsultPage.tsx                        │
│ - Valida que texto no esté vacío             │
│ - Envía pregunta a Backend                   │
└──────────────────────────────────────────────┘
    ↓ POST /functions/v1/ask-sensei
┌──────────────────────────────────────────────┐
│ Edge Function (ask-sensei)                   │
│ - Valida tema: ¿es ciberseguridad?           │
│ - Busca en banco de preguntas (similarity)   │
│ - Si no encuentra, consulta IA               │
└──────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────────┐
│ IA Externa (DeepSeek/Claude)                 │
│ - Responde en lenguaje simple y accesible    │
│ - Formato: texto + posibles ejemplos         │
│ - Duración: breve pero completa              │
└──────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────────┐
│ Backend (Supabase)                           │
│ - Inserta en sensei_consultations            │
│ - Campos: question_text, answer_text         │
│ - Detecta sentimiento                        │
│ - Marca tema (is_cybersecurity=true/false)   │
└──────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────────┐
│ Frontend (Chat)                              │
│ - Muestra respuesta de Sensei                │
│ - Botones: "¿Útil?" / "¿No útil?"            │
│ - Usuario marca feedback                     │
└──────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────────┐
│ Backend UPDATE                               │
│ - Registra feedback_helpful = true/false     │
│ - Registra sentimiento del usuario           │
│ - Actualiza estadísticas en vista agregada   │
└──────────────────────────────────────────────┘
```

---

## Seguridad y Autenticación

### Autenticación

```
┌─────────────────────────────────────────┐
│ SUPABASE AUTH (Session-based)           │
├─────────────────────────────────────────┤
│                                         │
│ 1. Usuario ingresa email + contraseña   │
│    ↓                                    │
│ 2. Supabase valida contra auth.users    │
│    ↓                                    │
│ 3. Si correcto:                         │
│    - Genera JWT token (válido 1 hora)   │
│    - Genera refresh token (válido 7d)   │
│    - Devuelve session                   │
│    ↓                                    │
│ 4. Frontend guarda tokens en:           │
│    - Memory (sesión actual)             │
│    - localStorage (persistencia)        │
│    - sessionStorage (seguridad)         │
│    ↓                                    │
│ 5. Cada petición incluye token          │
│    Authorization: Bearer <jwt>          │
│    ↓                                    │
│ 6. Backend verifica JWT:                │
│    - Firma válida                       │
│    - No expirado                        │
│    - Usuario activo                     │
│    ↓                                    │
│ 7. Si token expirado:                   │
│    - Intenta usar refresh token         │
│    - Obtiene nuevo JWT                  │
│    - Continúa sesión                    │
│                                         │
└─────────────────────────────────────────┘
```

### Autorización (RLS - Row Level Security)

```
Cada tabla tiene políticas de control:

┌─────────────────────────────────────────┐
│ Tabla: users                            │
├─────────────────────────────────────────┤
│ SELECT: auth.uid() = users.id           │
│ (cada usuario solo ve sus propios datos)│
│                                         │
│ UPDATE: auth.uid() = users.id           │
│ (cada usuario solo modifica sus datos)  │
│                                         │
│ INSERT: auth.uid() = ?                  │
│ (solo nuevo usuario puede crear su fila)│
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Tabla: sensei_consultations             │
├─────────────────────────────────────────┤
│ SELECT: auth.uid() = user_id            │
│         OR is_admin()                   │
│ (usuario ve sus consultas,              │
│  admin ve todas)                        │
│                                         │
│ INSERT: auth.uid() = user_id            │
│ (usuario crea sus propias consultas)    │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Tabla: questions                        │
├─────────────────────────────────────────┤
│ SELECT: true                            │
│ (visible a todos autenticados)          │
│                                         │
│ INSERT: is_admin()                      │
│ UPDATE: is_admin()                      │
│ (solo admin puede modificar)            │
└─────────────────────────────────────────┘
```

### Funciones de Seguridad

```sql
-- Verificar si usuario es admin
FUNCTION is_admin()
  Devuelve TRUE si:
  - user role = 'admin' en tabla users
  - email en lista blanca de admins
  - Caso contrario FALSE

-- Trigger de auditoría
ON UPDATE de cualquier tabla
  - Registra quién cambió qué
  - Timestamp de cambio
  - Valor anterior vs actual

-- Política de eliminación
ON DELETE de usuarios
  - Elimina todas sus filas relacionadas
  - Cascade: evaluations, katas_completions, etc.
  - Preserva datos anónimos para analytics
```

### Protección de Contraseñas

```
Frontend:
- Validación: 8+ caracteres
- Requerimientos: mayúscula, minúscula, número, símbolo
- No envía en texto plano (siempre HTTPS)

Backend (Supabase Auth):
- Hash con bcrypt (10 rounds)
- Salt único por usuario
- Nunca almacena en texto plano
- Comparación segura contra hash

Cambio de contraseña:
- Requiere contraseña antigua
- Genera nuevo hash
- Invalida todas las sesiones existentes
- Requiere re-login
```

---

## Escalabilidad y Performance

### Optimizaciones de Frontend

```
1. Code Splitting
   - React Router lazy loads pantallas
   - Componentes grandes divididos
   - Reduce JS inicial: ~50KB gzip

2. Lazy Loading de Imágenes
   - Sensei avatar carga bajo demanda
   - Íconos de Lucide tree-shaked

3. State Management (Zustand)
   - Store centralisado
   - Menos re-renders
   - Persistencia local

4. Memoization
   - React.memo para componentes costosos
   - useMemo para cálculos
   - useCallback para funciones
```

### Optimizaciones de Base de Datos

```
1. Índices
   CREATE INDEX idx_questions_branch ON questions(branch);
   CREATE INDEX idx_evaluations_user ON evaluations(user_id);
   
2. Vistas Materializadas
   - sensei_consultation_stats
   - belt_progression_summary
   - user_points_leaderboard
   
3. Particionamiento
   - evaluations por mes (grandes volúmenes)
   - sensei_consultations por año
   
4. Query Optimization
   - SELECT solo columnas necesarias
   - JOIN eficientes
   - LIMIT para paginación
```

### Escalabilidad de IA

```
Múltiples proveedores (fallback)
- Si DeepSeek timeout → Kimi
- Si Kimi timeout → Claude
- Si todas fallan → error graceful

Cache de respuestas
- Preguntas similares reutilizan respuesta
- Reduce llamadas a IA
- Ahorro de costo

Batching de solicitudes
- Agrupa hasta 5 solicitudes
- Una llamada por lote
- Más eficiente que individual

Rate Limiting
- Max 10 consultas/usuario/minuto
- Max 1000 llamadas/IA/día
- Evita abuso
```

### CDN y Distribución

```
Frontend
- Hosted en Vercel/Netlify
- CDN global automático
- Caché agresivo para estáticos

Backend (Edge Functions)
- Ejecutadas en múltiples regiones
- Latencia baja para usuarios
- Escalado automático

Base de Datos
- Supabase maneja replicación
- Backups automáticos (diarios)
- Failover transparente
```

---

## Deployment

### Ambiente Local

```bash
# Clonar repositorio
git clone https://github.com/shield-ecuador/cyber-dojo.git

# Instalar dependencias Frontend
cd frontend
npm install

# Configurar Supabase local
cd ../supabase
supabase start

# Configurar variables de entorno
cat > frontend/.env.local << EOF
REACT_APP_SUPABASE_URL=http://localhost:54321
REACT_APP_SUPABASE_KEY=eyJh...
EOF

# Levantar Frontend
cd ../frontend
npm start  # http://localhost:3000

# Levantar Admin Console
cd ../central-admin-app
npm install
node server.js  # http://localhost:3100
```

### Ambiente Producción

```
Frontend (Vercel)
- Repositorio conectado a GitHub
- Deploy automático en cada push
- Build: npm run build
- Hosting: Vercel CDN global

Backend (Supabase Cloud)
- Proyecto en supabase.com
- Base de datos PostgreSQL gestionada
- Edge Functions automáticamente escaladas
- Backups automáticos diarios

Admin Console
- Deploy en servidor compartido
- PM2 para gestionar proceso Node.js
- Nginx para reverse proxy
- HTTPS con Let's Encrypt

Monitoreo
- Error tracking: Sentry
- Performance: New Relic
- Logs: CloudWatch / Papertrail
- Alertas: PagerDuty
```

### Variables de Entorno

```
Frontend (.env)
REACT_APP_SUPABASE_URL=https://xxx.supabase.co
REACT_APP_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIs...
REACT_APP_ENV=production

Backend (Supabase Secrets)
DEEPSEEK_API_KEY=sk-...
KIMI_API_KEY=...
CLAUDE_API_KEY=sk-ant-...
ADMIN_EMAILS=admin@cyberdojo.ec,user@cyberdojo.ec

Admin Console (.env)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIs...
PORT=3100
NODE_ENV=production
```

### CI/CD

```yaml
GitHub Actions Pipeline

on: push to main branch
  ↓
1. Lint & Format Check
   - ESLint en Frontend
   - SQL Format en migraciones
   
2. Automated Tests
   - Jest para Frontend
   - Edge Function tests
   - Database tests
   
3. Build
   - npm run build (Frontend)
   - SQL compilación
   
4. Deploy Staging
   - Preview en Vercel
   - BD test con datos sample
   - E2E tests
   
5. Manual Approval
   - Revisión de cambios
   - Checklist de validación
   
6. Deploy Production
   - Vercel: Frontend
   - Supabase: Migraciones
   - GitHub Releases
   
7. Smoke Tests
   - Validar salud de prod
   - Alertas si falla
```

---

## Resumen Arquitectónico

### Componentes Clave

| Componente | Responsabilidad | Tecnología |
|-----------|-----------------|-----------|
| Frontend | UI/UX, interacción usuario | React, TypeScript, Framer Motion |
| Auth | Autenticación usuarios | Supabase Auth (JWT) |
| API | Datos en tiempo real | Supabase PostgREST |
| Base Datos | Persistencia | PostgreSQL |
| Edge Functions | Lógica backend | Node.js serverless |
| IA Generativa | Contenido/análisis | DeepSeek, Kimi, Claude |
| Admin | Configuración | Node.js + HTML/CSS/JS |

### Flujo de Datos Global

```
Usuario (Cliente)
    ↓↑
React App (Frontend)
    ↓↑ (HTTP/JSON)
Supabase API Gateway
    ↓↑
┌─────────────────────────────────────────┐
│ - PostgREST API (CRUD)                  │
│ - Realtime (suscripciones)              │
│ - Edge Functions (lógica compleja)      │
└─────────────────────────────────────────┘
    ↓↑
┌─────────────────────────────────────────┐
│ PostgreSQL Database                     │
│ - Tablas de usuario                     │
│ - Preguntas y respuestas                │
│ - Historiales                           │
│ - Consultas IA                          │
└─────────────────────────────────────────┘
    ↓↑ (API Calls)
┌─────────────────────────────────────────┐
│ Servicios Externos                      │
│ - DeepSeek / Kimi / Claude (IA)         │
│ - CISA / BleepingComputer (noticias)    │
│ - Email verification services           │
└─────────────────────────────────────────┘
```

---

## Conclusión

Cyber Dojo es una plataforma compleja pero bien estructurada que combina:

1. **Frontend moderno** (React) con experiencia de usuario gamificada
2. **Backend robusto** (Supabase) con control de acceso granular
3. **Múltiples agentes de IA** que generan contenido dinámico
4. **Seguridad en capas** (autenticación, autorización, encriptación)
5. **Escalabilidad** mediante arquitectura serverless

El sistema está diseñado para crecer con el número de usuarios sin comprometer performance, manteniendo seguridad e integridad de datos.

---

## Referencias Técnicas

- **Supabase Docs:** https://supabase.com/docs
- **React Docs:** https://react.dev
- **PostgreSQL Docs:** https://www.postgresql.org/docs
- **Edge Functions:** https://supabase.com/docs/guides/functions
- **RLS Policies:** https://supabase.com/docs/guides/auth/row-level-security
- **TypeScript Handbook:** https://www.typescriptlang.org/docs
