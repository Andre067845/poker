# Póker entre Amigos

Aplicación web para jugar **Texas Hold'em No Limit** en tiempo real con amigos, desde el celular o la computadora, entrando por un enlace de invitación. Interfaz en español, mesa 2D.

> Todas las cantidades se muestran en **Bs**, pero son **Bs virtuales gratuitos** (fichas de juego): no son dinero real, no se compran, no se canjean y no hay premios.

## Arquitectura

| Capa | Tecnología |
|---|---|
| Servidor | Node.js 22 (≥ 22.13) + Express + Socket.IO |
| Base de datos | SQLite mediante el módulo incorporado `node:sqlite` (archivo `data/poker.db`, sin dependencias nativas) |
| Cliente | SPA en JavaScript sin paso de compilación (`public/`) |
| Motor de juego | `server/engine/` — puro y determinista, probado por separado |

- El **servidor es la única autoridad**: reparte, baraja (Fisher–Yates con `crypto.randomInt`), controla turnos, valida apuestas y calcula resultados. El navegador solo envía intenciones (`fold`, `call`, `raise` a X…).
- Cada jugador recibe **solo sus cartas privadas**; las rivales se revelan únicamente en el showdown, y nunca las de quien se retiró.
- Cada acción lleva un `turnId` (rechaza acciones fuera de turno o tardías) y un `actionId` (descarta duplicados). Sentarse y recargar usan claves de idempotencia únicas en la base de datos, así que recargar la página o reconectarse no duplica movimientos.

```
server/
  engine/cards.js       baraja y barajado criptográfico
  engine/evaluator.js   evaluación de la mejor mano de 5 entre 7
  engine/holdem.js      una mano completa: ciegas, rondas, botes, showdown
  tables.js             mesas en tiempo real: asientos, temporizador, reconexión, persistencia
  auth.js               registro y login con usuario y contraseña (scrypt), sesiones por cookie HttpOnly, código de recuperación
  history.js            historial de sesiones y balance de fichas
  app.js / index.js     HTTP + Socket.IO
public/                 interfaz (index.html, app.js, styles.css, sound.js)
test/                   pruebas del motor y de integración multijugador
```

## Puesta en marcha

```bash
npm install
```

```bash
npm start
```

Abrí `http://localhost:3000`. Para jugar con amigos a distancia el servidor tiene que estar publicado en internet (ver *Despliegue*).

### Variables de entorno

| Variable | Para qué | Valor por defecto |
|---|---|---|
| `PORT` | Puerto HTTP | `3000` |
| `DB_FILE` | Ruta del archivo SQLite | `data/poker.db` |
| `COOKIE_SECURE` | `1` para marcar la cookie como `Secure` (con HTTPS) | `0` |
| `TRUST_PROXY` | `1` si corre detrás de un proxy/CDN que termina HTTPS | `0` |
| `GRACE_SECONDS` | Período de gracia por desconexión antes de liberar el asiento | `180` |
| `DATABASE_URL` | Postgres donde se respalda la base (para hostings sin disco, p. ej. Neon) | vacío |
| `RESULT_DELAY_MS` | Pausa para ver el resultado (y poder mostrar cartas) antes de la siguiente mano | `8000` |

**No hace falta ningún servicio externo.** Las cuentas solo piden nombre de usuario y contraseña (no se pide correo).

### Recuperar la contraseña sin correo

Al crear la cuenta se muestra **una sola vez** un código de recuperación (`XXXX-XXXX-XXXX-XXXX`) y el usuario debe confirmar que lo guardó. Con su usuario y ese código puede elegir una contraseña nueva desde "¿Olvidaste tu contraseña?"; en ese momento se cierran sus otras sesiones y se le entrega un código nuevo (el anterior deja de servir). Desde el lobby puede generar otro código ingresando su contraseña actual. Los códigos se guardan cifrados (scrypt), igual que las contraseñas. Si alguien pierde la contraseña y el código, la cuenta no se puede recuperar.

## Publicarla en internet GRATIS (Render + Neon)

Sin pagar nada y sin tarjeta: **Render** (plan Free) corre el servidor y **Neon** (plan Free) guarda una copia de la base de datos, porque el plan gratis de Render no tiene disco propio.

**1. Base de datos gratis en Neon**
1. Entrá a https://neon.tech y creá una cuenta (podés usar tu GitHub).
2. Creá un proyecto (cualquier nombre, región cercana).
3. En *Connection Details* copiá la **connection string**: se ve como `postgresql://usuario:clave@ep-xxxx.neon.tech/neondb?sslmode=require`. Es secreta: no la compartas.

**2. Servidor gratis en Render**
1. Entrá a https://render.com y creá una cuenta con tu GitHub.
2. **New → Blueprint** → elegí el repositorio **andre067845/poker** (y la rama donde está este código, o uní la rama a `main`).
3. Render lee `render.yaml` (plan **Free**) y te pide `DATABASE_URL`: pegá la connection string de Neon.
4. **Deploy Blueprint**. En unos minutos te da una dirección como `https://poker-entre-amigos.onrender.com`.

**3. Jugar**: abrí esa dirección en Safari (o cualquier navegador), creá tu cuenta, creá una mesa y compartí el enlace de invitación.

Cómo funciona el respaldo: al arrancar, el servidor descarga la última copia desde Neon; mientras corre, sube una copia cada 15 segundos si hubo cambios, y otra al apagarse. Si el servidor se cayera de golpe se podrían perder como máximo los últimos segundos.

