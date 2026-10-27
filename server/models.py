"""Schemas Pydantic de request y response.

Los nombres de campo de la API van en snake_case en ingles; solo los valores
de los enums conservan el texto del dominio ("Examen", "Tarea", "hard"...).
Ninguna clase de aqui toca la base de datos: son solo validacion y
serializacion.
"""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Alias de tipos usados en varias clases.
Difficulty = Literal["hard", "medium", "easy"]
Semester = Literal[1, 2]
EventType = Literal["Examen", "Tarea"]
ModelType = Literal["pdf", "general"]
ChatRole = Literal["user", "assistant"]
FlashcardAmount = Literal["pocas", "medio", "muchas"]
# Como se mandan los PDFs al modelo: "text" extrae el texto con pypdfium2 y lo
# manda como texto plano (sin coste de procesado de archivo); "file" envia el
# PDF en base64 para que OpenRouter lo parsee (nativo u OCR, cobrado por pagina).
FileMode = Literal["text", "file"]

Name = Annotated[str, Field(min_length=1, max_length=200)]
# Texto de una tarjeta (front/back). El generador descarta lo que pase de este
# limite, asi que la respuesta puede validarlo sin romperse. El prompt pide
# explicaciones exhaustivas con referencias: 500 caracteres se quedaba corto y
# tiraba la mayoria de tarjetas generadas.
CARD_TEXT_MAX_LENGTH = 2000
CardText = Annotated[str, Field(min_length=1, max_length=CARD_TEXT_MAX_LENGTH)]
HexColor = Annotated[str, Field(pattern=r"^[0-9A-Fa-f]{6}$")]


# --- Evento ---------------------------------------------------------------


class ChatItem(BaseModel):
    """Chat externo asociado a un evento. En el request solo viaja el contenido;
    el evento lo pone la view a partir del path."""

    model_config = ConfigDict(from_attributes=True)

    name: Name
    url: str


class ChatRead(ChatItem):
    """Chat ya guardado, con su id."""

    id: int


class EventoBase(BaseModel):
    """Campos comunes de evento."""

    type: EventType = Field(description="Examen o Tarea")
    asignatura_id: int
    tema_id: int | None = Field(
        default=None, description="Tema opcional del evento; NULL si no tiene"
    )
    name: Name
    fecha: datetime
    duration_minutes: int = Field(
        default=120, ge=5, le=1440, description="Duracion en minutos del evento"
    )
    chats: list[ChatItem] = Field(default_factory=list)


class EventoCreate(EventoBase):
    """Payload de creacion. Incluye todos los campos."""


class EventoUpdate(BaseModel):
    """Payload de modificacion. La fecha queda fuera a proposito."""

    type: EventType | None = None
    asignatura_id: int | None = None
    tema_id: int | None = None
    name: Name | None = None
    duration_minutes: int | None = Field(default=None, ge=5, le=1440)
    chats: list[ChatItem] | None = None


class EventoRead(EventoBase):
    """Respuesta con la fila completa. uid es el UID de CalDAV y puede ser
    None si el evento remoto no se pudo crear. calendar_warning lleva el aviso
    para el usuario en ese caso."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    tema_name: str | None = Field(
        default=None, description="Nombre del tema vinculado, si tiene"
    )
    uid: str | None = None
    calendar_url: str | None = Field(
        default=None,
        description="URL del VEVENT en iCloud; NULL si CalDAV fallo",
    )
    calendar_warning: str | None = Field(
        default=None,
        description="Aviso si el evento no se pudo sincronizar con iCloud",
    )


# --- Asignatura -----------------------------------------------------------


class AsignaturaBase(BaseModel):
    """Campos comunes de asignatura."""

    name: Name
    year: int = Field(ge=1, le=6)
    semester: Semester
    color: HexColor


class AsignaturaCreate(AsignaturaBase):
    """Payload de creacion."""


class AsignaturaUpdate(BaseModel):
    """Payload de modificacion. Todos los campos opcionales."""

    name: Name | None = None
    year: int | None = Field(default=None, ge=1, le=6)
    semester: Semester | None = None
    color: HexColor | None = None


class AsignaturaRead(AsignaturaBase):
    """Respuesta con la fila completa y cuantos temas tiene."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    tema_count: int = 0


# --- Tema -----------------------------------------------------------------


class TemaBase(BaseModel):
    """Campos comunes de tema."""

    asignatura_id: int
    name: Name
    notes: str | None = None
    parent_id: int | None = Field(
        default=None,
        description="Tema del que cuelga este; NULL lo deja en la raiz",
    )
    file_ids: list[int] = Field(default_factory=list)
    flashcard_set_ids: list[int] = Field(default_factory=list)


class TemaCreate(TemaBase):
    """Payload de creacion."""


class TemaUpdate(BaseModel):
    """Payload de modificacion. Los campos opcionales se aplican solo si
    llegan; las listas, si llegan, reemplazan las relaciones actuales.
    parent_id a null mueve el tema a la raiz."""

    asignatura_id: int | None = None
    name: Name | None = None
    notes: str | None = None
    parent_id: int | None = None
    file_ids: list[int] | None = None
    flashcard_set_ids: list[int] | None = None


