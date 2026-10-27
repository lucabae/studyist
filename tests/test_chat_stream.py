"""Chat en streaming: eventos SSE y persistencia de los dos mensajes."""

import json

from fastapi.testclient import TestClient

from server.scripts.openrouter import ChatStream
from server.views.chat import router as chat_router


def _sse_events(body: str) -> list[tuple[str, dict]]:
    """Parte el cuerpo SSE en pares (evento, datos)."""
    events: list[tuple[str, dict]] = []
    for block in body.strip().split("\n\n"):
        name = "message"
        data = ""
        for line in block.splitlines():
            if line.startswith("event:"):
                name = line[len("event:") :].strip()
            elif line.startswith("data:"):
                data = line[len("data:") :].strip()
        if data:
            events.append((name, json.loads(data)))
    return events


def test_stream_saves_both_messages_and_emits_deltas(
    client: TestClient, session_factory, monkeypatch
) -> None:
    """El stream emite meta/delta/done y guarda la respuesta completa."""
    # El guardado final usa una sesion propia: en tests apunta a la DB temporal.
    monkeypatch.setattr(chat_router, "SessionLocal", session_factory)

    async def fake_open_stream(
        messages, model_type="general", files=None, file_mode="text", model_override=None
    ):
        async def chunks():
            for piece in ["Hola", ", ", "mundo"]:
                yield piece

        assert messages[-1]["content"] == "saluda"
        return ChatStream(model="modelo-test", chunks=chunks())

    monkeypatch.setattr(chat_router, "open_chat_stream", fake_open_stream)

    response = client.post("/chat/messages/stream", json={"content": "saluda"})
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/event-stream")

    events = _sse_events(response.text)
    names = [name for name, _ in events]
    assert names[0] == "meta"
    assert names[-1] == "done"
    assert [data["text"] for name, data in events if name == "delta"] == [
        "Hola",
        ", ",
        "mundo",
    ]

    done = events[-1][1]
    assert done["assistant"]["content"] == "Hola, mundo"
    assert done["assistant"]["model"] == "modelo-test"
    assert done["user"]["content"] == "saluda"

    history = client.get("/chat/messages").json()
    assert [(item["role"], item["content"]) for item in history] == [
        ("user", "saluda"),
        ("assistant", "Hola, mundo"),
    ]


def test_stream_error_keeps_user_message(
    client: TestClient, session_factory, monkeypatch
) -> None:
    """Si el modelo falla a mitad, se emite error y el mensaje del usuario queda."""
    monkeypatch.setattr(chat_router, "SessionLocal", session_factory)

    async def fake_open_stream(
        messages, model_type="general", files=None, file_mode="text", model_override=None
    ):
        async def chunks():
            yield "parcial"
            raise RuntimeError("modelo caido")

        return ChatStream(model="modelo-test", chunks=chunks())

    monkeypatch.setattr(chat_router, "open_chat_stream", fake_open_stream)

    response = client.post("/chat/messages/stream", json={"content": "hola"})
    assert response.status_code == 200

    events = _sse_events(response.text)
    assert [name for name, _ in events] == ["meta", "delta", "error"]
    assert "modelo" in events[-1][1]["detail"]

    history = client.get("/chat/messages").json()
    assert [(item["role"], item["content"]) for item in history] == [("user", "hola")]
