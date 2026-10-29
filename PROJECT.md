# Studyist Project
Este proyecto tiene el objetivo de storear, analizar y generar contenido de estudio para mi trayecto universitario.

## Calendar
Esta aplicación (sincronizada con mi calendario), podrá crear eventos del tipo examenes y tareas, y relacionarlos con documentos guardados, flashcards, apuntes de reMarkable.

Es unidireccional, esto solo crear eventos en el calendario y ya.
Si se borra un evento de calendario, usamos el UID/ETag proveído por CalDAV

La duración de un examen se elige en minutos (**120 por defecto**) y marca el DTEND del VEVENT. Las tareas ocupan el resto del día.

No contemplamos el evento de modificar fecha porque las fechas están fijadas de mucho antes.
Si CalDAV falla, loggearlo, pero no parar la función ahí ni devolver un error al usuario, solo avisarle.

Nota de implementación (caldav 3.x): el UID y la URL del VEVENT se leen de `icalendar_component`; `vobject_instance` ya no existe porque vobject dejó de ser dependencia. Al borrar se usa la URL guardada en `evento.calendar_url`, porque el buscador por UID de caldav contra iCloud devuelve 412 Precondition Failed.

## Logging
- backend_server.log (aquí se guardan los accesos solo)
- web_server.log (aquí se guardan los accesos solo)
- backend_server.error.log
- web_server.error.log
- script.error.log
- server.log (aquí se guarda cuando se inicia/apaga el servidor con la fecha, la hora y el commit y rama asociado)
- auth.log (aquí se guardan los intentos de login: resultado, IP y User-Agent. Nunca la contraseña ni los tokens)

## Files
Se guardarán files (localmente), que podrán ser referenciados por eventos y flashcards.

Para los PDF's e imagenes, se generarán imagenes de thumbnail muy low res (100x60px), guardados en /files/thumb.

Tope de subida: 30 MB por archivo (`MAX_UPLOAD_BYTES` en `server/scripts/files.py`). Por encima se devuelve 413 antes de escribir nada. Solo se admiten imágenes raster y PDF (se valida el contenido, no solo la extensión); cualquier otro tipo, incluido SVG o HTML, devuelve 415.

Al borrar un archivo, sus referencias en `Flashcard.Front img` y `Flashcard.Back img` pasan a NULL (ON DELETE SET NULL): la tarjeta se conserva, solo pierde la imagen. Esto es intencionado, no se borran flashcards.
El mount `/files` responde con `X-Content-Type-Options: nosniff` y, salvo en PDF, `Content-Security-Policy: default-src 'none'; sandbox`, para que un HTML o SVG antiguo no ejecute nada en el origen de la API.
### FTS5
Búsqueda de texto completo sobre archivos:
- Tabla virtual `file_fts` (FTS5) con las columnas `name` y `content`.
- `content` se rellena al subir: texto extraído con `pypdfium2` para PDFs, vacío para imágenes (esas solo se buscan por nombre). Los `text/*` que ya estuvieran guardados siguen indexados.
- Triggers de INSERT/UPDATE/DELETE sobre `file` mantienen el índice sincronizado.
- `GET /files?q=` busca en `file_fts` y se puede combinar con `type` y `tema_id`.
- Si la extracción de texto de un PDF falla, se loggea en `script.error.log`, se indexa solo el nombre y la subida sigue adelante.
Aquí se verá como mandarlos a Openrouter al igual que como hacer para buscarlos en la web

## Auth
App de **un solo usuario**: no hay tabla de usuarios, ni registro, ni roles. Solo una contraseña local y tokens JWT. Todo vive en `/server/auth`.

**Contraseña**
- Se guarda hasheada en `server/auth/password.hash` (ignorado por git, permisos 600). Formato: `pbkdf2_sha256$<iteraciones>$<salt_hex>$<hash_hex>` (PBKDF2-HMAC-SHA256, 600.000 iteraciones, salt de 16 bytes).
- Se genera con `./sh/hash_password.sh`, que pide la contraseña dos veces por teclado (nunca por argumento, para no dejarla en el historial) y escribe el fichero.
- La verificación es con `hmac.compare_digest`. Sin fichero también se responde `401 "Contraseña incorrecta."` (no se revela si falta la configuración); el intento queda como `sin-password-configurada` en `log/auth.log`.

