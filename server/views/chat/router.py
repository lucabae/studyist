"""Views de Chat. Prefijo: /chat

La pagina Principal tiene un historial de conversaciones: cada hilo global
(file_id NULL) es una de ellas y se elige por thread_id. La pagina Archivo
mantiene un unico hilo por archivo, resuelto con file_id.

El titulo de cada hilo global lo genera la IA con el primer mensaje del
usuario; el historial se ordena por actividad (updated_at).
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db.db import MADRID, ChatMessage, ChatThread, File, SessionLocal, get_session
from server.models import (
    ChatMessageCreate,
    ChatMessageRead,
    ChatSendResponse,
    ChatThreadRead,
)
from server.scripts import openrouter
from server.scripts.openrouter import open_chat_stream, send_chat

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

# Cuantos mensajes del hilo se mandan como contexto al modelo.
HISTORY_LIMIT = 20
# Longitud maxima del titulo generado; si el modelo se pasa, se recorta.
TITLE_MAX_LENGTH = 60
# El titulo nunca debe retrasar el cierre del stream mas que esto.
TITLE_TIMEOUT_SECONDS = 5


def _get_file_thread(db: Session, file_id: int) -> ChatThread:
    """Devuelve el hilo unico de un archivo, creandolo vacio si falta.

    Pasos: buscar el File y lanzar 404 si no existe; buscar el ChatThread con
    ese file_id; si no existe, crearlo con created_at y updated_at a ahora en
    Madrid; commit; devolver el hilo.
    """
    if db.get(File, file_id) is None:
        raise HTTPException(status_code=404, detail=f"No existe el archivo {file_id}")

    query = select(ChatThread).where(ChatThread.file_id == file_id)
    thread = db.scalar(query)
    if thread is None:
        now = datetime.now(MADRID)
        thread = ChatThread(file_id=file_id, created_at=now, updated_at=now)
        db.add(thread)
        try:
            db.commit()
        except IntegrityError:
            # Dos peticiones a la vez (React StrictMode monta el efecto dos
            # veces) pueden intentar crear el mismo hilo. El indice unico deja
            # pasar solo una: se relee la que gano.
            db.rollback()
            thread = db.scalar(query)
            if thread is None:
                raise

    return thread


def _get_thread(db: Session, thread_id: int) -> ChatThread:
    """Devuelve el hilo por id o lanza 404 si no existe."""
    thread = db.get(ChatThread, thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail=f"No existe el hilo {thread_id}")
    return thread


def _create_global_thread(db: Session) -> ChatThread:
    """Crea un hilo global vacio (una conversacion nueva de la Principal)."""
    now = datetime.now(MADRID)
    thread = ChatThread(file_id=None, created_at=now, updated_at=now)
    db.add(thread)
    db.commit()
    return thread


def _resolve_thread(
    db: Session, thread_id: int | None, file_id: int | None
) -> ChatThread:
    """Resuelve el hilo de una peticion.

    Pasos: si llega thread_id, devolver ese hilo (404 si no existe); si llega
    file_id, el hilo unico del archivo; si no llega ninguno, crear un hilo
    global nuevo: cada envio sin hilo empieza una conversacion limpia.
    """
    if thread_id is not None:
        return _get_thread(db, thread_id)
    if file_id is not None:
        return _get_file_thread(db, file_id)
    return _create_global_thread(db)


def _latest_global_thread(db: Session) -> ChatThread | None:
    """Devuelve el hilo global con actividad mas reciente, o None."""
    return db.scalar(
        select(ChatThread)
        .where(ChatThread.file_id.is_(None))
        .order_by(ChatThread.updated_at.desc(), ChatThread.id.desc())
        .limit(1)
    )


def _thread_read(db: Session, thread: ChatThread) -> ChatThreadRead:
    """Serializa un hilo con su numero de mensajes."""
    message_count = (
        db.scalar(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.thread_id == thread.id
            )
        )
        or 0
    )
    return ChatThreadRead(
        id=thread.id,
        file_id=thread.file_id,
        title=thread.title,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        message_count=message_count,
    )


def _user_message_count(db: Session, thread_id: int) -> int:
    """Cuenta los mensajes de usuario del hilo."""
    return (
        db.scalar(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.thread_id == thread_id,
                ChatMessage.role == "user",
            )
        )
        or 0
    )


def _clean_title(raw: str) -> str:
    """Normaliza la respuesta del modelo a un titulo de una linea.

    Pasos: quitar espacios repetidos y saltos de linea; quitar comillas y
    prefijos del tipo "Titulo:"; quitar el punto final; recortar a
    TITLE_MAX_LENGTH por palabra. Devuelve "" si no queda nada.
    """
    text = " ".join(raw.split()).strip()
    text = text.strip("\"'`“”‘’")
    lowered = text.lower()
    for prefix in ("titulo:", "título:", "title:"):
        if lowered.startswith(prefix):
            text = text[len(prefix) :].strip()
            break
    text = text.rstrip(". ")
    if len(text) > TITLE_MAX_LENGTH:
        text = text[:TITLE_MAX_LENGTH].rsplit(" ", 1)[0].rstrip(",;: ") + "…"
    return text


def _fallback_title(message: str) -> str:
    """Titulo de emergencia si el modelo falla: el primer mensaje recortado."""
    text = " ".join(message.split()).strip()
    if not text:
        return "Nuevo chat"
    if len(text) <= TITLE_MAX_LENGTH:
        return text[:1].upper() + text[1:]
    return text[:TITLE_MAX_LENGTH].rsplit(" ", 1)[0].rstrip(",;: ") + "…"


async def _generate_title(thread_id: int, message: str) -> str:
    """Pide un titulo al modelo y lo guarda en el hilo.

    Pasos: llamar a openrouter.send con el prompt de sistema "title"; limpiar
    la respuesta con _clean_title; si falla o queda vacia, usar
    _fallback_title (el chat nunca se queda sin titulo); guardar el titulo en
    una sesion propia solo si el hilo sigue sin titulo; devolverlo.
    """
    try:
        raw, _model = await openrouter.send(
            message, model_type="title", system_prompt="title"
        )
        title = _clean_title(raw)
    except Exception:
        logger.exception("No se pudo generar el titulo del hilo %s", thread_id)
        title = ""

    if not title:
        title = _fallback_title(message)

    session = SessionLocal()
    try:
        session.execute(
            update(ChatThread)
            .where(ChatThread.id == thread_id, ChatThread.title.is_(None))
            .values(title=title)
        )
        session.commit()
    finally:
        session.close()

    return title


def _start_title_task(
    db: Session, thread: ChatThread, content: str
) -> asyncio.Task[str] | None:
    """Lanza la generacion del titulo solo con el primer mensaje del hilo.

    Pasos: comprobar que el hilo no tiene titulo y que este es su primer
    mensaje de usuario; si se cumple, devolver asyncio.create_task de
    _generate_title; si no, None.
    """
    if thread.title is not None:
        return None
    if thread.file_id is not None:
        return None
    if _user_message_count(db, thread.id) < 1:
        return None
    return asyncio.create_task(_generate_title(thread.id, content))


def _validate_file(db: Session, file_id: int | None) -> None:
    """Lanza 404 si se pide un archivo que no existe."""
    if file_id is not None and db.get(File, file_id) is None:
        raise HTTPException(status_code=404, detail=f"No existe el archivo {file_id}")


def _latest_message(db: Session, thread_id: int) -> ChatMessage | None:
    """Devuelve el ultimo mensaje del hilo, o None si esta vacio."""
    return db.scalar(
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread_id)
        .order_by(ChatMessage.id.desc())
        .limit(1)
    )


def _prepare_user_message(
    db: Session, thread: ChatThread, payload: ChatMessageCreate
) -> ChatMessage:
    """Guarda el mensaje del usuario o reutiliza el ultimo si es un reintento.

    Pasos: con retry=True, exigir que el ultimo mensaje del hilo sea del usuario
    (409 si no: solo se reintenta una respuesta que fallo) y devolverlo sin
    insertar nada; sin retry, crear el mensaje con el contenido, actualizar
    updated_at del hilo, commit y devolverlo.
    """
    if payload.retry:
        message = _latest_message(db, thread.id)
        if message is None or message.role != "user":
            raise HTTPException(
                status_code=409,
                detail="Solo se puede reintentar la respuesta al ultimo mensaje.",
            )
        return message

    message = ChatMessage(
        thread_id=thread.id,
        role="user",
        content=payload.content,
        created_at=datetime.now(MADRID),
    )
    thread.updated_at = message.created_at
    db.add(message)
    db.commit()
    return message


@router.get("/threads", response_model=list[ChatThreadRead])
def list_threads(db: Session = Depends(get_session)) -> list[ChatThreadRead]:
    """Lista las conversaciones globales de la Principal, la mas reciente antes.

    Pasos: consultar los ChatThread con file_id NULL ordenados por updated_at
    descendente; serializar cada uno con su message_count; devolver la lista.
    """
    threads = list(
        db.scalars(
            select(ChatThread)
            .where(ChatThread.file_id.is_(None))
            .order_by(ChatThread.updated_at.desc(), ChatThread.id.desc())
        )
    )
    return [_thread_read(db, thread) for thread in threads]


@router.delete("/threads/{thread_id}", status_code=204)
def delete_thread(thread_id: int, db: Session = Depends(get_session)) -> None:
    """Borra una conversacion completa (sus mensajes caen en cascada).

    Pasos: resolver el hilo (404 si no existe); borrarlo con db.delete; commit.
    """
    thread = _get_thread(db, thread_id)
    db.delete(thread)
    db.commit()


@router.get("/thread", response_model=ChatThreadRead)
def get_thread(
    thread_id: int | None = Query(
        None, description="Id del hilo; omitido devuelve el global mas reciente"
    ),
    file_id: int | None = Query(
        None, description="Id del archivo; omitido usa el hilo global"
    ),
    db: Session = Depends(get_session),
) -> ChatThreadRead:
    """Devuelve un hilo concreto, el de un archivo o el global mas reciente.

    Pasos: con thread_id, devolver ese hilo (404 si falta); con file_id, el
    hilo del archivo creandolo si falta; sin ninguno, el global con actividad
    mas reciente, creando uno vacio solo si no hay ninguno (compatibilidad).
    """
    if thread_id is not None:
        return _thread_read(db, _get_thread(db, thread_id))
    if file_id is not None:
        return _thread_read(db, _get_file_thread(db, file_id))

    thread = _latest_global_thread(db)
    if thread is None:
        thread = _create_global_thread(db)
    return _thread_read(db, thread)


@router.post("/messages/stream")
async def send_message_stream(
    payload: ChatMessageCreate, db: Session = Depends(get_session)
) -> StreamingResponse:
    """Igual que send_message, pero devuelve la respuesta como SSE.

    Pasos: resolver el hilo (thread_id, file_id o uno global nuevo); guardar el
    mensaje del usuario; lanzar la generacion del titulo si es el primer
    mensaje; construir el historial con los ultimos HISTORY_LIMIT mensajes;
    preparar el stream con open_chat_stream; devolver un StreamingResponse que
    emite "meta" (modelo, thread_id e ids), un "delta" por trozo de texto, y al
    final "done" con los dos mensajes ya guardados y el titulo, o "error" si el
    modelo falla.

    El mensaje del asistente se guarda al terminar, en una sesion propia: la
    sesion de la dependencia ya puede estar cerrada mientras se hace streaming.
    Si el cliente corta, no se guarda nada: el mensaje del usuario queda y se
    puede reintentar.
    """
    thread = _resolve_thread(db, payload.thread_id, payload.file_id)
    _validate_file(db, payload.file_id)

    user_message = _prepare_user_message(db, thread, payload)
    thread_id = thread.id
    user_read = ChatMessageRead.model_validate(user_message)
    title_task = _start_title_task(db, thread, payload.content)

    recent_rows = list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.thread_id == thread_id)
            .order_by(ChatMessage.id.desc())
            .limit(HISTORY_LIMIT)
        )
    )
    history = [
        {"role": row.role, "content": row.content}
        for row in reversed(recent_rows)
    ]

    files = None
    if payload.file_id is not None:
        file = db.get(File, payload.file_id)
        files = [file.path]

    stream = await open_chat_stream(
        history, model_type="general", files=files, file_mode=payload.file_mode
    )

    async def events() -> AsyncIterator[str]:
        collected: list[str] = []
        yield _sse(
            "meta",
            {
                "model": stream.model,
                "thread_id": thread_id,
                "user_id": user_read.id,
            },
        )

        try:
            async for chunk in stream.chunks:
                collected.append(chunk)
                yield _sse("delta", {"text": chunk})
        except Exception:
            logger.exception("Fallo en el streaming del hilo %s", thread_id)
            yield _sse(
                "error",
                {"detail": "No se pudo contactar con el modelo. El mensaje se ha guardado."},
            )
            return

        text = "".join(collected)
        if not text.strip():
            yield _sse(
                "error",
                {"detail": "El modelo no devolvio texto. El mensaje se ha guardado."},
            )
            return

        assistant_read = _save_assistant(thread_id, text, stream.model)
        title = await _await_title(title_task)
        yield _sse(
            "done",
            {
                "user": user_read.model_dump(mode="json"),
                "assistant": assistant_read.model_dump(mode="json"),
                "thread_id": thread_id,
                "title": title,
            },
        )

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _await_title(task: asyncio.Task[str] | None) -> str | None:
    """Espera el titulo sin bloquear mas de TITLE_TIMEOUT_SECONDS.

    Pasos: si no hay tarea, devolver None; esperar con asyncio.wait (no cancela
    la tarea al expirar, para que el titulo se guarde igualmente); si termino,
    devolver su resultado; si fallo o expiro, devolver None.
    """
    if task is None:
        return None

    done, _pending = await asyncio.wait({task}, timeout=TITLE_TIMEOUT_SECONDS)
    if task not in done:
        # Se seguira guardando en segundo plano: consumir un posible error.
        def _consume(finished: asyncio.Task[str]) -> None:
            if not finished.cancelled():
                finished.exception()

        task.add_done_callback(_consume)
        return None

    try:
        return task.result()
    except Exception:
        logger.exception("La generacion del titulo fallo")
        return None


def _sse(event: str, data: dict) -> str:
    """Formatea un evento SSE con su nombre y el JSON en una linea."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _save_assistant(thread_id: int, content: str, model: str) -> ChatMessageRead:
    """Guarda el mensaje del asistente al cerrar el stream.

    Pasos: abrir una sesion propia; crear el ChatMessage con el texto completo
    y el modelo; actualizar updated_at del hilo; commit; devolver el mensaje
    serializado. Cierra la sesion al terminar.
    """
    now = datetime.now(MADRID)
    session = SessionLocal()
    try:
        message = ChatMessage(
            thread_id=thread_id,
            role="assistant",
            content=content,
            model=model,
            created_at=now,
        )
        session.add(message)
        thread = session.get(ChatThread, thread_id)
        if thread is not None:
            thread.updated_at = now
        session.commit()
        return ChatMessageRead.model_validate(message)
    finally:
        session.close()


