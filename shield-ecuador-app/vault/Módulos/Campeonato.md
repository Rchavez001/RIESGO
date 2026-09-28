← [[Índice]]

Torneo 1v1 programado (no en tiempo real), reemplazó al antiguo menú "Ranking". Configurable desde el panel admin (pestaña **Campeonato**): reglas por cinturón/edad, fechas de inscripción, preguntas por combate y tiempo límite por dificultad (fácil/media/difícil) — **el límite de tiempo se verifica en el servidor**, no solo en la pantalla del estudiante.

## Flujo

1. Admin configura y abre inscripciones (`championships.status`).
2. `championship-draw-round1` empareja aleatoriamente a los inscritos, crea los combates (`championship_matches`) y envía un correo real a cada uno vía Resend con fecha/hora y ventana para completarlo.
3. Cada combate corre server-side: `championship_start_match` / `championship_answer_question` (RPCs) llevan el cronómetro real, no confían en el cliente.

## Nota histórica

Migración `051_fix_championship_difficulty_source.sql` corrigió un bug de datos real: el tiempo por pregunta usaba `content.difficulty` (escala global 1-21) en vez de `learning_items.sublevel` (1-3, relativo al cinturón) — se descubrió probando con datos reales, no en revisión de código.

La clave de Resend (`resend_api_key` en `app_secrets`, cifrada en Vault) se comparte con el [[Módulos/Centro de Seguridad|Centro de Seguridad]] para sus avisos de umbral.
