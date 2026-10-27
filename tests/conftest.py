"""Fixtures compartidas de la suite de regresion.

Cada test corre contra una SQLite temporal creada con el esquema de
db/init.py, con /files redirigido a una carpeta temporal y con OpenRouter
sustituido por mocks asincronos: nada toca la DB real, /files real ni la red.
"""

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

# Permite importar db/ y server/ al lanzar pytest desde la raiz del repo.
REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import server.views.chat.router as chat_router  # noqa: E402
from db import init as db_init  # noqa: E402
from db.db import File, get_session  # noqa: E402
from server.main import create_app  # noqa: E402
from server.scripts import files as files_script  # noqa: E402
from server.scripts import openrouter  # noqa: E402

# Respuesta valida del modelo para /flashcard_set/from-files.
FLASHCARDS_REPLY = json.dumps(
    [
        {"front": "Que es la fotosintesis?", "back": "Convertir luz en energia."},
        {"front": "Donde ocurre?", "back": "En los cloroplastos."},
        {"front": "Que gas se libera?", "back": "Oxigeno."},
    ],
    ensure_ascii=False,
)

CHAT_REPLY = ("respuesta mock", "modelo-test")


@pytest.fixture()
def engine(tmp_path):
    """Crea una SQLite temporal con el esquema de db/init.py."""
    db_path = tmp_path / "test.sqlite3"

    connection = db_init.connect(db_path)
    try:
        db_init.create_tables(connection)
    finally:
        connection.close()

    test_engine = create_engine(
        f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
    )

    @event.listens_for(test_engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _connection_record):
        """Activa PRAGMA foreign_keys en cada conexion nueva."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.close()

    yield test_engine
    test_engine.dispose()


@pytest.fixture()
def session_factory(engine):
    """Factoria de sesiones ligada a la DB temporal."""
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def db_session(session_factory):
    """Sesion suelta para inspecciones directas desde los tests."""
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def files_root(tmp_path, monkeypatch):
    """Redirige /files a tmp_path para no escribir en el /files real."""
    root = tmp_path / "files"
    for subdir in ("images", "pdfs", "texts", "others", "thumb"):
        (root / subdir).mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(files_script, "FILES_ROOT", root)
    monkeypatch.setattr(files_script, "THUMB_DIR", root / "thumb")
    return root


@pytest.fixture()
def client(files_root, session_factory):
    """TestClient con get_session apuntando a la DB temporal.

    Depende de files_root para que el mount /files se cree ya sobre tmp_path.
    """
    def override_get_session():
        session = session_factory()
        try:
            yield session
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    app = create_app()
    app.dependency_overrides[get_session] = override_get_session

    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        app.dependency_overrides.clear()
        test_client.close()


class FakeOpenRouter:
    """Doble de OpenRouter: guarda las llamadas y permite forzar errores.

    send devuelve un JSON de 3 tarjetas y send_chat devuelve la respuesta fija
    de CHAT_REPLY. Los tests activan send_error / chat_error para simular caidas.
    """

    def __init__(self) -> None:
        self.calls: list[dict] = []
        self.send_error: Exception | None = None
        self.chat_error: Exception | None = None
        # Si se rellena, send devuelve este texto en vez de FLASHCARDS_REPLY.
        self.send_reply: str | None = None

    async def send(
        self,
        message,
        model_type,
        system_prompt,
        files=None,
        file_mode="text",
        model_override=None,
    ):
        """Mock de openrouter.send."""
        self.calls.append(
            {
                "kind": "send",
                "message": message,
                "model_type": model_type,
                "system_prompt": system_prompt,
                "files": files,
                "file_mode": file_mode,
                "model_override": model_override,
            }
        )
        if self.send_error is not None:
            raise self.send_error
        return self.send_reply or FLASHCARDS_REPLY, "modelo-test"

    async def send_chat(
        self,
        messages,
        model_type="general",
        files=None,
        file_mode="text",
        model_override=None,
    ):
        """Mock de openrouter.send_chat."""
        self.calls.append(
            {
                "kind": "chat",
                "messages": [dict(item) for item in messages],
                "model_type": model_type,
                "files": files,
                "file_mode": file_mode,
                "model_override": model_override,
            }
        )
        if self.chat_error is not None:
            raise self.chat_error
        return CHAT_REPLY


@pytest.fixture(autouse=True)
def _block_real_openrouter(monkeypatch):
    """Bloquea la red: cualquier llamada real a OpenRouter falla el test."""
    async def _blocked(_payload):
        raise RuntimeError("llamada real a OpenRouter bloqueada en tests")

    monkeypatch.setattr(openrouter, "_post", _blocked)


@pytest.fixture()
def fake_openrouter(monkeypatch):
    """Sustituye las llamadas reales a OpenRouter por mocks asincronos."""
    fake = FakeOpenRouter()
    monkeypatch.setattr(openrouter, "send", fake.send)
    # El router de chat importo send_chat por nombre: hay que parchear alli.
    monkeypatch.setattr(chat_router, "send_chat", fake.send_chat)
    return fake


@pytest.fixture()
def make_file(session_factory):
    """Devuelve un helper que inserta filas File sin escribir en disco."""
    def _make_file(
        name="nota.txt",
        file_type=None,
        path=None,
        content=b"",
        thumbnail=None,
    ):
        resolved_type = file_type or files_script._detect_mime(name)
        relative_path = path or (
            f"{files_script._detect_subdir(resolved_type)}/{name}"
        )

        session = session_factory()
        try:
            row = File(
                name=name,
                type=resolved_type,
                path=relative_path,
                size=len(content),
                thumbnail=thumbnail,
                hash=files_script.compute_hash(
                    content or relative_path.encode("utf-8")
                ),
            )
            session.add(row)
            session.commit()
            return row
        finally:
            session.close()

    return _make_file
