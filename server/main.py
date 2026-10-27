"""Entrypoint de FastAPI: crea la app, configura CORS y monta las views."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from db.db import init_engine
from server.scripts import files as files_script
from server.views.asignatura.router import router as asignatura_router
from server.views.chat.router import router as chat_router
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

logger = logging.getLogger(__name__)


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
    middleware que convierte los 500 en JSON y, por fuera, el de CORS con
    ALLOWED_ORIGINS, allow_credentials a False y allow_methods/headers a "*";
    incluir los nueve routers; montar /files como
    estatico (despues de los routers para no tapar GET /files ni
    GET /files/{file_id}); devolver la app.
    """
    app = FastAPI(title="Studyist API", version="0.1.0", lifespan=lifespan)
    # El orden importa: el ultimo middleware anadido es el mas externo, asi que
    # CORS envuelve al capturador y sus cabeceras llegan tambien a los 500.
    app.add_middleware(UnhandledErrorMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for router in (
        evento_router,
        asignatura_router,
        chat_router,
        tema_router,
        files_router,
        flashcard_set_router,
        flashcard_router,
        openrouter_router,
        study_router,
    ):
        app.include_router(router)

    # Servir los archivos y thumbnails. El mount va al final: las rutas de la
    # API (/files y /files/{file_id}) tienen prioridad y el resto de paths
    # (/files/images/foo.png...) caen aqui.
    files_script.FILES_ROOT.mkdir(parents=True, exist_ok=True)
    app.mount(
        "/files",
        StaticFiles(directory=files_script.FILES_ROOT),
        name="files",
    )
    return app


_configure_logging()
app = create_app()