@router.get("/messages", response_model=list[ChatMessageRead])
def list_messages(
    thread_id: int | None = Query(
        None, description="Id del hilo; omitido usa file_id o el global mas reciente"
    ),
    file_id: int | None = Query(
        None, description="Id del archivo; omitido usa el hilo global"
    ),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_session),
) -> list[ChatMessageRead]:
    """Lista los mensajes de un hilo, del mas antiguo al mas reciente.

    Pasos: resolver el hilo con thread_id (404 si falta), con file_id (lo crea
    si falta) o el global mas reciente (lista vacia si no hay ninguno);
    consultar sus mensajes ordenados por id; aplicar limit; devolverlos.
    """
    if thread_id is not None:
        thread = _get_thread(db, thread_id)
    elif file_id is not None:
        thread = _get_file_thread(db, file_id)
    else:
        thread = _latest_global_thread(db)
        if thread is None:
            return []

    query = (
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread.id)
        .order_by(ChatMessage.id)
        .limit(limit)
    )
    return list(db.scalars(query))


@router.post("/messages", response_model=ChatSendResponse)
async def send_message(
    payload: ChatMessageCreate, db: Session = Depends(get_session)
) -> ChatSendResponse:
    """Guarda el mensaje del usuario, pide respuesta al modelo y la guarda.

    Pasos: resolver el hilo; guardar el mensaje user y actualizar
    thread.updated_at con commit; lanzar y esperar la generacion del titulo si
    es el primer mensaje; leer los ultimos HISTORY_LIMIT mensajes del hilo en
    orden ascendente y mapearlos a {"role", "content"}; si hay file_id, pasar
    [file.path] como files; llamar a send_chat con model_type "general"; si
    falla, loggear y devolver 502 dejando guardado el mensaje del usuario; si va
    bien, guardar el mensaje assistant con el modelo devuelto, actualizar
    thread.updated_at, commit y devolver los dos mensajes y el titulo.
    """
    thread = _resolve_thread(db, payload.thread_id, payload.file_id)
    _validate_file(db, payload.file_id)

    user_message = _prepare_user_message(db, thread, payload)
    title_task = _start_title_task(db, thread, payload.content)

    recent_rows = list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.thread_id == thread.id)
            .order_by(ChatMessage.id.desc())
            .limit(HISTORY_LIMIT)
        )
    )
    history = [
        {"role": row.role, "content": row.content}
        for row in reversed(recent_rows)
    ]

    files = None
    if payload.file_id is not None:
        file = db.get(File, payload.file_id)
        files = [file.path]

    try:
        text, model = await send_chat(
            history,
            model_type="general",
            files=files,
            file_mode=payload.file_mode,
        )
    except Exception:
        # El mensaje del usuario ya esta commiteado: se conserva para que pueda
        # reintentar sin volver a escribirlo.
        logger.exception("Fallo al pedir respuesta al modelo para el hilo %s", thread.id)
        await _await_title(title_task)
        raise HTTPException(
            status_code=502,
            detail="No se pudo contactar con el modelo. El mensaje se ha guardado.",
        )

    assistant_message = ChatMessage(
        thread_id=thread.id,
        role="assistant",
        content=text,
        model=model,
        created_at=datetime.now(MADRID),
    )
    thread.updated_at = assistant_message.created_at
    db.add(assistant_message)
    db.commit()

    title = await _await_title(title_task)
    return ChatSendResponse(
        user=user_message, assistant=assistant_message, title=title
    )


@router.delete("/messages", status_code=204)
def clear_messages(
    thread_id: int | None = Query(
        None, description="Id del hilo; omitido usa file_id o el global mas reciente"
    ),
    file_id: int | None = Query(
        None, description="Id del archivo; omitido usa el hilo global"
    ),
    db: Session = Depends(get_session),
) -> None:
    """Borra el historial de un hilo, sin borrar el hilo ni el archivo.

    Pasos: resolver el hilo igual que list_messages; borrar solo las filas de
    chat_message con ese thread_id; commit. Sin hilo global no hay nada que
    borrar.
    """
    if thread_id is not None:
        thread = _get_thread(db, thread_id)
    elif file_id is not None:
        thread = _get_file_thread(db, file_id)
    else:
        thread = _latest_global_thread(db)
        if thread is None:
            return

    db.execute(delete(ChatMessage).where(ChatMessage.thread_id == thread.id))
    db.commit()