**Tokens**
- JWT HS256 firmados con `JWT_SECRET` (en `.env`; sin él, login → 500). `iss=studyist`, `sub=owner`, `jti` aleatorio y claim `dev` con un hash corto del User-Agent.
- **Access: 2 días.** **Refresh: 4 días.** `POST /auth/refresh` devuelve un par nuevo (rotación). Son stateless: el refresh viejo no se revoca y el logout no toca el servidor, solo borra los tokens en el cliente.
- `POST /auth/login` → `TokenPair` (`access_token`, `refresh_token`, `token_type`, `expires_in`, `refresh_expires_in`). `GET /auth/me` → `subject`, `expires_at`. `POST /auth/logout` → 204.

**Protección de rutas**
- `AuthMiddleware` (ASGI, por dentro de CORS y del capturador de 500) exige `Authorization: Bearer <access>` en **todas** las rutas, incluido el mount `/files`, para que los archivos no queden públicos.
- Rutas públicas: `/auth/login`, `/auth/refresh` y cualquier `OPTIONS` (preflight CORS). La documentación (`/docs`, `/redoc`, `/openapi.json`) está desactivada.
- **Límite de intentos:** 10 fallos por IP en 15 minutos en login y refresh; a partir de ahí se responde `429` con `Retry-After`. Un login correcto reinicia el contador.
- Un refresh token usado como access → 401. Token firmado con otro secreto o caducado → 401 con `WWW-Authenticate: Bearer`.
- **Ficheros estáticos:** un `<img>` o un `<a download>` no pueden mandar la cabecera `Authorization`, así que para `GET`/`HEAD` bajo `/files/` el middleware acepta también `?token=<access>`. Un refresh en la query, o un `POST` con `?token=`, siguen dando 401. En el frontend lo añade `withAccessToken()` (`lib/api.ts`), que usan `fileUrl()`/`thumbnailUrl()` de `pages/files/fileUtils.ts` y la página de flashcard. El middleware elimina el `token` de la query antes de que lo registre el access log.

**Dispositivos**
- `server/auth/device.json` (ignorado por git) decide desde qué dispositivos se puede entrar. Se compara contra el `User-Agent` por subcadena, sin distinguir mayúsculas.
- `"devices": ["*"]` = todos (valor por defecto). O una lista, ej. `["Macintosh", "iPhone"]`.
- Se comprueba en login, en refresh y en cada petición autenticada. El fichero se relee en cada petición (no hace falta reiniciar el servidor).
- **El bloqueo por dispositivo es invisible**: login y refresh responden exactamente igual que una contraseña mala o un token inválido (`401 "Contraseña incorrecta."` en login; `401 "Sesión no válida o caducada."` en refresh y en rutas privadas). La contraseña se verifica siempre antes de mirar el dispositivo, para no filtrarlo por el tiempo de respuesta. `/auth/me` no dice nada del dispositivo.
- Si el fichero falta, está corrupto o la lista está vacía, se loggea un warning y se permite todo: el filtro por dispositivo es una defensa blanda y no puede dejar fuera al único usuario.
- **Logging:** cada intento de login se apunta en `log/auth.log` con `outcome` (`ok`, `contrasena-incorrecta`, `dispositivo-bloqueado`, `sin-password-configurada`), IP y User-Agent (recortado a 200 caracteres). Ahí sí se distingue el bloqueo por dispositivo, pero eso solo lo ve el servidor: al cliente le llega siempre el mismo 401. Nunca se escribe la contraseña ni el token. Si el log no se puede abrir, el login sigue.
- Para saber el User-Agent de un dispositivo: <https://www.whatismybrowser.com/detect/what-is-my-user-agent/>. Sirve cualquier otro checker; hay que copiar un trozo estable (plataforma + navegador), no la versión.
- `server/auth/device.json.example` explica el formato y trae `"*"`. El `device.json` real del dueño está puesto para el iPhone 15 (`iPhone`).

**Frontend**
- Login en `/login`, fuera de `AppShell` (sin raíl). `AuthProvider` guarda el par de tokens en `localStorage` (claves `studyist.access` / `studyist.refresh`), renueva el access 5 minutos antes de que caduque y arranca la sesión con un refresh silencioso.
- `initApi()` registra un interceptor que añade el `Authorization` a todas las llamadas del SDK. Ante un 401 (salvo en `/auth/*`) hace un único refresh compartido y reintenta la petición; si el refresh falla, borra los tokens y manda a `/login`.
- `chatStream.ts` manda el mismo `Authorization` en el SSE a mano.
- El botón de cerrar sesión está en el raíl de escritorio y en la barra inferior móvil.

