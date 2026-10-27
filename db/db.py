"""Capa SQLAlchemy: engine, sesion, base declarativa y modelos ORM.

El esquema fisico lo crea db/init.py con SQL crudo
(CREATE TABLE IF NOT EXISTS). Los modelos de aqui deben reflejar exactamente
ese esquema: si se anade una columna en un sitio y no en el otro, las consultas
fallan en tiempo de ejecucion. Al tocar una tabla, se tocan los dos archivos.
"""

from datetime import datetime
from pathlib import Path
from typing import Iterator

from zoneinfo import ZoneInfo

from sqlalchemy import (
    Column,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    create_engine,
    event,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
    sessionmaker,
)
from sqlalchemy.types import TypeDecorator

DB_PATH = Path(__file__).resolve().parent / "db.sqlite3"
DATABASE_URL = f"sqlite:///{DB_PATH}"

MADRID = ZoneInfo("Europe/Madrid")


class MadridDateTime(TypeDecorator):
    """Fecha/hora en hora de Madrid, con tzinfo de verdad.

    SQLite no tiene tipo fecha nativo: guardamos el ISO-8601 con offset
    ("2026-11-05T09:00:00+01:00") en la columna TEXT y al leer devolvemos un
    datetime aware en Europe/Madrid. Guardar el offset evita el problema de la
    hora repetida del cambio de octubre: 02:30+02:00 y 02:30+01:00 son valores
    distintos y se conservan.

    Si llega un datetime naive se interpreta como hora de Madrid.
    """

    impl = String
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> str | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=MADRID)
        # astimezone normaliza tambien datetimes que ya vienen en otra zona.
        return value.astimezone(MADRID).isoformat()

    def process_result_value(self, value: str | None, dialect) -> datetime | None:
        if value is None:
            return None
        moment = datetime.fromisoformat(value)
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=MADRID)
        return moment.astimezone(MADRID)

# check_same_thread=False: FastAPI puede atender una peticion en otro hilo.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _enable_foreign_keys(dbapi_connection, _connection_record) -> None:
    """Activa PRAGMA foreign_keys en cada conexion nueva.

    SQLite lo trae desactivado por defecto y el PRAGMA es por conexion, no por
    base de datos: sin esto los ON DELETE CASCADE / SET NULL del esquema no se
    aplican cuando se borra a traves de SQLAlchemy.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys = ON")
    cursor.close()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base declarativa de todos los modelos ORM."""


class Asignatura(Base):
    """Asignatura de un curso. El nombre es unico."""

    __tablename__ = "asignatura"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    semester: Mapped[int] = mapped_column(Integer, nullable=False)
    color: Mapped[str] = mapped_column(String(6), nullable=False)

    eventos: Mapped[list["Evento"]] = relationship(
        back_populates="asignatura", cascade="all, delete-orphan"
    )
    temas: Mapped[list["Tema"]] = relationship(
        back_populates="asignatura", cascade="all, delete-orphan"
    )

    @property
    def tema_count(self) -> int:
        """Numero de temas de la asignatura.

        Se expone como propiedad de solo lectura para que AsignaturaRead lo
        serialice con from_attributes sin cargar la lista entera desde la view.
        """
        return len(self.temas)