Limitaciones del plan gratis de Render:
- Si nadie usa la web durante 15 minutos, el servidor se "duerme". La primera visita después tarda **alrededor de 1 minuto** en cargar; después anda normal. Mientras haya alguien en una mesa, la página lo mantiene despierto.
- Al dormirse se cortan las manos en curso (las cuentas, mesas e historial se conservan).
- Render da 750 horas gratis por mes, suficiente para un servicio encendido todo el mes.

### Otras opciones

Cualquier hosting con Node.js 22, **disco persistente** y WebSockets sirve (Railway, Fly.io, un VPS). Hay un `Dockerfile`:

```bash
docker build -t poker .
```

```bash
docker run -p 3000:3000 -v poker-data:/data -e COOKIE_SECURE=1 -e TRUST_PROXY=1 poker
```

Usá una sola instancia (el estado de las manos en curso vive en la memoria del proceso; lo persistente está en SQLite) y poné HTTPS delante.

## Pruebas

```bash
npm test
```

- `test/engine.test.js` — evaluador (todas las categorías, As bajo en A-2-3-4-5, kickers, sin desempate por palo), orden de acción en mano a mano y con 3+ jugadores, subida mínima, all-in corto que **no** reabre la acción y all-in que sí, botes secundarios con varios all-ins de distinto importe, empate con ficha sobrante, devolución de apuesta no igualada, final inmediato si todos se retiran, ciega grande corta, vencimiento de turno y **3000 manos aleatorias** verificando la conservación del total de fichas y que no haya cartas repetidas.
- `test/integration.test.js` — servidor real con **dos sesiones independientes** (cookies y sockets distintos): registro solo con usuario y contraseña, código `PKR-XXXXXX`, login, recuperación con código (un solo uso), creación y validación de mesa, ingreso por invitación, privacidad de cartas, acciones fuera de turno/duplicadas, **recarga pedida durante la mano y aplicada al terminarla** (sin duplicados), **reconexión** al mismo asiento con las mismas cartas, turno vencido automático, liberación del asiento tras el período de gracia, historial (balances que suman cero, acceso solo para participantes) y reinicio del servidor conservando asientos y fichas.

Además se probó en Chromium (Playwright) una partida completa entre una sesión de escritorio y otra de celular (iPhone 13): invitación sin sesión → registro → regreso a la mesa, mano jugada hasta el showdown, recarga, recarga de página (reconexión) e historial, sin errores en consola.

## Reglas y decisiones de diseño

- **Botón móvil**: el botón avanza al siguiente jugador con fichas; small blind y big blind son los dos siguientes. En mano a mano el botón pone la small blind y habla primero antes del flop y último después. (No se implementa la regla de "botón muerto" de torneos.)
- Si la big blind está all-in por menos, el resto debe igualar la ciega completa.
- La subida mínima es la última subida completa (o la big blind). Un all-in que no completa una subida no reabre la acción a quien ya actuó; varios all-ins cortos que suman una subida completa sí la reabren.
- Las fichas sobrantes de un reparto van, de a una, al ganador más cercano a la izquierda del botón.
- **Sesión de mesa**: empieza cuando se sienta el primer jugador y termina cuando la mesa queda vacía o el creador la cierra. Dentro de una sesión se registran las manos con número y hora.
- **Balance** = fichas retiradas + fichas restantes − total cargado. "Retiradas" son las fichas con que alguien se levantó; "restantes" son las que siguen en la mesa (o quedaban al cerrarla).
- Entrada permitida: entre `min(entrada inicial, 10 big blinds)` y el importe máximo. Las recargas no pueden superar ese máximo y solo se aplican entre manos.
- Quien entra con una mano en curso juega desde la siguiente. Una cuenta solo puede ocupar un asiento por mesa.
- Si nadie actúa a tiempo, el servidor pasa (si es legal) o retira la mano. Un jugador desconectado conserva el asiento durante el período de gracia; después se lo levanta con sus fichas registradas como retiradas.
- El creador inicia la partida; si el creador no está sentado, cualquier jugador sentado puede iniciarla (para que la mesa no quede bloqueada). Su desconexión no detiene el juego.
- Si el servidor se reinicia a mitad de una mano, esa mano se anula y cada jugador recupera las fichas que tenía al empezarla (queda marcada como "anulada" en el historial).

## Celulares: vertical y horizontal

La mesa se adapta al espacio disponible. En celular **vertical** el panel de acciones queda abajo; en **horizontal** la mesa ocupa la izquierda y las acciones una columna a la derecha. Durante tu turno, "Recargar" y "Abandonar" pasan al menú ⋯ para que los botones de juego entren sin desplazar la pantalla. Al girar el teléfono la mesa se redibuja sola.

## Mostrar cartas y chat

- **Mostrar mis cartas**: al terminar una mano, cualquier jugador que participó y cuyas cartas no se vieron (por ejemplo, el ganador cuando todos se retiraron, o quien se retiró) puede tocar "👁 Mostrar mis cartas" durante la pausa entre manos. Todos las ven en la mesa y queda registrado en el historial de la mano.
- **Chat de la mesa** (botón 💬): mensajes libres de hasta 200 caracteres y frases rápidas ("¿Vas de farol, verdad?", "Te recomiendo irte", "Te recomiendo pagar", "Cagón", "¡Escalera!"). Cada mensaje aparece como globito sobre el asiento de quien lo envía. Hay límite anti-spam (6 mensajes cada 10 s). El chat guarda en memoria los últimos 60 mensajes de la mesa (se pierden si el servidor se reinicia).

## Pendiente / limitaciones conocidas

- En el showdown se muestran todas las manos que llegan al final (no hay opción de descartar sin mostrar).
- El chat no se guarda en la base de datos ni tiene moderación o silenciado de jugadores.
- No hay "sentarse afuera" (sit out) voluntario.
- Una sola instancia del servidor (no hay escalado horizontal).