## Web
Frontend con React TS + Tailwind CSS
El estilo va a ser parecido al de Claude / ChatGPT (no en tema usabilidad, sino estrictamente de diseño).
Descartar obviamente cosas de branding (ej: Color naranja de Claude)
Puerto 5173.

Dirección visual elegida: variante **F "Onyx"** (`web/src/pages/home/HomeF.tsx`), el lenguaje oscuro de ChatGPT, aplicado a toda la app: canvas `#212121`, raíl de iconos `#171717`, superficies `#303030`, bordes `#3f3f3f`, texto `#ececec`, un solo punto de máximo contraste en blanco. Sin color de marca.

El editor de `Tema.Notas` es Markdown con botón de preview (texto plano + `react-markdown` + `remark-gfm`).

Asegurarse siempre que es Mobile Ready. NO crear una WebApp. Quitar que si hago click en un input, hace zoom en el móvil, odio eso. Regla: inputs y textareas a 16px mínimo (el zoom automático de iOS no se dispara) y nunca desactivar el zoom de pellizco.

Los temas se muestran como árbol plegable con sangría (un tema puede tener subtemas, sin límite de profundidad). El tema padre se elige al crear uno nuevo y se puede cambiar desde el detalle del tema.

Rutas del frontend: `/login` (contraseña, fuera del raíl), `/` (Principal), `/archivos`, `/archivos/:id`, `/asignaturas`, `/asignaturas/:id`, `/temas/:id`, `/ejercicios/:id` (resolver o leer un ejercicio guardado), `/eventos`, `/flashcards` (All Flashcard Sets + test global), `/flashcards/:setId` (entrenar el set), `/flashcards/:setId/cards/:cardId` (gestionar una flashcard).

El chat responde en **streaming**: `POST /chat/messages/stream` (SSE) y el texto se pinta según llega, sin esperar a la respuesta completa. El cliente vive en `web/src/lib/chatStream.ts`; `ChatPanel` recibe `streaming` para ocultar los puntos de "escribiendo" en cuanto entra el primer trozo.

!TODO, para que no tenga un feel barato, añadir animación a la generación de texto del chat.
Aparte añadir soporte para markdown en las burbujas del chat, que le gusta usarlo a los modelos, y añadirles al prompt que efectivamente pueden usarlo.


Páginas:
- Principal: se te greatea con una vista de chat, que usará el modelo general para eso. 
- Archivos: Gestión de archivos, se podrá buscar archivos por nombre, filtrar por tipo, y gestionarlos desde ahí. (Crear un componente Archivo reutilizable). También se podrán crear archivos (aquí se debe de poder arrastrar, darle click para abrir, y recibirlos de copia y pega).
- Archivo: Aquí se muestra otra vista de chat (componente reutilizado de Principal), pero para hablar sobre un archivo en especifico.
- Asignaturas: Muestra todas las asignaturas, diciendo su nombre, de que semestre són y cuantos temas tienen. Si se hace click a una asignatura se lleva a la pagina "Asignatura"
- Asignatura: Muestra todos los temas de una asignatura !TODO (aquí es lo del timeline)
- Tema: Te permite modificar todos los archivos que tienen que ver con un tema. Incluye una sección de ejercicios: se generan (tipo texto o programación) a partir de los archivos de tipo Ejercicio y Examen del tema, con un comentario libre para la IA, y quedan guardados y listados en el tema. Cada ejercicio se abre en `/ejercicios/:id`.
- Eventos: Vista de calendario típica con todos los eventos. Se puede hacer click a la asignatura y te lleva a ella, modificar, darle click y te lleva al evento del calendario en iCloud.
- Flashcard Sets: Aquí es donde se podrá entrenar, le das a play y te muestra los flashcards, un click y te muestra la parte de atrás donde podrás determinar si la pregunta era fácil, media o dificil para luego determinar cuando mostrartelas otra vez. Habrá un botón para pasar por todas las flashcards de ese set, o solo las que toque revisar. Dentro del repaso se puede editar (front/back) o borrar la tarjeta actual y pasar a la siguiente sin salir de la sesión.
- All Flashcard Sets:
Esta es global, contiene todos los flashcard set para que puedas gestionarlos, borrarlos, etc. Al igual que una parte donde podrás pedirle que te haga un test global, donde te muestra todos los flashcards de los sets que tocan hoy.
- Flashcard: Página para gestionar un flashcard en especifico (delante y detrás), al igual que añadirle fotos (aquí se debe de poder arrastrar, darle click para abrir, y recibirlos de copia y pega).
!TODO (si eres agente ignora esto): Poder hacer que la IA que genera flash cards pueda extraer imagenes de los PDF's que sean útiles.


