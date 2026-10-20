# Demo local del módulo de Consentimiento Informado

Guía para una persona **no técnica**: cómo arrancar el entorno de demostración en tu propia
computadora, y un recorrido paso a paso por todas las pantallas del módulo.

Todo corre en tu máquina (localhost). No toca producción ni envía nada a internet: el script que
lo levanta se niega a arrancar si detecta cualquier dirección que no sea `127.0.0.1`/`localhost`, y
solo crea cuentas de prueba con correos `@example.test` (un dominio reservado que no existe en
internet).

## 1. Requisitos (una sola vez)

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y abierto (Supabase
  local corre dentro de contenedores Docker).
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) instalado.
- [Node.js](https://nodejs.org/) instalado (incluye `npm`).
- El cliente de línea de comandos de PostgreSQL (`psql`). En Windows suele instalarse junto con
  [PostgreSQL](https://www.postgresql.org/download/windows/) — durante la instalación basta
  marcar "Command Line Tools"; no necesitas el servidor de PostgreSQL en sí.
- Una terminal **Git Bash** (viene con [Git para Windows](https://git-scm.com/downloads)).
- Una app autenticadora en tu celular (Google Authenticator, Microsoft Authenticator, Authy…) para
  el segundo factor del panel de administración.

## 2. Arrancar la demo

Abre Git Bash en la carpeta del proyecto (`RIESGO`) y ejecuta:

```bash
bash shield-ecuador-app/scripts/demo-local.sh start
```

La primera vez puede tardar varios minutos (descarga imágenes de Docker y compila el frontend).
Las siguientes veces es más rápido.

Al terminar, verás en la terminal un bloque como este (los valores reales cambian en cada corrida):

```
================================================================================
 Entorno de demostración LOCAL listo
================================================================================

 Frontend (usuarios):        http://127.0.0.1:3000
 Panel de administración:    http://127.0.0.1:3100
   Usuario/clave (acceso compartido de la consola, HTTP Basic):
     Usuario:  demo-admin
     Clave:    Panel-xxxxxxxx-xxxx-...

 Admin de prueba del módulo de Consentimiento (rol privacy_admin):
     Correo:    demo-admin@example.test
     Clave:     Demo-xxxxxxxx-xxxx-...
     Clave TOTP (entrada manual en tu app autenticadora):
       ABCD2345EFGH6789...

 Usuario normal de prueba (ya registrado, con su consentimiento otorgado):
     Correo:    demo-usuario@example.test
     Clave:     Demo-xxxxxxxx-xxxx-...
================================================================================
```

**Copia esos cuatro datos a algún lado** (usuario/clave del panel, correo/clave/TOTP del admin,
correo/clave del usuario normal) antes de seguir — los vas a necesitar en los pasos de abajo.

### Registrar la clave TOTP en tu celular

En tu app autenticadora, elige "Agregar cuenta" → "Ingresar clave de configuración manualmente" (o
equivalente) y pega la "Clave TOTP" de arriba. Dale un nombre como "CiberDojo demo". La app
empezará a mostrarte un código de 6 dígitos que cambia cada 30 segundos — lo vas a usar para
entrar al panel.

## 3. Detener la demo

```bash
bash shield-ecuador-app/scripts/demo-local.sh stop
```

Esto apaga el panel, el frontend y las funciones de Supabase. La base de datos local (Docker)
queda corriendo para que la próxima vez arranque más rápido; si además quieres apagarla:

```bash
cd shield-ecuador-app && supabase stop
```

**Nota:** cada vez que ejecutas `start`, la base de datos local se reinicia a un estado limpio
conocido (el mismo admin, el mismo usuario de prueba, el mismo aviso publicado). Cualquier cambio
que hayas hecho en una sesión anterior (borradores nuevos, solicitudes, etc.) se pierde al volver a
arrancar — es justamente lo que permite repetir el recorrido de abajo tantas veces como quieras.

---

## 4. Recorrido guiado

### 4.1 Registro de un usuario nuevo (el aviso de privacidad)

1. Abre `http://127.0.0.1:3000` en tu navegador.
2. Ve a **Registro** (o entra directo a `/registro`).
3. Primero verás el aviso de privacidad completo, con una casilla por cada finalidad:
   - **Registro y aprendizaje** (obligatoria) — no puedes continuar sin marcarla.
   - **Opcional · Novedades**.
   - **Opcional · Publicidad personalizada**.
   Marca la obligatoria (y las opcionales que quieras) y confirma que eres mayor de 15 años, luego
   pulsa **Acepto y continuar**.
4. Ahora verás el formulario de la cuenta: nombre, correo (puedes inventar uno, p. ej.
   `prueba1@example.test`), contraseña y sector económico. Llénalo y pulsa **FORJAR CUENTA**.
5. Quedas registrado con exactamente las finalidades que marcaste en el paso 3 — eso es lo que el
   panel podrá consultar más adelante como "evidencia de consentimiento".

### 4.2 "Mi privacidad" (como usuario ya registrado)

1. Inicia sesión en `http://127.0.0.1:3000/login` con el usuario de prueba ya preparado:
   `demo-usuario@example.test` y la clave que te imprimió el script.
2. En el menú, entra a **Mi privacidad**.
3. Verás el estado de cada finalidad opcional:
   - **Novedades**: activa.
   - **Publicidad personalizada**: inactiva.
4. Actívala y desactívala con un clic (la casilla), sin pedir confirmación — así funciona para el
   usuario: cambiar de opinión sobre lo opcional es inmediato.
5. Más abajo, en "Solicitar un derecho sobre mis datos (baja y demás)": elige **Baja de la
   cuenta**, escribe un motivo opcional y pulsa **Enviar solicitud**. Anota el número de caso que
   te muestra — lo vas a buscar luego en el panel.

### 4.3 Entrar al panel como administrador

1. Abre `http://127.0.0.1:3100`.
2. El navegador pedirá usuario y contraseña (HTTP Basic): usa el **usuario/clave del panel**
   (`demo-admin` / la clave que imprimió el script) — esto es el acceso compartido de la consola,
   distinto de tu cuenta individual.
3. En el menú lateral, pulsa **Consentimiento informado**.
4. Inicia sesión con tu cuenta individual: correo `demo-admin@example.test` y su clave (la del
   admin, no la del panel).
5. Te pedirá un **código de 6 dígitos**: ábrelo en tu app autenticadora (la cuenta "CiberDojo
   demo" que registraste en el paso 2) y escríbelo.
6. Verás tu identidad ("Sesión individual: demo-admin@example.test") y tus roles
   (`privacy_admin`). A partir de aquí, cada acción que hagas queda registrada a tu nombre en la
   bitácora.

### 4.4 Editar un borrador, compararlo y publicarlo (con reconsentimiento)

Todo esto vive en la sección **Versiones del aviso**, más arriba en la misma página del panel.

1. Pulsa **Crear borrador desde vigente**, escribe una versión nueva (p. ej. `1.1`) y un resumen
   de cambios opcional.
2. En la fila del borrador nuevo, pulsa **Editar**: cambia algo del texto (p. ej. agrega una
   frase) y pulsa **Guardar cambios**. El editor autoguarda mientras escribes.
3. Pulsa **Comparar**: verás la diferencia línea por línea contra la versión vigente (1.0).
4. Cierra la comparación y pulsa **Publicar**. En el formulario:
   - Marca **"Requiere reconsentimiento de los titulares"**.
   - Escribe un motivo (obligatorio).
   - Escribe la versión exacta (`1.1`) para confirmar.
   - Pulsa **Publicar**.
5. Ahora vuelve al frontend (`http://127.0.0.1:3000`) e inicia sesión como
   `demo-usuario@example.test`. Como marcaste "Requiere reconsentimiento", este usuario (que había
   aceptado la versión 1.0) ve el aviso de la nueva versión antes de poder usar el resto de la
   aplicación, y tiene que volver a decidir sus finalidades para continuar.

### 4.5 Cambiar el correo del delegado

En la sección **Correo de privacidad** (más abajo en el panel):

1. Escribe un correo nuevo (p. ej. `delegado-nuevo@example.test`) y pulsa **Solicitar cambio**.
2. Verás que el sistema pide un código de verificación enviado a ese correo nuevo, antes de dejarlo
   vigente.

**En este entorno local no vas a recibir ese código de verdad.** Es a propósito: el sistema
bloquea por seguridad el envío a direcciones de correo locales o internas (protección contra
ataques de tipo SSRF) y este entorno no tiene un proveedor de correo real configurado. En
producción, con Resend configurado, el delegado recibiría el código en su bandeja y lo
confirmaría en el campo que aparece debajo. Aun así, esta pantalla te deja ver exactamente cómo se
inicia el cambio y qué le pide al administrador.

### 4.6 Ver la bitácora

En la sección **Bitácora administrativa**:

1. Verás, en orden, cada acción que hiciste arriba (inicio de sesión verificado, creación de
   borrador, publicación, etc.), con tu correo y la hora.
2. Prueba los filtros (por acción, por fecha) y abre el detalle de alguna fila para ver el
   "antes/después" de ese cambio.
3. Puedes exportar a CSV (te pedirá un motivo).

### 4.7 Buscar evidencia y revelar una IP

En la sección **Evidencia de consentimiento**:

1. Busca por el correo `demo-usuario@example.test` (o por su ID de usuario).
2. Verás una fila por cada finalidad que decidió esa persona al registrarse, con fecha y versión
   del aviso — pero la dirección IP aparece oculta.
3. Para verla, escribe un motivo en "Motivo para revelar la IP real" y pulsa **Revelar IP**.
   Esa acción también queda registrada en la bitácora (sección anterior), a tu nombre y con el
   motivo que escribiste.

### 4.8 Solicitudes de baja (y demás derechos)

En la sección **Solicitudes de derechos**:

1. Verás la solicitud de "Baja de la cuenta" que enviaste en el paso 4.2, con su número de caso.
2. Ábrela y cambia su estado (p. ej. a "en proceso" o "resuelta"), con una nota de resolución.
3. Filtra la lista por estado para ver cómo se vería con muchas solicitudes pendientes.

---

## 5. Si algo no responde

- Revisa los registros (logs) de cada proceso — la terminal donde corriste `start` te dice dónde
  quedaron (una carpeta temporal, impresa al final junto con las URL).
- Si el panel o el frontend no cargan, confirma que Docker Desktop sigue abierto y que
  `bash shield-ecuador-app/scripts/demo-local.sh start` no reportó ningún "ABORTA".
- Para empezar de cero: `bash shield-ecuador-app/scripts/demo-local.sh stop` y luego `start` de
  nuevo.
