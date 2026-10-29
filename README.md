# Studyist

Aplicación **local y de un solo usuario** para organizar el estudio de la universidad: asignaturas y temas, apuntes (PDF e imágenes), eventos y exámenes sincronizados con iCloud, flashcards con repaso espaciado, chat con IA y generación de ejercicios.

No hay registro ni varios usuarios. La app se abre en tu navegador, se protege con **una contraseña** y no está pensada para publicarse en internet.

---

## Requisitos

- **macOS, Linux o Windows con WSL** (los scripts son de bash).
- **Python 3.11 o superior**.
- **Node.js 20 o superior** y npm.
- **Git**.
- Opcional: una clave de [OpenRouter](https://openrouter.ai/) para el chat, las flashcards y los ejercicios.
- Opcional: una contraseña de aplicación de iCloud para crear eventos en tu calendario.

No hace falta Docker ni ningún servicio externo: todo vive en tu disco.

---

## Instalación desde cero

Todos los comandos se ejecutan desde la raíz del repositorio.

### 1. Clona el repositorio

```bash
git clone https://github.com/lucabae/studyist.git
cd studyist
```

### 2. Crea el entorno de Python e instala dependencias

```bash
python3 -m venv server/venv
server/venv/bin/pip install --upgrade pip
server/venv/bin/pip install -r server/requirements.txt
```

Los scripts del proyecto usan `server/venv` automáticamente si existe.

### 3. Instala el frontend

```bash
cd web
npm install
cd ..
```

### 4. Crea la base de datos

```bash
./sh/db_init.sh
```

Crea `db/db.sqlite3` con todas las tablas. Es idempotente: puedes volver a lanzarlo sin miedo.

### 5. Configura las variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y rellena:

| Variable | Obligatoria | Para qué |
|---|---|---|
| `JWT_SECRET` | **Sí** | Firma los tokens de sesión. Genérala con `openssl rand -hex 32`. Sin ella, el login falla. |
| `OPENROUTER_API_KEY` | No | Chat, generación de flashcards y ejercicios. Sin clave, esas funciones devuelven error. |
| `ICLOUD_MAIL` | No | Correo de iCloud para crear eventos con CalDAV. |
| `ICLOUD_APP_PASSWORD` | No | Contraseña de aplicación de iCloud (no la de tu cuenta). |
| `ICLOUD_CALENDAR_NAME` | No | Nombre exacto del calendario donde se crean los eventos. Por defecto `Educación`. |

Si no configuras iCloud, los eventos se guardan igualmente en la base de datos local; simplemente no se crean en el calendario remoto.

### 6. Crea tu contraseña de acceso

```bash
./sh/hash_password.sh
```

Pide la contraseña dos veces y escribe `server/auth/password.hash` con permisos `600`. No se guarda la contraseña, solo su hash PBKDF2. Para cambiarla, vuelve a ejecutar el script (no hace falta la anterior).

### 7. Configura los dispositivos permitidos (opcional)

```bash
cp server/auth/device.json.example server/auth/device.json
```

Por defecto `"devices": ["*"]` deja entrar a cualquier navegador. Si quieres restringirlo, cambia la lista por fragmentos del `User-Agent` de tus dispositivos, por ejemplo:

```json
{ "devices": ["Macintosh", "iPhone"] }
```

El fichero se relee en cada petición: no hay que reiniciar. Es una defensa blanda (el `User-Agent` se puede falsificar), no un control de seguridad fuerte.

### 8. Arranca la aplicación

```bash
./sh/start.sh
```

Abre **<http://localhost:5173>**, introduce la contraseña del paso 6 y listo.

- Backend: `http://127.0.0.1:8080`
- Frontend: `http://localhost:5173`
- `Ctrl+C` para todo.

También puedes arrancar cada parte por separado:

```bash
./sh/start_backend.sh    # solo API
./sh/start_frontend.sh   # solo interfaz
```

---

## Comprobar que todo está bien

```bash
# Tests del backend (usan base de datos temporal y OpenRouter simulado:
# no tocan tus datos ni gastan crédito)
server/venv/bin/python -m pytest -q

# Typecheck del frontend
cd web && npm run typecheck
```

Resultado esperado de los tests: `87 passed, 1 skipped` (el skip es la prueba real contra iCloud, desactivada por defecto).

---

## Primeros pasos dentro de la app

1. Crea una **asignatura** en `/asignaturas`.
2. Añade **temas** dentro de ella.
3. Sube **archivos** en `/archivos`: solo se admiten **imágenes y PDF**, hasta **30 MB** por archivo. Los PDF se indexan para buscar por su contenido; las imágenes, solo por nombre.
4. Opcional: crea **eventos** y enlázalos a una asignatura y un tema.
5. Genera **flashcards** desde un tema o crea un set a mano.
6. Usa la página **Principal** para chatear con el modelo; cada conversación queda en el historial.

Los datos están en `db/db.sqlite3` y los archivos en `files/`. Ambos son locales.

---

## Seguridad y límites

- Es una app **de un solo usuario** y sin TLS. El backend escucha solo en `127.0.0.1`. **No abras el puerto 8080 a internet** ni la publiques en un servidor sin poner antes HTTPS y autenticación delante.
- `JWT_SECRET`, `server/auth/password.hash`, `server/auth/device.json` y `.env` **nunca** se suben a git. No los compartas.
- La sesión usa tokens JWT: access de 2 días y refresh de 4. Se guardan en `localStorage` del navegador.
- Las imágenes y descargas de `/files` llevan el token en la URL (`?token=`), porque un `<img>` no puede mandar cabeceras. No compartas esas URLs.
- La documentación de la API (`/docs`, `/redoc`, `/openapi.json`) está **desactivada**.
- La **ejecución de código** de los ejercicios de programación está **desactivada** (`EXERCISE_RUN_ENABLED = False`). El botón no aparece; la API devuelve 403.
- Hay un límite de **32 MB por petición** y de **10 intentos de login fallidos por IP cada 15 minutos**.
- Los logs están en `log/`. `auth.log` registra los intentos de login (resultado, IP y User-Agent), nunca la contraseña ni los tokens.

Si pierdes la contraseña: ejecuta otra vez `./sh/hash_password.sh`. Si cambias `JWT_SECRET`, todas las sesiones abiertas se invalidan.

---

## Estructura del proyecto

```
server/            FastAPI: views, auth, scripts (PDF, CalDAV, OpenRouter)
  main.py          Crea la app, CORS, auth, límites y mount /files
  auth/            Contraseña, JWT, middleware y auditoría de logins
  views/           Endpoints por recurso (asignatura, tema, files, chat...)
  scripts/         Lógica no HTTP (thumbnails, OpenRouter, repaso, CalDAV)
db/                Esquema SQL y ORM de SQLAlchemy (SQLite)
web/               React + TypeScript + Vite + Tailwind
prompts/           Prompts de los modelos, en .txt
files/             Archivos subidos y thumbnails (ignorado por git)
log/               Logs de ejecución (ignorado por git)
sh/                Scripts de arranque, init de DB, hash de contraseña
tests/             pytest del backend
PROJECT.md         Especificación funcional completa
```

---

## Desarrollo

- Regenerar el cliente TypeScript cuando cambie la API:

  ```bash
  ./sh/api_gen.sh
  ```

  Genera `web/openapi.json` desde FastAPI y el SDK en `web/src/api/generated/`.

- El frontend habla con `http://localhost:8080` por defecto. Para cambiarlo, define `VITE_API_URL` en `web/.env`.

- Logs útiles:
  - `log/backend_server.log`: accesos HTTP.
  - `log/backend_server.error.log`: errores y arranque/parada.
  - `log/auth.log`: intentos de login.
  - `log/web_server.log` y `log/web_server.error.log`: Vite.

---

## Problemas frecuentes

**El login siempre dice "Contraseña incorrecta".**
No existe `server/auth/password.hash`, o el `User-Agent` de tu navegador no está en `device.json`. Ejecuta `./sh/hash_password.sh` y revisa `log/auth.log`: ahí sí se distingue `sin-password-configurada` de `dispositivo-bloqueado`.

**El login devuelve 500.**
Falta `JWT_SECRET` en `.env`. Genera uno con `openssl rand -hex 32`.

**El chat o las flashcards dan 502.**
Falta `OPENROUTER_API_KEY`, no tiene saldo o el modelo no está disponible.

**Subir un archivo devuelve 415.**
Solo se aceptan imágenes raster (PNG, JPEG, WebP...) y PDF. No valen SVG, HTML, TXT, DOCX ni un `.png` que por dentro no sea una imagen.

**El archivo supera 30 MB.**
Devuelve 413. El límite es por archivo y hay otro global de 32 MB por petición.

**"La ejecución de código está desactivada".**
Es intencionado. El runner de Python no tiene sandbox; se dejó apagado a propósito.

**Los eventos no aparecen en iCloud.**
Revisa `ICLOUD_MAIL`, `ICLOUD_APP_PASSWORD` y que `ICLOUD_CALENDAR_NAME` coincida exactamente con el nombre del calendario. Aunque CalDAV falle, el evento se guarda en local.

**He actualizado el proyecto y faltan columnas en la base de datos.**
`db/init.py` solo crea tablas que no existen; no migra columnas de tablas ya creadas. Si vienes de una versión anterior, tendrás que aplicar el `ALTER TABLE` correspondiente sobre `db/db.sqlite3` (o empezar con una base de datos nueva).