## Server
Fast API con CORS habilitado.
Puerto 8080 y 8443 (!TODO).
Cuerpo máximo por petición: 32 MB (`BodySizeLimitMiddleware` en `server/main.py`, 413 por encima). Swagger, ReDoc y `openapi.json` están desactivados.

## Dotenv
El dotenv contiene esto:

ICLOUD_MAIL=
ICLOUD_APP_PASSWORD=

OPENROUTER_API_KEY=

JWT_SECRET=

## Views
Vas a generar un spec de OpenAPI automaticamente con la herramienta que te provee FastAPI en JSON.
Cada categoría de view aquí se lleva su propia carpeta, y su propio endpoint path (/).

*(Cuando pongo todo, significa que ese endpoint puede tocar todas las columnas, menos PK obviamente)*
- Auth
    - `POST /auth/login`: body `{password}`. Verifica la contraseña y, si no vale o el dispositivo no está permitido, devuelve el mismo 401 "Contraseña incorrecta." (el bloqueo por dispositivo no se distingue). Devuelve `access_token`, `refresh_token`, `token_type`, `expires_in` (172800) y `refresh_expires_in` (345600).
    - `POST /auth/refresh`: body `{refresh_token}`. Rota el par; un access token aquí da 401. Un refresh válido de un dispositivo no permitido da el mismo 401 "Sesión no válida o caducada.".
    - `GET /auth/me`: `subject` y `expires_at` del access token actual. No revela nada del dispositivo.
    - `POST /auth/logout`: 204. No revoca nada en servidor (JWT stateless); el cliente borra los tokens.
    - El resto de endpoints, y el mount `/files`, exigen `Authorization: Bearer <access>` (ver [Auth](#auth)).
- Evento
    - Crear (todo)
    - Modificar (todo menos fecha)
    - Borrar
    - Get (todo)
    - `GET /evento?from=&to=&asignatura_id=`: rango para la vista de calendario.
    - `calendar_url` en la respuesta: URL del VEVENT en iCloud, NULL si CalDAV falló o no está configurado.
    - `tema_id` opcional (NULL = sin tema) y `duration_minutes` (5–1440, 120 por defecto) al crear y modificar. El tema tiene que ser de la asignatura del evento: 404 si no existe, 400 si es de otra. `tema_name` viene resuelto en la respuesta.
    - El tema no cascadea: si se borra, el evento se queda con `tema_id` NULL (ON DELETE SET NULL).

- Asignatura
    - Crear (todo)
    - Modificar (todo)
    - Borrar
    - Get (todo)
    - `GET /asignatura` incluye `tema_count` en la respuesta.

- Tema
    - Crear (todo)
    - Modificar (todo)
    - Borrar *(borra también sus subtemas en cascada)*
    - Get (todo)
    - `GET /tema?asignatura_id=`: temas de una asignatura (lista plana, orden natural por nombre, con `parent_id` y `child_ids`; el árbol se monta en el cliente).
    - Jerarquía: `parent_id` opcional en crear y modificar. 404 si el padre no existe, 400 si es de otra asignatura, si es el propio tema o si es un descendiente (ciclo). `parent_id: null` devuelve el tema al primer nivel.
- Files
    - Crear: Valida que el archivo sea una imagen raster o un PDF (415 si no), lo clasifica con su MIME Type y lo guarda en el Path que toque, llama a la función de crear thumb, y finalmente con toda esa información crea la fila de la BBDD. Acepta `kind` (`teoria` / `examen` / `ejercicio` / `otros`, por defecto `otros`), el tipo de documento que elige el usuario.
    - Modificar (nombre y tipo de documento)
    - Borrar (borra (con try) el archivo, y también la linea de la DB, y todas sus referencias).
    - Get (todo) con path relativo
    - `GET /files?kind=`: filtra por tipo de documento.
- Flashcard Set
    - Crear (todo)
    - Modificar (todo)
    - Borrar
    - Get (todo)
    - Añadir Flashcard
    - Create flashcard set from document(s): Usa Openrouter para pasarle los archivos puestos en la petición, para que cree un flashcard set, usando el prompt de flashcards.txt. En la petición se mencionara explicitamente cuantas flashcards quiere que se genere el usuario, o también se podrá decir "pocas"/"medio"/"muchas", para que el agente interprete como quiera.
    Si se define de manera explicita y el modelo hace de más, las dejamos dentro aún así, no truncamos.
    - `GET /files?q=&type=&tema_id=&limit=`: búsqueda FTS5 + filtros.
    - `POST /flashcard_set/from-files`: genera el set a partir de documentos (antes vivía en `/study`). Acepta `amount: int | "pocas" | "medio" | "muchas"`. Respuesta con `created`, `discarded` y `duplicates`.
    - Completar un set existente: se usa `POST /study/flashcards` con `flashcard_set_id`. El modelo recibe las tarjetas que ya tiene el set (front y back) y se le pide no repetirlas; además se descartan las que repiten el front de una existente (normalizado sin acentos ni puntuación) y las repetidas dentro del propio lote, contadas en `duplicates`.
    - `GET /flashcard_set/{id}/review?all=false`: tarjetas que tocan hoy (o todas con `all=true`), con `limit` opcional.

- Flashcard
    - Crear (todo)
    - Modificar (todo)
    - Borrar
    - Get (todo)
    - Seen: Actualiza last seen a ahora, indicando la dificultad que ha reportado el usuario
    - `GET /flashcard?flashcard_set_id=`.
    - `GET /flashcard/review?limit=20&set_ids=`: test global con las tarjetas que tocan hoy en todos los sets.
- Openrouter
    - Send(message:str, model_type:str, system_prompt:str, files:list=None, model_override=None): Envía mensaje, pudiendo elegir el tipo de modelo:enum[str] = ["pdf", "general"] (luego se añadirán más modelos), o sobreescribir totalmente el nombre de modelo como tal (model_override). Elige también el system prompt, que hace referencia al nombre del archivo de prompt pero sin el .txt al final, entonces tiene que referenciar a un archivo real. Files referencia a una lista de paths de files que mandar opcionalmente al modelo.
- Study
    - Generate flashcards: Necesita que el usuario le apunte a un flashcard set y a uno o más files. Usa Send del view de Openrouter. Puedes elegir núm de flashcards. Tiene JSON parsing por si la IA se lía (poco probable). En español. Sirve también para completar un set existente: mete las tarjetas que ya tiene en el mensaje y devuelve `duplicates`.
    - Generate exercise: `POST /study/exercise` con `tema_id`, `kind` (`texto` por defecto o `programacion`), `instructions` opcional y `file_mode`. Usa el modelo `openai/gpt-6-luna` (`model_type` `exercise` en openrouter). Usa solo los archivos del tema de tipo `ejercicio` o `examen` (400 si no hay ninguno) y el prompt `exercises` (texto) o `exercises_code` (programación). Guarda el ejercicio en la BBDD ligado al tema y devuelve `exercise` (con sus test cases), `model` y los nombres de los `files` usados.
- Ejercicio
    - `GET /ejercicio?tema_id=`: lista de ejercicios guardados (resumen, del más reciente al más antiguo).
    - `GET /ejercicio/{id}`: ejercicio completo con sus test cases.
    - `DELETE /ejercicio/{id}`: borra el ejercicio y sus test cases en cascada.
    - `POST /ejercicio/{id}/run`: **desactivado** (`EXERCISE_RUN_ENABLED = False` en `views/ejercicio/router.py`); responde 403. Cuando se reactive: body `{code}`, solo ejercicios de programación (400 en los de texto). Ejecuta `solve(*args)` contra los test cases en un subproceso `python -I` con timeout de 5 s y devuelve `ok`, el detalle por caso (`position`, `passed`, `expected`, `actual`, `error`) y un `error` global si el código no llega a correr. El código del usuario se ejecuta en local: no es una sandbox de red ni de ficheros.
- Chat
    - Historial: `GET /chat/threads` lista las conversaciones globales de la Principal (más reciente primero) con `title` y `message_count`. Cada envío sin `thread_id` ni `file_id` crea un hilo global nuevo: entrar en la Principal abre siempre una conversación vacía y las anteriores se recuperan desde este historial.
    - Título: lo genera la IA con el prompt `title` (`prompts/title.txt`) **solo con el primer mensaje** del hilo. Se guarda en `chat_thread.title`; si el modelo falla se usa el primer mensaje recortado. El resto de mensajes no vuelve a generarlo.
    - Get thread: `GET /chat/thread` devuelve el hilo global más reciente. Con `?thread_id=` ese hilo concreto y con `?file_id=` el hilo de ese archivo (página Archivo). Si falta el global, se crea vacío.
    - Get messages: `GET /chat/messages` lista los mensajes del hilo (`?thread_id=`, `?file_id=` o el global más reciente), ordenados por fecha.
    - Send message: `POST /chat/messages` guarda el mensaje del usuario, llama a OpenRouter con el prompt `general` y el contexto de los **últimos 20 mensajes** de ese hilo, guarda la respuesta y devuelve los dos mensajes (y el título si se acaba de generar). El hilo se elige con `thread_id` o, en Archivo, con `file_id`; sin ninguno se crea uno nuevo. Con `file_id` el archivo se manda como adjunto al modelo. `retry: true` responde al último mensaje de usuario sin volver a guardarlo (solo si la respuesta anterior falló).
    - Send message (streaming): `POST /chat/messages/stream` hace lo mismo que el anterior pero responde `text/event-stream` con eventos `meta` (modelo, `thread_id` e ids), `delta` (trozos de texto), `done` (los dos mensajes ya guardados, `thread_id` y `title`) y `error`. El mensaje del asistente se guarda al cerrar el stream, en una sesión propia; si el cliente corta o el modelo falla, el mensaje del usuario se conserva.
    - Delete thread: `DELETE /chat/threads/{thread_id}` borra la conversación completa (sus mensajes caen en cascada).
    - Clear: `DELETE /chat/messages` borra el historial del hilo (`?thread_id=`, `?file_id=` o el global más reciente), sin borrar el hilo ni el archivo.


## Flashcard System
Repaso espaciado por intervalos fijos (sin ease factor):
- `hard`: vuelve a los **1 día**.
- `medium`: vuelve a los **2 días**.
- `easy`: vuelve a los **3 días**.
- Nunca vista (`last_seen` NULL): toca hoy.
- Al pulsar `seen` se actualiza `last_seen` a ahora y se guarda la dificultad reportada.
- El tope de tarjetas por sesión lo elige el usuario; por defecto **20**.
- La lógica vive en `server/scripts/spaced_repetition.py`.

## Base de datos
SQLite simple con SQLAlchemy de ORM.

### Tablas

*Integer PK*

**Evento:**
- **Tipo**:str *(Examen/Tarea)*
- **Asignatura**:ForeignKey[Asignatura]
- **Tema**:ForeignKey[Tema] *(opcional, NULL = sin tema. Sin cascada: al borrar el tema el evento sigue con tema_id NULL)*
- **Nombre**:str
- **Fecha**:DateTime *(Normalizada a horario español de Madrid)*
- **Duración**:num *(minutos; 5–1440, 120 por defecto. En los exámenes marca el DTEND del VEVENT)*
- **UID**:str *(UID proveído por CalDAV)*
- **Calendar URL**:str *(URL del VEVENT en iCloud, puede ser NULL si CalDAV falló o no está configurado. Se usa para el click "abrir en iCloud" de la página Eventos)*

**Chat**
Enlace a conversaciones externas que el usuario tiene en otros sitios (Gemini / Claude / Notebook LLM). No es el chat interno.
- **Evento**:ForeignKey[Evento]
- **Nombre**:str
- **URL**:str *(Permite reconocer de dónde viene: Gemini / Claude / Notebook LLM)*

**Chat Thread**
Hilo de conversación interno con la IA. Uno global (página Principal, `File` NULL) y uno por archivo (página Archivo).
- **File**:ForeignKey[Files] *(puede ser NULL; UNIQUE parcial: un hilo por archivo; varios NULL permitidos para el global)*
- **Created at**:DateTime
- **Updated at**:DateTime

**Chat Message**
- **Thread**:ForeignKey[Chat Thread] *(ON DELETE CASCADE)*
- **Role**:enum[str] = ["user", "assistant"]
- **Content**:textfield
- **Model**:str *(modelo que generó el mensaje, NULL en los del usuario)*
- **Created at**:DateTime *(Madrid)*

**Asignatura**
- **Nombre**:str (UNIQUE)
- **Año**:num
- **Semestre**:enum[num] = [1,2]
- **Color**:str *(Código HEX, sin el #)*

**Tema** // Para que vayan en orden, se ordenará por nombre
- **Asignatura**:ForeignKey[Asignatura]
- **Nombre**:str
- **Files**:ManyToMany *(Apunta a la tabla Files)*
- **Notas**:textfield
- **Flashcards Sets**:ManyToMany *(Apunta a la tabla Flashcard Set)*
- **Tema Parent**:ForeignKey[Tema] *(NULL = tema de primer nivel. El padre tiene que ser de la misma asignatura y no se admiten ciclos: ni el propio tema ni uno de sus descendientes. Al borrar un tema caen sus subtemas en cascada: `parent_id INTEGER REFERENCES tema(id) ON DELETE CASCADE` con índice `idx_tema_parent`)*

**Files**
- **Nombre**:str
- **Tipo**:str *(pdf/txt/etc.)*
- **Tipo documento**:str *(enum: teoria/examen/ejercicio/otros. Es la clasificación elegida por el usuario al subir; se puede cambiar después. Por defecto otros)*
- **Path**:str (incluye /images o /pdfs o /texts o /others en su ruta)
- **Size**:num
- **Thumbnail**:str *(Path a /thumb, puede ser NULL)*
- **Hash**:str *(sha256 del contenido, UNIQUE. Evita guardar dos veces el mismo archivo: si se resube, la API devuelve 409 con el id del que ya existe)*

**Ejercicio**
- **Tema**:ForeignKey[Tema] *(ON DELETE CASCADE: al borrar el tema caen sus ejercicios)*
- **Kind**:enum[str] = ["programacion", "texto"] *(texto: enunciado, respuesta y explicación en texto; programacion: solución en Python + test cases)*
- **Statement**:text *(Enunciado)*
- **Solution**:text *(Respuesta; código Python si es de programación)*
- **Explanation**:text *(Explicación de la solución)*
- **Created at**:DateTime *(Madrid)*

**Ejercicio Test Case**
- **Ejercicio**:ForeignKey[Ejercicio] *(ON DELETE CASCADE)*
- **Position**:num *(Orden 1..n)*
- **Input**:text *(Array JSON con los argumentos posicionales de solve())*
- **Expected**:text *(Valor esperado en JSON)*

**Flashcard Set**
- **Nombre**:str

**Flashcard**
- **Flashcard Set**:ForeignKey *(Así una flashcard solo puede estar en un set)*
- **Last time seen**:Date *(Cuando fue la última vez que el usuario interactuó con esta flashcard)*
- **Difficulty**:enum[str] = ["hard", "medium", "easy"] *(El usuario da feedback sobre como encontró esta tarjeta, para saber cuando volver a mostrarsela)*
- **Front**:str *(Pregunta al usuario)*
- **Back**:str *(Respuesta)*
- **Front img**:ForeignKey *(apunta a un file, puede ser NULL)*
- **Back img**:ForeignKey *(apunta a un file, puede ser NULL)*

## Arquitectura de proyecto
Si eres agente: nunca crearás un archivo no mencionado en esta arquitectura (excepto que sea para el apartado web), si lo crees necesario, entonces sugierelo de la siguiente manera:
- Explicar exactamente todas las funciones que vas a poner
- Estimar cuantas lineas vas a usar en ese archivo
- Las dependencias que tiene con otros archivos/modulos/partes del proyecto
- Si te digo que sí, lo vas a poner en el PROJECT.md, usando el mismo estilo de representación usado ya, y solo tocando ESA línea.

**Archivos:**
- /db
    - db.sqlite3
    - init.py # Archivo que contiene todos los "CREATE TABLE IF NOT EXISTS", que será modificada cada vez que una tabla quiera ser añadida.
    - db.py SQLAlchemy
    /temp
        - Sitio para que el agente pueda crear un script de Python temporal para modificar una tabla o añadir datos.

- /web
    - Proyecto Vite + React TS
    - src/lib/chatStream.ts: cliente SSE del chat en streaming (parsea meta/delta/done/error).
    - src/components/CodeEditor.tsx: editor de código CodeMirror 6 (resaltado de Python, números de línea, autocompletado y Tab/Shift+Tab para indentar). Se usa en la página de ejercicios de programación.
    - src/components/TemaPicker.tsx: selector reutilizable de tema con búsqueda por nombre y filtro por asignatura.
    - src/auth/tokenStore.ts: tokens en localStorage (`studyist.access` / `studyist.refresh`), decodificado del JWT sin dependencias y aviso de cambios de sesión.
    - src/auth/authClient.ts: login, refresh, logout y `/auth/me` con `fetch` a pelo (sin SDK), con `AuthRequestError`.
    - src/auth/AuthContext.tsx: `AuthProvider` y `useAuth()`; arranque con refresh silencioso, renovación 5 min antes de caducar y logout.
    - src/auth/RequireAuth.tsx: guarda de rutas; sin sesión redirige a `/login`.
    - src/auth/LoginPage.tsx: formulario de contraseña única (Onyx, 16px, mobile ready).
    ...
- /prompts
    - Todos los prompts usados para los modelos se guardarán bajo forma de .txt, con el objetivo de que sea fácil modificarlos.
- /server
    - main.py: Entrypoint de FastAPI, crea la app y monta las views.
    - models.py: Modelos Pydantic (schemas de request/response) usados por las views.
    - /auth
        - config.py: Rutas de `password.hash` y `device.json`, lectura de `JWT_SECRET`, verificación PBKDF2 de la contraseña y allowlist de dispositivos por User-Agent (fail-open si falta el JSON).
        - tokens.py: Crear y validar los JWT de access (2 días) y refresh (4 días) con PyJWT; `AuthError` para los 401.
        - middleware.py: Middleware ASGI que exige `Bearer <access>` en todas las rutas menos las públicas y comprueba el dispositivo.
        - audit.py: Escribe cada intento de login en `log/auth.log` (resultado real, IP y User-Agent recortado). Nunca contraseña ni tokens; si el log falla, el login sigue.
        - router.py: `POST /auth/login` (con auditoría), `POST /auth/refresh`, `GET /auth/me`, `POST /auth/logout`.
        - device.json.example: Formato de la allowlist de dispositivos (`"*"` o lista de trozos de User-Agent) y URL para consultar el tuyo.
        - password.hash *(ignorado por git)*: Hash de la contraseña, generado con `sh/hash_password.sh`. No se versiona.
        - device.json *(ignorado por git)*: Allowlist real de dispositivos (iPhone 15). No se versiona.
    - /scripts
        - calendar.py: Crear eventos en un calendario iCloud
        - openrouter.py: Interfaz super simple para interactuar con los modelos de openrouter
        - files.py: Hacer retrieve de files, borrarlos y subirlos.
        - generate_thumb.py: Le pasas un Path a un archivo y te genera un thumbnail en /thumb/ y te devuelve su path.
        - spaced_repetition.py: Intervalos de repaso (hard 1d / medium 2d / easy 3d) y cálculo de si una tarjeta toca hoy.
        - python_runner.py: ejecuta el código Python del usuario contra los test cases de un ejercicio en un subproceso `python -I` con timeout y devuelve el resultado por caso.
    - /views
        ... Todas las views mencionadas en [Views](#views)
        - /chat/router.py: Hilos y mensajes del chat interno (global y por archivo).
        - /ejercicio/router.py: Ejercicios guardados (lista, detalle, borrado) y corrección del código de los de programación.
    - requirements.txt (sin mencionar versión exacta a no ser que sea obligatorio y poniendo los paquetes estrictamente necesarios)
- /tests
    - test_files.py, test_flashcards.py, test_chat.py: pruebas de las reglas que no son CRUD trivial (dedupe por hash, FTS, repaso espaciado, historial de chat). pytest con `TestClient` y una DB temporal.
    - test_tema_tree.py: jerarquía de temas (padre de otra asignatura, ciclos, volver a la raíz, borrado en cascada).
    - test_calendar.py: lectura del UID/URL del VEVENT con caldav 3.x (sin vobject) y borrado por URL. Incluye una prueba real de crear→borrar en iCloud, desactivada por defecto: se lanza con `STUDYIST_ICLOUD_TESTS=1`.
    - test_evento.py: tema opcional del evento (validación por asignatura, SET NULL al borrar el tema) y duración en minutos.
    - test_chat_stream.py: eventos SSE del chat en streaming y persistencia de los dos mensajes.
    - test_auth.py: middleware (401 sin token), login/refresh/TTLs, tipo de token, `/auth/me`, logout, allowlist de dispositivos y auditoría de logins en `auth.log`.
- /files
    - /images
    - /pdfs
    - /texts
    - /thumb
    - /others *(Fall-back para archivos distintos)*
- /sh
    - start.sh: inicializar tanto el server como el frontend
    - start_frontend.sh: inicializar solo el frontend
    - start_backend.sh: inicializar solo el backend
    - db_init.sh: Corre init.py
    - api_gen.sh: Regenera web/openapi.json desde FastAPI y el cliente TS con openapi-ts
    - hash_password.sh: Pide la contraseña dos veces y escribe su hash PBKDF2 en server/auth/password.hash (chmod 600)
- /log
    - backend_server.log
    - web_server.log
    - backend_server.error.log
    - web_server.error.log
    - script.error.log
    - server.log
    - auth.log

- .gitignore
- AGENTS.md
- PROJECT.md
- .env
- .env.example


### Cosas a debatir (si eres un agente ignora este punto)
Si voy a querer que la IA me cree mis apuntes, o si pasarlos primero por mí con reMarkable y pasarlos a limpio luego.
!TODO

### Implementaciones futuras (si eres un agente ignora este punto)
Poner moodle scraper al uso es buena idea.
!TODO