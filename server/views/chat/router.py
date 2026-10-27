"""Views de Chat. Prefijo: /chat

Hay un hilo global (pagina Principal, file_id NULL) y uno por archivo (pagina
Archivo). El hilo se resuelve siempre a partir de file_id: None es el global.
"""

import json
import logging
from collections.abc import AsyncIterator
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db.db import MADRID, ChatMessage, ChatThread, File, SessionLocal, get_session
from server.models import (
    ChatMessageCreate,
    ChatMessageRead,
    ChatSendResponse,
    ChatThreadRead,
)
from server.scripts.openrouter import open_chat_stream, send_chat

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

# Cuantos mensajes del hilo se mandan como contexto al modelo.
HISTORY_LIMIT = 20


def _get_or_create_thread(db: Session, file_id: int | None) -> ChatThread:
    """Devuelve el hilo de un archivo (o el global si file_id es None).

    Pasos: si file_id no es None, buscar el File y lanzar 404 si no existe;
    buscar el ChatThread con ese file_id (is_(None) para el global); si no
    existe, crearlo con created_at y updated_at a ahora en Madrid; commit;
    devolver el hilo.
    """
    if file_id is not None and db.get(File, file_id) is None:
        raise HTTPException(status_code=404, detail=f"No existe el archivo {file_id}")

    query = select(ChatThread)
    if file_id is None:
        query = query.where(ChatThread.file_id.is_(None))
    else:
        query = query.where(ChatThread.file_id == file_id)

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


@router.get("/thread", response_model=ChatThreadRead)
def get_thread(
    file_id: int | None = Query(
        None, description="Id del archivo; omitido devuelve el hilo global"
    ),
    db: Session = Depends(get_session),
) -> ChatThreadRead:
    """Devuelve el hilo global o el de un archivo, creandolo vacio si falta.

    Pasos: resolver el hilo con _get_or_create_thread; contar sus mensajes; y
    devolver el hilo con message_count calculado.
    """
    thread = _get_or_create_thread(db, file_id)
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
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        message_count=message_count,
    )


@router.post("/messages/stream")
async def send_message_stream(
    payload: ChatMessageCreate, db: Session = Depends(get_session)
) -> StreamingResponse:
    """Igual que send_message, pero devuelve la respuesta como SSE.

    Pasos: resolver el hilo; guardar el mensaje del usuario; construir el
    historial con los ultimos HISTORY_LIMIT mensajes; preparar el stream con
    open_chat_stream; devolver un StreamingResponse que emite "meta" (modelo e
    ids), un "delta" por trozo de texto, y al final "done" con los dos mensajes
    ya guardados, o "error" si el modelo falla.

    El mensaje del asistente se guarda al terminar, en una sesion propia: la
    sesion de la dependencia ya puede estar cerrada mientras se hace streaming.
    Si el cliente corta, no se guarda nada: el mensaje del usuario queda y se
    puede reintentar.
    """
    thread = _get_or_create_thread(db, payload.file_id)

    user_message = ChatMessage(
        thread_id=thread.id,
        role="user",
        content=payload.content,
        created_at=datetime.now(MADRID),
    )
    thread.updated_at = user_message.created_at
    db.add(user_message)
    db.commit()

    thread_id = thread.id
    user_read = ChatMessageRead.model_validate(user_message)

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
        yield _sse("meta", {"model": stream.model, "thread_id": thread_id, "user_id": user_read.id})

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
        yield _sse(
            "done",
            {
                "user": user_read.model_dump(mode="json"),
                "assistant": assistant_read.model_dump(mode="json"),
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
    file_id: int | None = Query(
        None, description="Id del archivo; omitido usa el hilo global"
    ),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_session),
) -> list[ChatMessageRead]:
    """Lista los mensajes del hilo, del mas antiguo al mas reciente.

    Pasos: resolver el hilo con _get_or_create_thread; consultar sus mensajes
    ordenados ascendentemente por id; aplicar limit; devolverlos.
    """
    thread = _get_or_create_thread(db, file_id)
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

    Pasos: resolver el hilo con _get_or_create_thread (404 si el archivo no
    existe); guardar el mensaje user y actualizar thread.updated_at con commit;
    leer los ultimos HISTORY_LIMIT mensajes del hilo en orden ascendente y
    mapearlos a {"role", "content"}; si hay file_id, pasar [file.path] como
    files; llamar a send_chat con model_type "general"; si falla, loggear y
    devolver 502 dejando guardado el mensaje del usuario; si va bien, guardar el
    mensaje assistant con el modelo devuelto, actualizar thread.updated_at,
    commit y devolver los dos mensajes.
    """
    thread = _get_or_create_thread(db, payload.file_id)

    user_message = ChatMessage(
        thread_id=thread.id,
        role="user",
        content=payload.content,
        created_at=datetime.now(MADRID),
    )
    thread.updated_at = user_message.created_at
    db.add(user_message)
    db.commit()

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

    return ChatSendResponse(user=user_message, assistant=assistant_message)


@router.delete("/messages", status_code=204)
def clear_messages(
    file_id: int | None = Query(
        None, description="Id del archivo; omitido usa el hilo global"
    ),
    db: Session = Depends(get_session),
) -> None:
    """Borra el historial del hilo, sin borrar el hilo ni el archivo.

    Pasos: resolver el hilo con _get_or_create_thread; borrar solo las filas de
    chat_message con ese thread_id; commit.
    """
    thread = _get_or_create_thread(db, file_id)
    db.execute(delete(ChatMessage).where(ChatMessage.thread_id == thread.id))
    db.commit()
