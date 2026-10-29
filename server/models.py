"""Schemas Pydantic de request y response.

Los nombres de campo de la API van en snake_case en ingles; solo los valores
de los enums conservan el texto del dominio ("Examen", "Tarea", "hard"...).
Ninguna clase de aqui toca la base de datos: son solo validacion y
serializacion.
"""

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Alias de tipos usados en varias clases.
Difficulty = Literal["hard", "medium", "easy"]
Semester = Literal[1, 2]
EventType = Literal["Examen", "Tarea"]
ModelType = Literal["pdf", "general", "exercise"]
ChatRole = Literal["user", "assistant"]
FlashcardAmount = Literal["pocas", "medio", "muchas"]
# Tipo de ejercicio: texto puro o problema de programacion con test cases.
ExerciseKind = Literal["programacion", "texto"]
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

    El hilo se elige por thread_id (una conversacion concreta del historial) o,
    en la pagina Archivo, por file_id. Para la pagina Principal, sin thread_id
    ni file_id, la view crea un hilo global nuevo: cada conversacion empieza
    limpia y el historial se consulta aparte."""

    content: str = Field(min_length=1)
    thread_id: int | None = None
    file_id: int | None = None
    retry: bool = Field(
        default=False,
        description="Reintenta la respuesta del ultimo mensaje de usuario sin duplicarlo",
    )
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
    title: str | None = None


class ChatThreadRead(BaseModel):
    """Hilo sin sus mensajes, solo con su titulo y cuantos tiene."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    file_id: int | None = None
    title: str | None = None
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


# --- Exercise -------------------------------------------------------------


class GenerateExerciseRequest(BaseModel):
    """Payload para generar un ejercicio desde los examenes y ejercicios de un
    tema. El modelo recibe solo los archivos de tipo `examen` o `ejercicio`
    vinculados a ese tema. El ejercicio generado se guarda en la BBDD."""

    tema_id: int
    kind: ExerciseKind = Field(
        default="texto", description="texto puro o problema de programacion"
    )
    instructions: str | None = Field(
        default=None, max_length=2000, description="Indicaciones extra del usuario"
    )
    file_mode: FileMode = Field(
        default="text",
        description="Solo aplica a los PDF: texto extraido o archivo original",
    )
    model_override: str | None = None


class EjercicioTestCaseRead(BaseModel):
    """Caso de prueba de un ejercicio de programacion.

    input es un array JSON con los argumentos de solve(); expected, el valor
    esperado en JSON.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    position: int
    input: str
    expected: str


class EjercicioRead(BaseModel):
    """Ejercicio guardado, con sus test cases si es de programacion."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    tema_id: int
    kind: ExerciseKind
    statement: str
    solution: str
    explanation: str
    created_at: datetime
    test_cases: list[EjercicioTestCaseRead] = Field(default_factory=list)


class EjercicioSummary(BaseModel):
    """Ejercicio para la lista de un tema, sin solucion ni test cases."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    tema_id: int
    kind: ExerciseKind
    statement: str
    created_at: datetime
    test_case_count: int = 0


class GenerateExerciseResponse(BaseModel):
    """Ejercicio guardado y los archivos que se usaron para generarlo."""

    exercise: EjercicioRead
    model: str
    files: list[str] = Field(
        default_factory=list, description="Nombres de los archivos que se usaron"
    )


class RunExerciseRequest(BaseModel):
    """Codigo Python del usuario para pasar los test cases del ejercicio."""

    code: str = Field(min_length=1, max_length=20000)


class TestCaseResult(BaseModel):
    """Resultado de un test case: si paso, que devolvio y el error si lo hubo."""

    position: int
    passed: bool
    expected: Any = None
    actual: Any = None
    error: str | None = None


class RunExerciseResponse(BaseModel):
    """Resultado global de la ejecucion y el detalle por test case."""

    ok: bool
    results: list[TestCaseResult] = Field(default_factory=list)
    error: str | None = None


# --- Auth -----------------------------------------------------------------


class LoginRequest(BaseModel):
    """Contrasena local del unico usuario."""

    password: str = Field(min_length=1, max_length=200)


class RefreshRequest(BaseModel):
    """Refresh token con el que se pide un par nuevo."""

    refresh_token: str = Field(min_length=1)


class TokenPair(BaseModel):
    """Par de tokens que devuelven /auth/login y /auth/refresh."""

    access_token: str = Field(
        description="JWT de acceso; se manda en Authorization: Bearer <token>"
    )
    refresh_token: str = Field(
        description="JWT para pedir un par nuevo en /auth/refresh"
    )
    token_type: str = Field(default="bearer", description="Siempre bearer")
    expires_in: int = Field(description="Segundos que dura el access token")
    refresh_expires_in: int = Field(description="Segundos que dura el refresh token")


class AuthMe(BaseModel):
    """Datos de la sesion en curso.

    No incluye nada del dispositivo: si no estuviera permitido, el middleware
    ya habria contestado 401 y no se llegaria aqui.
    """

    subject: str
    expires_at: datetime
