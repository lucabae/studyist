"""Entrypoint de FastAPI: crea la app, configura CORS y monta las views."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from db.db import init_engine
from server.auth.middleware import AuthMiddleware
from server.auth.router import router as auth_router
from server.scripts import files as files_script
from server.views.asignatura.router import router as asignatura_router
from server.views.chat.router import router as chat_router
from server.views.ejercicio.router import router as ejercicio_router
from server.views.evento.router import router as evento_router
from server.views.files.router import router as files_router
from server.views.flashcard.router import router as flashcard_router
from server.views.flashcard_set.router import router as flashcard_set_router
from server.views.openrouter.router import router as openrouter_router
from server.views.study.router import router as study_router
from server.views.tema.router import router as tema_router

# Origenes permitidos por CORS.
# TODO abierto: en produccion esto deberia ser solo http://localhost:5173, y
# ademas hace falta decidir si el server escucha en 127.0.0.1 o en toda la red.
ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

LOG_DIR = Path(__file__).resolve().parents[1] / "log"
ERROR_LOG = LOG_DIR / "backend_server.error.log"

# Tope del cuerpo de una peticion. Deja margen sobre los 30 MB de /files para
# las cabeceras multipart; el middleware lo comprueba antes de que el endpoint
# lea el cuerpo (Content-Length) y tambien mientras llega (chunked).
MAX_REQUEST_BYTES = 32 * 1024 * 1024

logger = logging.getLogger(__name__)


class _BodyTooLarge(Exception):
    """El cliente ha enviado mas bytes de los permitidos."""


class BodySizeLimitMiddleware:
    """Corta las peticiones cuyo cuerpo supera MAX_REQUEST_BYTES con un 413.

    Va por dentro de CORS (para que el navegador pueda leer el 413) y por fuera
    de la app. Si el cuerpo ya se estaba enviando cuando se detecta el exceso,
    no se puede reescribir la respuesta: se relanza.
    """

    def __init__(self, app) -> None:  # noqa: ANN001 - ASGI app
        self.app = app

    async def __call__(self, scope, receive, send) -> None:  # noqa: ANN001
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in scope.get("headers", [])
        }
        declared = headers.get("content-length")
        if declared is not None:
            try:
                if int(declared) > MAX_REQUEST_BYTES:
                    await _payload_too_large(scope, receive, send)
                    return
            except ValueError:
                pass

        received = 0
        started = False
        exceeded = False

        async def counting_receive():
            nonlocal received, exceeded
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > MAX_REQUEST_BYTES:
                    exceeded = True
                    raise _BodyTooLarge
            return message

        async def tracking_send(message) -> None:  # noqa: ANN001
            nonlocal started
            # Si nos hemos pasado, se descarta lo que responda la app (FastAPI
            # convierte el corte en un 400 al parsear): el cliente ve el 413.
            if exceeded:
                return
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, counting_receive, tracking_send)
        except _BodyTooLarge:
            pass

        if exceeded and not started:
            await _payload_too_large(scope, receive, send)


async def _payload_too_large(scope, receive, send) -> None:  # noqa: ANN001
    """Responde 413 con un mensaje generico, sin detalles del tamano."""
    await JSONResponse(
        status_code=413,
        content={"detail": "La petición es demasiado grande."},
    )(scope, receive, send)


class SafeStaticFiles(StaticFiles):
    """Mount estatico sin ejecucion de nada en el origen de la API.

    Aunque las subidas nuevas solo admiten imagenes y PDF, en disco pueden
    quedar ficheros antiguos (html, svg, txt). `nosniff` evita que el navegador
    adivine el tipo y la CSP `sandbox` deja inertes los scripts de cualquier
    HTML o SVG que se sirviera desde aqui.
    """

    async def get_response(self, path, scope):  # noqa: ANN001
        response = await super().get_response(path, scope)
        response.headers["X-Content-Type-Options"] = "nosniff"
        content_type = response.headers.get("content-type", "")
        # Los visores de PDF no ejecutan scripts y la CSP puede impedir que el
        # navegador los abra; se deja el PDF intacto y se blindan el resto
        # (imagenes incluidas, por si queda algun SVG antiguo).
        if not content_type.startswith("application/pdf"):
            response.headers["Content-Security-Policy"] = "default-src 'none'; sandbox"
        return response




def _configure_logging() -> None:
    """Manda los logs de la aplicacion a log/backend_server.error.log.

    Pasos: crear LOG_DIR si falta; construir un FileHandler sobre ERROR_LOG con
    formato fecha/nivel/modulo/mensaje; anadir el handler al logger raiz si no
    esta ya (uvicorn --reload puede importar el modulo mas de una vez); dejar el
    raiz en WARNING y subir a INFO los loggers propios (server, db).

    Los accesos HTTP no pasan por aqui: uvicorn escribe su access log por
    stdout y sh/start_backend.sh lo redirige a log/backend_server.log.
    """
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    target = str(ERROR_LOG.resolve())

    root = logging.getLogger()
    already = any(
        isinstance(handler, logging.FileHandler)
        and str(Path(handler.baseFilename).resolve()) == target
        for handler in root.handlers
    )
    if not already:
        handler = logging.FileHandler(ERROR_LOG, encoding="utf-8")
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
        )
        root.addHandler(handler)

    root.setLevel(logging.WARNING)
    # Los loggers propios si queremos INFO; httpx/uvicorn se quedan en WARNING
    # para no llenar el fichero con una linea por peticion.
    for name in ("server", "db"):
        logging.getLogger(name).setLevel(logging.INFO)


class UnhandledErrorMiddleware:
    """Convierte una excepcion no controlada en un 500 JSON legible.

    Va por dentro de CORS a proposito: si el 500 saliera sin cabeceras CORS el
    navegador no puede leer el cuerpo y Safari lo muestra como «Load failed»,
    sin mensaje util. Aqui se registra antes que CORS para quedar por dentro.

    Si la respuesta ya habia empezado a enviarse (por ejemplo, un stream), no
    se puede reescribir: se relanza y lo gestiona Starlette.
    """

    def __init__(self, app) -> None:  # noqa: ANN001 - ASGI app
        self.app = app

    async def __call__(self, scope, receive, send) -> None:  # noqa: ANN001
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        started = False

        async def send_wrapper(message) -> None:  # noqa: ANN001
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except _BodyTooLarge:
            # Lo gestiona BodySizeLimitMiddleware (que va por fuera) para
            # responder 413 en vez de convertir el corte en un 500.
            raise
        except Exception:
            logger.exception(
                "Error no controlado en %s %s", scope.get("method"), scope.get("path")
            )
            if started:
                raise
            await JSONResponse(
                status_code=500,
                content={"detail": "Error interno del servidor. Inténtalo de nuevo."},
            )(scope, receive, send)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Valida la base de datos al arrancar y deja rastro en el log.

    Pasos: llamar a init_engine (falla con mensaje claro si no existe
    db.sqlite3); loggear el arranque; ceder el control a la app; al parar,
    loggear el apagado.
    """
    init_engine()
    logger.info("Servidor Studyist arrancado")
    try:
        yield
    finally:
        logger.info("Servidor Studyist parado")