class Evento(Base):
    """Examen o tarea. La fecha se guarda aware en Europe/Madrid."""

    __tablename__ = "evento"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    asignatura_id: Mapped[int] = mapped_column(
        ForeignKey("asignatura.id", ondelete="CASCADE"), nullable=False
    )
    # Tema opcional del evento. Si el tema se borra, el evento se queda con
    # tema_id NULL: no hay cascada hacia el evento.
    tema_id: Mapped[int | None] = mapped_column(
        ForeignKey("tema.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    fecha: Mapped[datetime] = mapped_column(MadridDateTime, nullable=False)
    # Duracion del evento en minutos; en los examenes marca el DTEND del VEVENT.
    duration_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=120, server_default="120"
    )
    # UID que asigna CalDAV al crear el evento remoto. NULL si CalDAV fallo.
    uid: Mapped[str | None] = mapped_column(String(200), unique=True)
    # URL del VEVENT en iCloud para el boton "abrir en iCloud". NULL si
    # CalDAV fallo o no esta configurado.
    calendar_url: Mapped[str | None] = mapped_column(String(1000))

    asignatura: Mapped["Asignatura"] = relationship(back_populates="eventos")
    tema: Mapped["Tema | None"] = relationship(lazy="selectin")
    chats: Mapped[list["Chat"]] = relationship(
        back_populates="evento", cascade="all, delete-orphan"
    )

    @property
    def tema_name(self) -> str | None:
        """Nombre del tema vinculado, para no pedir la lista de temas aparte."""
        return self.tema.name if self.tema is not None else None

    @property
    def calendar_warning(self) -> str | None:
        """Aviso para el usuario cuando el evento no llego a iCloud.

        El evento se guarda igualmente; uid NULL significa que CalDAV fallo o
        no esta configurado. Se expone como propiedad de solo lectura para que
        EventoRead lo serialice con from_attributes.
        """
        if self.uid is not None:
            return None
        return (
            "El evento se ha guardado en Studyist, pero no se ha podido crear "
            "en el calendario de iCloud."
        )


class Chat(Base):
    """Enlace a una conversacion externa (Gemini/Claude/Notebook LLM)."""

    __tablename__ = "chat"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    evento_id: Mapped[int] = mapped_column(
        ForeignKey("evento.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)

    evento: Mapped["Evento"] = relationship(back_populates="chats")


class File(Base):
    """Documento guardado bajo /files. El path es relativo a /files."""

    __tablename__ = "file"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    # Tipo de documento elegido por el usuario: teoria, examen, ejercicio u
    # otros. `type` es el MIME.
    kind: Mapped[str] = mapped_column(
        String(20), nullable=False, default="otros", server_default="otros"
    )
    path: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    thumbnail: Mapped[str | None] = mapped_column(String(500))
    # sha256 del contenido: evita guardar dos veces el mismo archivo.
    hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)


class ChatThread(Base):
    """Hilo de conversacion interno con la IA.

    Hay un hilo global (file_id NULL, pagina Principal) y uno por archivo
    (pagina Archivo). El UNIQUE de un hilo por archivo vive en el SQL como
    indice parcial (db/init.py), porque con unique=True en la columna no se
    podrian tener varios hilos globales.
    """

    __tablename__ = "chat_thread"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    file_id: Mapped[int | None] = mapped_column(
        ForeignKey("file.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = mapped_column(MadridDateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(MadridDateTime, nullable=False)

    file: Mapped["File | None"] = relationship()
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="thread",
        cascade="all, delete-orphan",
        order_by="ChatMessage.id",
    )


class ChatMessage(Base):
    """Mensaje de un hilo. model queda NULL en los mensajes del usuario."""

    __tablename__ = "chat_message"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thread_id: Mapped[int] = mapped_column(
        ForeignKey("chat_thread.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(10), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(MadridDateTime, nullable=False)

    thread: Mapped["ChatThread"] = relationship(back_populates="messages")


# Tablas intermedias de los ManyToMany de Tema.
tema_file = Table(
    "tema_file",
    Base.metadata,
    Column("tema_id", ForeignKey("tema.id", ondelete="CASCADE"), primary_key=True),
    Column("file_id", ForeignKey("file.id", ondelete="CASCADE"), primary_key=True),
)

tema_flashcard_set = Table(
    "tema_flashcard_set",
    Base.metadata,
    Column("tema_id", ForeignKey("tema.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "flashcard_set_id",
        ForeignKey("flashcard_set.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Tema(Base):
    """Tema de una asignatura. El orden del temario es alfabetico por nombre.

    Un tema puede colgar de otro tema de la misma asignatura (parent_id). El
    arbol no tiene limite de profundidad y al borrar un tema caen sus hijos en
    cascada (FK ON DELETE CASCADE). parent_id NULL = tema raiz.
    """

    __tablename__ = "tema"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asignatura_id: Mapped[int] = mapped_column(
        ForeignKey("asignatura.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("tema.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    asignatura: Mapped["Asignatura"] = relationship(back_populates="temas")
    files: Mapped[list["File"]] = relationship(secondary=tema_file, lazy="selectin")
    flashcard_sets: Mapped[list["FlashcardSet"]] = relationship(
        secondary=tema_flashcard_set, lazy="selectin"
    )
    parent: Mapped["Tema | None"] = relationship(
        "Tema", remote_side=[id], back_populates="children"
    )
    children: Mapped[list["Tema"]] = relationship(
        "Tema",
        back_populates="parent",
        cascade="all",
        passive_deletes=True,
        lazy="selectin",
        order_by="Tema.name",
    )

    # Propiedades de solo lectura para que TemaRead pueda construirse con
    # from_attributes a partir de la fila ORM.
    @property
    def file_ids(self) -> list[int]:
        return [file.id for file in self.files]

    @property
    def flashcard_set_ids(self) -> list[int]:
        return [flashcard_set.id for flashcard_set in self.flashcard_sets]

    @property
    def child_ids(self) -> list[int]:
        """Ids de los temas que cuelgan directamente de este."""
        return [child.id for child in self.children]


class Ejercicio(Base):
    """Ejercicio generado a partir de un tema, guardado para revisitarlo.

    kind "texto": enunciado + respuesta + explicacion en texto.
    kind "programacion": solucion en Python y test cases en ejercicio_test_case.
    """

    __tablename__ = "ejercicio"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tema_id: Mapped[int] = mapped_column(
        ForeignKey("tema.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    solution: Mapped[str] = mapped_column(Text, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(MadridDateTime, nullable=False)

    test_cases: Mapped[list["EjercicioTestCase"]] = relationship(
        back_populates="ejercicio",
        cascade="all, delete-orphan",
        order_by="EjercicioTestCase.position",
    )

    @property
    def test_case_count(self) -> int:
        """Numero de test cases, para el resumen de la lista."""
        return len(self.test_cases)


class EjercicioTestCase(Base):
    """Caso de prueba de un ejercicio de programacion.

    input es el JSON de los argumentos posicionales de solve(); expected, el
    valor esperado en JSON. Se guardan como texto para no depender del soporte
    JSON de SQLite.
    """

    __tablename__ = "ejercicio_test_case"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ejercicio_id: Mapped[int] = mapped_column(
        ForeignKey("ejercicio.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    input: Mapped[str] = mapped_column(Text, nullable=False)
    expected: Mapped[str] = mapped_column(Text, nullable=False)

    ejercicio: Mapped["Ejercicio"] = relationship(back_populates="test_cases")


class FlashcardSet(Base):
    """Conjunto de flashcards. Una flashcard pertenece a un solo set."""

    __tablename__ = "flashcard_set"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    flashcards: Mapped[list["Flashcard"]] = relationship(
        back_populates="flashcard_set", cascade="all, delete-orphan"
    )

    @property
    def flashcard_ids(self) -> list[int]:
        return [flashcard.id for flashcard in self.flashcards]


class Flashcard(Base):
    """Pregunta/respuesta con repaso espaciado simple (sin algoritmo aun)."""

    __tablename__ = "flashcard"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    flashcard_set_id: Mapped[int] = mapped_column(
        ForeignKey("flashcard_set.id", ondelete="CASCADE"), nullable=False
    )
    last_seen: Mapped[datetime | None] = mapped_column(MadridDateTime)
    difficulty: Mapped[str] = mapped_column(
        String(10), nullable=False, default="medium"
    )
    front: Mapped[str] = mapped_column(Text, nullable=False)
    back: Mapped[str] = mapped_column(Text, nullable=False)
    # Si se borra el file, la FK pasa a NULL y la tarjeta se conserva.
    front_img_id: Mapped[int | None] = mapped_column(
        ForeignKey("file.id", ondelete="SET NULL")
    )
    back_img_id: Mapped[int | None] = mapped_column(
        ForeignKey("file.id", ondelete="SET NULL")
    )

    flashcard_set: Mapped["FlashcardSet"] = relationship(back_populates="flashcards")
    front_img: Mapped["File | None"] = relationship(foreign_keys=[front_img_id])
    back_img: Mapped["File | None"] = relationship(foreign_keys=[back_img_id])


def get_session() -> Iterator[Session]:
    """Dependencia de FastAPI que entrega una sesion por peticion.

    Pasos: abrir una sesion con SessionLocal(), hacer yield dentro de un
    try/finally, y en el finally cerrar la sesion. Si la peticion lanza una
    excepcion, se hace rollback antes de cerrar.
    """
    session = SessionLocal()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_engine() -> None:
    """Prepara la base de datos al arrancar el servidor.

    Pasos: comprobar que db.sqlite3 existe; si no existe, avisar y salir con
    un mensaje claro indicando que hay que lanzar sh/db_init.sh. No crea
    tablas por si mismo (eso es responsabilidad de db/init.py).
    """
    if not DB_PATH.exists():
        raise SystemExit(
            f"No existe la base de datos en {DB_PATH}. "
            "Ejecuta primero: sh/db_init.sh"
        )
