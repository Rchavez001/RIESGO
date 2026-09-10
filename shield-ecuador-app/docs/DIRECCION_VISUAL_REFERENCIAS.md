# Dirección visual de ciberDojo a partir de los ejemplos

Referencia revisada el 10 de septiembre de 2026. Esta propuesta no modifica la aplicación publicada.

## Material observado

- `videos/ejemplos/hacerlo_sin_audio.mp4`: 1280 × 720, duración medida de 10,005 segundos. Se inspeccionaron seis instantes repartidos por el clip. Muestra un sensei con apariencia humana realista, uniforme negro, encuadre frontal y un interior tecnológico con iluminación azul clara y pantallas al fondo. En las muestras el encuadre y la postura se mantienen muy similares: no representan una secuencia de combate.
- `videos/ejemplos/cyber_dojo_fichas_y_arte_completo.zip`: fichas de Kira y V.I.R.U.S., tarjeta de enfrentamiento, cuatro imágenes de escenas, dos avatares, una ficha técnica y un visor HTML. Las fichas de Kira y del enfrentamiento muestran arte digital de personajes con detalle de piel, cabello, tela y armadura; combinan fantasía de videojuego con materiales de apariencia realista.
- La ficha técnica propone un combate de cinco segundos con cuatro fases: choque aéreo, evasión, impacto y remate. Sus menciones de 60 fotogramas por segundo y WebM son especificaciones del documento, no propiedades verificadas del MP4 recibido. El ZIP no contiene un archivo de modelo tridimensional ni un video de ese combate.

## Propuesta para la aplicación

El sensei del video orienta la identidad principal: presencia humana, encuadre tranquilo, luz azul y espacio de dojo tecnológico. Usar un retrato o un clip breve en la bienvenida, al entrar al entrenamiento y al explicar un logro. Durante las preguntas, el personaje permanece quieto para facilitar la lectura.

El material de Kira y su adversario orienta las recompensas y la presentación de desafíos. Reservar enfrentamientos y efectos de energía para momentos puntuales, especialmente después de leer un resultado. Presentar nombres comprensibles —por ejemplo, «Kira, tu guía» y «El ladrón de cuentas»— y evitar que estadísticas ficticias como velocidad Mach o daño numérico compitan con el objetivo educativo.

Mantener las preguntas como texto real de la aplicación, con opciones grandes, contraste y explicaciones legibles. No insertar las fichas completas como interfaz: su texto pequeño, sus estadísticas y sus proporciones verticales requieren adaptación al celular.

## Habilidades y recursos

- `video-to-superprompt`: convertir estas referencias en un encargo visual preciso.
- `build-hybrid-game-assets`: elegir y preparar imágenes, clips y, cuando sea necesario, modelos tridimensionales.
- `frontend-design`: integrar la identidad visual en las pantallas del aprendizaje.
- `imagegen`: producir retratos y escenarios adicionales coherentes con los originales. Genera imágenes; para crear nuevos clips hace falta una herramienta de video o animación.
- `animation-systems` o `gsap`: coordinar transiciones y movimientos de la interfaz. No convierten por sí solos una imagen en un personaje tridimensional animado.

Para comenzar se pueden utilizar directamente el video y los avatares suministrados, tras revisar su presentación en celular. Un combate tridimensional interactivo necesitaría modelos preparados para animación, movimientos, iluminación y pruebas de rendimiento adicionales.

## Encargo de implementación

```text
Adaptar ciberDojo con dirección cinematográfica basada en el sensei del archivo
hacerlo_sin_audio.mp4 y con recompensas inspiradas en el arte de Kira del ZIP.
Conservar el banco, los siete cinturones, las 30 respuestas obligatorias, el
guardado por cuenta y los exámenes de cinco casos con cuatro aciertos mínimos.

Crear una bienvenida con el sensei en un dojo tecnológico de tonos azul claro,
materiales creíbles y cámara estable. Ofrecer reproducción breve y control para
omitirla. Mostrar una imagen de portada mientras carga el video y cuando la
persona prefiera menos movimiento. Mantener el video sin sonido automático.

Durante el entrenamiento, conservar al sensei como presencia secundaria y
mantener quietos el enunciado, las opciones y la explicación. Emplear botones
amplios y texto adaptable a celulares. No situar texto educativo dentro de
imágenes ni sobre fondos con movimiento intenso.

Al completar un dojo o aprobar un kata, permitir una celebración breve con Kira
y energía azul, usando rojo solo para identificar la amenaza ficticia. Mostrar
primero el resultado y permitir leer todas las explicaciones. Una respuesta
incorrecta activa orientación amable, nunca una humillación o pérdida de vidas.

Usar los archivos existentes como referencias y recursos identificados. Marcar
como pendientes los nuevos clips o modelos necesarios; no presentar imágenes
estáticas como si fueran un combate tridimensional ejecutado en tiempo real.
Validar carga, lectura, controles y progreso en celular antes de publicar.
```