def create_app() -> FastAPI:
    """Construye la aplicacion.

    Pasos: instanciar FastAPI con title, version y lifespan; anadir el
    middleware de auth y, por fuera, el que convierte los 500 en JSON y el de
    CORS con ALLOWED_ORIGINS, allow_credentials a False y
    allow_methods/headers a "*"; incluir los once routers; montar /files como
    estatico (despues de los routers para no tapar GET /files ni
    GET /files/{file_id}); devolver la app.
    """
    app = FastAPI(
        title="Studyist API",
        version="0.1.0",
        lifespan=lifespan,
        # La API solo la consume el frontend local: sin Swagger, ReDoc ni
        # openapi.json publicos (api_gen.sh sigue generando el JSON llamando a
        # app.openapi()).
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    # El orden importa: el ultimo middleware anadido es el mas externo. Auth va
    # por dentro de CORS (los 401 llevan cabeceras CORS) y del capturador de
    # 500 (un fallo inesperado de auth se ve como 500 JSON y no como traceback).
    app.add_middleware(AuthMiddleware)
    app.add_middleware(UnhandledErrorMiddleware)
    app.add_middleware(BodySizeLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for router in (
        auth_router,
        evento_router,
        asignatura_router,
        chat_router,
        tema_router,
        files_router,
        flashcard_set_router,
        flashcard_router,
        openrouter_router,
        study_router,
        ejercicio_router,
    ):
        app.include_router(router)

    # Servir los archivos y thumbnails. El mount va al final: las rutas de la
    # API (/files y /files/{file_id}) tienen prioridad y el resto de paths
    # (/files/images/foo.png...) caen aqui.
    files_script.FILES_ROOT.mkdir(parents=True, exist_ok=True)
    app.mount(
        "/files",
        SafeStaticFiles(directory=files_script.FILES_ROOT),
        name="files",
    )
    return app


_configure_logging()
app = create_app()
