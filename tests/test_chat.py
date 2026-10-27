"""Regresion de /chat: hilo unico, historial acotado, adjuntos y limpieza."""


def _send(client, content, file_id=None):
    """Envia un mensaje al hilo global o al de un archivo."""
    payload = {"content": content}
    if file_id is not None:
        payload["file_id"] = file_id
    return client.post("/chat/messages", json=payload)


def test_thread_is_idempotent(client):
    """Pedir dos veces GET /chat/thread devuelve el mismo hilo global."""
    first = client.get("/chat/thread")
    second = client.get("/chat/thread")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert first.json()["file_id"] is None
    assert first.json()["message_count"] == 0


def test_send_message_saves_user_and_assistant(client, fake_openrouter):
    """POST /chat/messages guarda las dos filas y GET las devuelve en orden."""
    response = _send(client, "hola")
    assert response.status_code == 200

    body = response.json()
    assert body["user"]["role"] == "user"
    assert body["user"]["content"] == "hola"
    assert body["user"]["model"] is None
    assert body["assistant"]["role"] == "assistant"
    assert body["assistant"]["content"] == "respuesta mock"
    assert body["assistant"]["model"] == "modelo-test"

    messages = client.get("/chat/messages")
    assert messages.status_code == 200
    assert [item["role"] for item in messages.json()] == ["user", "assistant"]
    assert [item["content"] for item in messages.json()] == [
        "hola",
        "respuesta mock",
    ]


def test_history_sent_to_model_is_capped_at_20(client, fake_openrouter):
    """Tras 25 mensajes, el historial que recibe send_chat tiene 20 como maximo."""
    for index in range(25):
        assert _send(client, f"mensaje {index}").status_code == 200

    assert len(fake_openrouter.calls) == 25

    last_history = fake_openrouter.calls[-1]["messages"]
    assert len(last_history) == 20
    assert last_history[-1] == {"role": "user", "content": "mensaje 24"}


def test_unknown_file_returns_404(client):
    """Un file_id inexistente no crea hilo ni mensaje."""
    response = _send(client, "hola", file_id=9999)

    assert response.status_code == 404
    assert client.get("/chat/messages").json() == []


def test_file_thread_is_separate_and_gets_attachment(client, make_file, fake_openrouter):
    """El hilo del archivo es distinto del global y el mock recibe el path."""
    file_row = make_file(name="apuntes.txt", content=b"apuntes de clase")
    global_thread = client.get("/chat/thread").json()

    response = _send(client, "resume esto", file_id=file_row.id)
    assert response.status_code == 200

    file_thread = client.get("/chat/thread", params={"file_id": file_row.id}).json()
    assert file_thread["file_id"] == file_row.id
    assert file_thread["id"] != global_thread["id"]

    assert fake_openrouter.calls[-1]["files"] == [file_row.path]
    assert client.get("/chat/messages").json() == []


def test_model_failure_keeps_user_message(client, fake_openrouter):
    """Si el modelo falla se devuelve 502 y el mensaje del usuario persiste."""
    fake_openrouter.chat_error = RuntimeError("modelo caido")

    response = _send(client, "mensaje que se conserva")
    assert response.status_code == 502

    messages = client.get("/chat/messages").json()
    assert len(messages) == 1
    assert messages[0]["role"] == "user"
    assert messages[0]["content"] == "mensaje que se conserva"


def test_clear_empties_thread_but_keeps_it(client, make_file, fake_openrouter):
    """DELETE /chat/messages vacia el hilo del archivo sin borrar hilo ni file."""
    file_row = make_file(name="tema.txt", content=b"tema")
    _send(client, "uno", file_id=file_row.id)
    _send(client, "dos", file_id=file_row.id)

    thread_id = client.get("/chat/thread", params={"file_id": file_row.id}).json()["id"]

    response = client.delete("/chat/messages", params={"file_id": file_row.id})
    assert response.status_code == 204

    assert client.get("/chat/messages", params={"file_id": file_row.id}).json() == []

    thread = client.get("/chat/thread", params={"file_id": file_row.id}).json()
    assert thread["id"] == thread_id
    assert thread["message_count"] == 0
    assert client.get(f"/files/{file_row.id}").status_code == 200
