# Propuesta cinematográfica local

La propuesta se integró en la aplicación real. Abrir `http://localhost:3001`; iniciar con `node proposal/server.cjs` desde la raíz después de compilar `frontend`. Ver `docs/APLICACION_CINEMATICA_LOCAL.md`.

Este directorio conserva el prototipo usado por la práctica sin cuenta, accesible desde `http://localhost:3001/practica`. `scripts/prepare_cinematic_assets.py` lo prepara en `frontend/public/demo` antes de compilar.

Prototipo navegable independiente de producción: portada, siete cinturones, cuatro compañeros (incluido DoggoTeka), 30 preguntas del banco real por dojo, explicaciones, reanudación en el navegador, kata de cinco casos y resultado con ascenso local. Los exámenes se abren después de 30 respuestas; aprobar requiere cuatro aciertos. La celebración puede previsualizarse desde «Conocer el kata».

La demostración usa `ciberdojo-cinematic-proposal-v1` y `ciberdojo-demo-route` en localStorage. No usa sesiones ni escribe en Supabase. La calificación local es solo para practicar; la aplicación real conserva su propia calificación en el servidor.

Recursos: video `hacerlo_sin_audio.mp4` y arte de `cyber_dojo_combate_completo_con_personajes.zip`, proporcionados por el usuario en `videos/ejemplos`. Los archivos de `assets` son copias sin alteraciones. Los retratos y combates son imágenes, no modelos 3D. La celebración aplica una transición sobre arte estático; no se presenta como video de combate generado.

El video se reproduce una vez, sin audio automático, con botón de pausa y controles en el diálogo. Se extrajo un fotograma del video como `sensei-poster.jpg` para mostrarlo inmediatamente durante la carga. La preferencia de movimiento reducido desactiva su reproducción automática. Durante las preguntas no se reproduce video. Las imágenes secundarias se cargan de forma diferida. No se añaden paquetes, herramientas remotas ni fuentes externas.

Verificado con `node tests/proposal.visual.cjs`: elección de guía, explicación guardada al recargar, 30 respuestas, bloqueo del kata sin entrenamiento, cinco casos, resultado, ascenso local, celebración, pantalla móvil sin desbordamiento y ausencia de peticiones externas o errores del navegador. Las capturas se guardan en `test-results/proposal-*.png`.