class TemaRead(TemaBase):
    """Respuesta con la fila completa."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    child_ids: list[int] = Field(
        default_factory=list, description="Ids de los temas que cuelgan de este"
    )


# --- File -----------------------------------------------------------------

# Tipo de documento. No confundir con `type`, que es el MIME.
FileKind = Literal["teoria", "examen", "ejercicio", "otros"]


class FileRead(BaseModel):
    """Respuesta con la fila completa. path es relativo a /files."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    kind: FileKind
    path: str
    size: int
    thumbnail: str | None
    hash: str = Field(description="sha256 del contenido, sirve para deduplicar")


class FileUpdate(BaseModel):
    """Payload de modificacion: renombrar y/o cambiar el tipo de documento."""

    name: Name
    kind: FileKind | None = None


# --- Chat -----------------------------------------------------------------


class ChatMessageCreate(BaseModel):
    """Payload para enviar un mensaje al hilo.

    El hilo no viaja en el cuerpo: la view lo resuelve con file_id (None para el
    hilo global de la pagina Principal)."""

    content: str = Field(min_length=1)
    file_id: int | None = None
    file_mode: FileMode = Field(
        default="text",
        description="Solo aplica al archivo adjunto: texto extraido o PDF original",
    )


class ChatMessageRead(BaseModel):
    """Mensaje ya guardado. model es NULL en los mensajes del usuario."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    thread_id: int
    role: ChatRole
    content: str
    model: str | None = None
    created_at: datetime


class ChatSendResponse(BaseModel):
    """Respuesta del envio: el mensaje del usuario y el de la IA."""

    user: ChatMessageRead
    assistant: ChatMessageRead


class ChatThreadRead(BaseModel):
    """Hilo sin sus mensajes, solo con cuantos tiene."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    file_id: int | None = None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


# --- Flashcard Set --------------------------------------------------------


class FlashcardSetBase(BaseModel):
    """Campos comunes de un set de flashcards."""

    name: Name


class FlashcardSetCreate(FlashcardSetBase):
    """Payload de creacion."""


class FlashcardSetUpdate(FlashcardSetBase):
    """Payload de modificacion."""


class FlashcardSetRead(FlashcardSetBase):
    """Respuesta con la fila completa y los ids de sus tarjetas."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    flashcard_ids: list[int] = Field(default_factory=list)


# --- Flashcard ------------------------------------------------------------


class FlashcardBase(BaseModel):
    """Campos comunes de flashcard. El set no esta aqui porque una tarjeta no
    deberia cambiar de set al modificarse."""

    front: CardText
    back: CardText
    front_img_id: int | None = None
    back_img_id: int | None = None


class FlashcardCreate(FlashcardBase):
    """Payload de creacion. Requiere el set al que pertenece la tarjeta."""

    flashcard_set_id: int


class FlashcardUpdate(BaseModel):
    """Payload de modificacion. La dificultad no se toca aqui: solo se cambia
    con el endpoint de seen."""

    front: CardText | None = None
    back: CardText | None = None
    front_img_id: int | None = None
    back_img_id: int | None = None


class FlashcardRead(FlashcardBase):
    """Respuesta con la fila completa."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    flashcard_set_id: int
    last_seen: datetime | None
    difficulty: Difficulty


class FlashcardSeen(BaseModel):
    """Payload del endpoint seen."""

    difficulty: Difficulty


# --- Openrouter -----------------------------------------------------------


class OpenrouterSendRequest(BaseModel):
    """Payload para enviar un mensaje a un modelo."""

    message: str
    model_type: ModelType
    system_prompt: str = Field(description="Nombre del .txt en /prompts, sin extension")
    files: list[str] | None = Field(
        default=None, description="Paths relativos a /files (no absolutos)"
    )
    file_mode: FileMode = Field(
        default="text",
        description="Solo aplica a los PDF: texto extraido o archivo original",
    )
    model_override: str | None = None


class OpenrouterSendResponse(BaseModel):
    """Respuesta con el texto generado y el modelo finalmente usado."""

    content: str
    model: str


# --- Study ----------------------------------------------------------------


class GenerateFlashcardsRequest(BaseModel):
    """Payload para generar flashcards a partir de documentos.

    Con un int se piden exactamente esas tarjetas (como maximo 50). Con
    "pocas", "medio" o "muchas" el modelo decide cuantas, sin truncar despues
    lo que devuelva."""

    flashcard_set_id: int
    file_ids: list[int] = Field(min_length=1)
    amount: int | FlashcardAmount = Field(
        default=10,
        description="Numero exacto o una estimacion cualitativa",
    )
    instructions: str | None = Field(
        default=None, max_length=2000, description="Indicaciones extra del usuario"
    )
    file_mode: FileMode = Field(
        default="text",
        description="Solo aplica a los PDF: texto extraido o archivo original",
    )
    model_override: str | None = None

    @field_validator("amount")
    @classmethod
    def _check_amount_range(cls, value: int | str) -> int | str:
        """Comprueba el rango solo cuando amount llega como numero."""
        if isinstance(value, int) and not 1 <= value <= 50:
            raise ValueError("amount debe estar entre 1 y 50")
        return value


class GeneratedFlashcard(BaseModel):
    """Tarjeta propuesta por el modelo (aun no guardada)."""

    front: str
    back: str


class GenerateFlashcardsResponse(BaseModel):
    """Respuesta con las tarjetas creadas, descartadas y duplicadas."""

    created: list[FlashcardRead]
    discarded: int
    duplicates: int = 0
