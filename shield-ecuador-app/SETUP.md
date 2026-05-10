# Shield Ecuador - Cyber Dojo
## Guía de Setup Rápido

---

## PASO 1: Supabase (Backend)

### Opción A: Supabase Cloud (recomendado)
1. Crear proyecto en https://supabase.com/dashboard
2. Copiar `Project URL` y `anon key` desde Settings → API

### Opción B: Supabase Local
```bash
cd shield-ecuador-app
supabase start
# Anotarás: API URL y anon key del output
```

### Aplicar migraciones
```bash
# Con proyecto cloud (requiere login):
supabase link --project-ref TU_PROJECT_REF
supabase db push

# O en el Dashboard → SQL Editor, ejecutar en orden:
# 1. supabase/migrations/001_initial_schema.sql
# 2. supabase/migrations/002_rls_policies.sql
# 3. supabase/migrations/003_seed_data.sql
```

### Deploy Edge Functions
```bash
supabase functions deploy calculate-risk
supabase functions deploy generate-recommendations
supabase functions deploy analyze-email
supabase functions deploy run-incident-investigator
supabase functions deploy audit-generated-questions
supabase functions deploy run-daily-agent-workflows

# Configurar secrets para las AI APIs:
supabase secrets set DEEPSEEK_API_KEY=tu_key
supabase secrets set ANTHROPIC_API_KEY=tu_key
```

---

## PASO 2: Frontend

```bash
cd frontend

# Copiar y editar variables de entorno:
cp .env.example .env
# Editar .env con tu SUPABASE_URL y SUPABASE_ANON_KEY

# Ejecutar en desarrollo:
npm start

# O build para producción:
npm run build
```

---

## PASO 3: Variables de entorno requeridas

En `frontend/.env`:
```
REACT_APP_SUPABASE_URL=https://xxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJ...
```

En Supabase Edge Functions (via `supabase secrets set`):
```
DEEPSEEK_API_KEY=sk-...
KIMI_API_KEY=sk-...          (opcional, fallback)
ANTHROPIC_API_KEY=sk-ant-... (opcional, fallback)
```

---

## Estructura del proyecto

```
shield-ecuador-app/
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql   ← Tablas + triggers
│   │   ├── 002_rls_policies.sql     ← Row Level Security
│   │   └── 003_seed_data.sql        ← Preguntas, katas, datos
│   └── functions/
│       ├── calculate-risk/          ← Calcula puntaje y cinturón
│       ├── generate-recommendations/← Llama a AI para recomendaciones
│       └── analyze-email/           ← Detecta phishing en correos
└── frontend/
    └── src/
        ├── lib/supabase.ts          ← Cliente Supabase + tipos
        ├── contexts/AuthContext.tsx ← Auth state global
        ├── screens/
        │   ├── LoginScreen.tsx      ← Login / Registro
        │   ├── DashboardScreen.tsx  ← Dashboard principal
        │   └── ResultsScreen.tsx    ← Resultados evaluación
        └── components/
            └── AdaptiveQuestionnaire.tsx ← Cuestionario adaptativo
```

---

## Criterios de éxito (checklist)

- [ ] Registro e inicio de sesión funcionando
- [ ] Cuestionario adaptativo completo end-to-end
- [ ] Cálculo de cinturón correcto (Edge Function)
- [ ] Evaluación guardada en base de datos
- [ ] RLS activo (usuarios no ven datos ajenos)
- [ ] Dashboard muestra cinturón y puntos
- [ ] Katas listados y marcables como completados
- [ ] Alertas de seguridad visibles
