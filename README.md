# wakapoker

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
3. Render lee `render.yaml` (plan **Free**). Después, en *Environment*, agregá `DATABASE_URL` con la connection string de Neon (si no la agregás, la app funciona igual pero se borran cuentas e historial cada vez que Render reinicia el servidor).
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

## Entrar solo con un nombre

Al abrir la web (o un enlace de invitación) solo se pide un **nombre**: sin contraseña ni correo. La sesión queda guardada en el navegador. Para volver desde otro celular, o después de tocar "Cambiar nombre", se escribe el mismo nombre: se puede entrar con él siempre que ese nombre no esté conectado jugando en ese momento.

**El registro de cada partida se guarda siempre**: después de cada mano, de cada carga y al terminar la partida, el servidor manda a todos los de la mesa las cuentas (con cuánto entró cada uno, cada carga, con cuánto quedó y quién le paga a quién). Cada jugador guarda una copia en su propio dispositivo, así que el historial no se pierde aunque el servidor gratuito se reinicie y pierda sus datos. En "Historial de partidas" aparecen las del servidor y las guardadas en el dispositivo.

## Mesa, personajes y cuentas

- **Ciegas**: al crear la mesa se pregunta "¿Cómo se juega?": **Con SB y BB** (se piden los dos montos) o **Solo SB** (se pide la SB, normalmente Bs 1). Con "Solo SB" la pone siempre el jugador a la izquierda del dealer, no hay big blind, los demás deben igualar la SB y quien la puso tiene la opción al final de la ronda; la apuesta mínima es la SB.
- **Crupier y personajes**: un crupier reparte las cartas (se ven volar hacia cada jugador) y da vuelta el flop, el turn y el river. Cada jugador es un personaje (cara y manos): al apostar mete fichas en la mesa y al pasar golpea la mesa dos veces. Antes de entrar a una mesa (y desde el lobby, en "Mi personaje") se elige color de piel, pelo, sombrero, gafas, barba y camisa.
- **Tu juego en todo momento**: durante la mano cada jugador ve "Tenés: …" con su mejor combinación actual (por ejemplo, con A y 5 y en la mesa 2-3-4: "Escalera al Cinco"), y se resaltan las cartas que la forman. Antes del flop muestra si tiene pareja o su carta alta. Cada uno ve solo el suyo.
- **Más opciones de personaje**: granos en la cara (rojos o muy rojos), sin polera (con o sin granos en pecho y espalda), tres gafas de sol (clásicas, aviador, deportivas), sombreros oscuros (gorra, vaquero, fedora, gorro de lana y capucha negros), cadenas (cruz de oro, diamantes, oro gruesa, plata, dólar, doble) y relojes en la muñeca (AP, Rolex de oro, arcoíris, multicolor, diamantes).
- **Caras, bocas y accesorios**: tipo de cara (adulto, joven, niño, niña, señora, abuelo, abuela), ojeras, cabeza normal o cabezona, boca y dientes (sonrisa, carillas de diamantes, carillas de oro, dientes de castor, amarillos, negros, brackets con comida), audífonos (AirPods, con cable, de casco) y relojes dibujados con detalle (bisel octogonal con tornillos, oro con bisel estriado, bisel de gemas arcoíris, multicolor y de diamantes).
- **Bono 7 y 2** (opcional, se elige al crear la mesa): si alguien gana una mano teniendo 7 y 2, cada uno de los demás jugadores de esa mano le paga Bs 1 automáticamente (si le queda), se muestran sus cartas y aparece "X se lleva Bs N por ganar con 7 y 2". Vale tanto si gana en el showdown como si todos se retiran. El bono entra en las cuentas de la partida.
- **Empates**: cuando un bote se reparte, en el centro aparece "Empate entre André y Benja, André gana Bs 4 y Benja Bs 4".
- **Cuentas**: el botón 💰 de la mesa muestra para todos con cuánto entró cada uno, cada carga en orden ("Entró con 30 → +20 → +50 → +10"), cuántas veces cargó, con cuánto quedó y **quién le paga a quién**. Al cerrar la mesa, todos reciben las cuentas finales, que quedan en el historial de partidas. La app no maneja dinero: solo lleva la cuenta.

## Celulares: vertical y horizontal

La mesa se adapta al espacio disponible. En celular **vertical** el panel de acciones queda abajo; en **horizontal** la mesa ocupa la izquierda y las acciones una columna a la derecha. Durante tu turno, "Recargar" y "Abandonar" pasan al menú ⋯ para que los botones de juego entren sin desplazar la pantalla. Al girar el teléfono la mesa se redibuja sola.

## Mostrar cartas y chat

- **Mostrar mis cartas**: al terminar una mano, cualquier jugador que participó y cuyas cartas no se vieron (por ejemplo, el ganador cuando todos se retiraron, o quien se retiró) puede tocar "👁 Mostrar mis cartas" durante la pausa entre manos. Todos las ven en la mesa y queda registrado en el historial de la mano.
- **Chat de la mesa** (botón 💬): mensajes libres de hasta 200 caracteres y frases rápidas ("¿Vas de farol, verdad?", "Te recomiendo irte", "Te recomiendo pagar", "Cagón", "¡Escalera!", "¡Faroleada histórica!", "¡Color!", "¡Trica!", "¡Masivo!", "Checkea", "Foldea", "Si subís te pago", "Resubo", "No te voy a pagar", "¡Te chingué!"). Cada mensaje aparece como globito sobre el asiento de quien lo envía. Hay límite anti-spam (6 mensajes cada 10 s). El chat guarda en memoria los últimos 60 mensajes de la mesa (se pierden si el servidor se reinicia).

## Pendiente / limitaciones conocidas

- En el showdown se muestran todas las manos que llegan al final (no hay opción de descartar sin mostrar).
- El chat no se guarda en la base de datos ni tiene moderación o silenciado de jugadores.
- No hay "sentarse afuera" (sit out) voluntario.
- Una sola instancia del servidor (no hay escalado horizontal).
