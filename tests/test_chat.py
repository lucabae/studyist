"""Regresion de /chat: historial de hilos, titulos, adjuntos y limpieza."""


def _send(client, content, file_id=None, thread_id=None):
    """Envia un mensaje al hilo indicado, al de un archivo o a uno nuevo."""
    payload = {"content": content}
    if file_id is not None:
        payload["file_id"] = file_id
    if thread_id is not None:
        payload["thread_id"] = thread_id
    return client.post("/chat/messages", json=payload)


def _chat_calls(fake_openrouter):
    """Llamadas de conversacion (sin contar las de generacion de titulo)."""
    return [call for call in fake_openrouter.calls if call["kind"] == "chat"]


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


def test_each_send_without_thread_starts_a_new_chat(client, fake_openrouter):
    """Sin thread_id cada envio abre una conversacion nueva en el historial."""
    first = _send(client, "primer chat").json()
    second = _send(client, "segundo chat").json()

    assert first["user"]["thread_id"] != second["user"]["thread_id"]

    threads = client.get("/chat/threads").json()
    assert len(threads) == 2


def test_first_message_generates_title_and_later_messages_keep_it(
    client, fake_openrouter
):
    """El titulo se genera solo con el primer mensaje del hilo."""
    fake_openrouter.title_reply = "Grafos y recorridos"
    first = _send(client, "explícame los recorridos en grafos").json()
    thread_id = first["user"]["thread_id"]

    assert first["title"] == "Grafos y recorridos"

    second = _send(client, "y el BFS?", thread_id=thread_id).json()
    assert second["title"] is None

    titles = [
        call
        for call in fake_openrouter.calls
        if call["kind"] == "send" and call["system_prompt"] == "title"
    ]
    assert len(titles) == 1

    thread = client.get(f"/chat/thread?thread_id={thread_id}").json()
    assert thread["title"] == "Grafos y recorridos"
    assert thread["message_count"] == 4


def test_clear_title_when_model_fails(client, fake_openrouter):
    """Si el titulo falla se usa el primer mensaje recortado, no queda vacio."""
    fake_openrouter.send_error = RuntimeError("modelo de titulos caido")

    body = _send(client, "plan de repaso para el examen de estructuras").json()

    thread = client.get(f"/chat/thread?thread_id={body['user']['thread_id']}").json()
    assert thread["title"] == "Plan de repaso para el examen de estructuras"


def test_threads_are_listed_by_activity(client, fake_openrouter):
    """GET /chat/threads devuelve primero la conversacion mas reciente."""
    first = _send(client, "chat antiguo").json()
    second = _send(client, "chat reciente").json()

    threads = client.get("/chat/threads").json()

    assert [thread["id"] for thread in threads] == [
        second["user"]["thread_id"],
        first["user"]["thread_id"],
    ]
    assert threads[0]["message_count"] == 2


def test_delete_thread_removes_it_and_its_messages(client, fake_openrouter):
    """DELETE /chat/threads/{id} borra la conversacion completa."""
    body = _send(client, "conversacion efimera").json()
    thread_id = body["user"]["thread_id"]

    response = client.delete(f"/chat/threads/{thread_id}")
    assert response.status_code == 204

    assert client.get(f"/chat/thread?thread_id={thread_id}").status_code == 404
    assert client.get("/chat/threads").json() == []


def test_history_sent_to_model_is_capped_at_20(client, fake_openrouter):
    """Tras 25 mensajes, el historial que recibe send_chat tiene 20 como maximo."""
    thread_id = _send(client, "mensaje 0").json()["user"]["thread_id"]
    for index in range(1, 25):
        assert _send(client, f"mensaje {index}", thread_id=thread_id).status_code == 200

    assert len(_chat_calls(fake_openrouter)) == 25

    last_history = _chat_calls(fake_openrouter)[-1]["messages"]
    assert len(last_history) == 20
    assert last_history[-1] == {"role": "user", "content": "mensaje 24"}


def test_unknown_file_returns_404(client):
    """Un file_id inexistente no crea hilo ni mensaje."""
    response = _send(client, "hola", file_id=9999)

    assert response.status_code == 404
    assert client.get("/chat/messages").json() == []


def test_unknown_file_with_existing_thread_returns_404(client, fake_openrouter):
    """Un file_id inexistente falla aunque llegue tambien un thread_id valido."""
    thread_id = _send(client, "hola").json()["user"]["thread_id"]

    response = _send(client, "con adjunto roto", thread_id=thread_id, file_id=9999)

    assert response.status_code == 404
    messages = client.get("/chat/messages", params={"thread_id": thread_id}).json()
    assert [(item["role"], item["content"]) for item in messages] == [
        ("user", "hola"),
        ("assistant", "respuesta mock"),
    ]


def test_retry_reuses_last_user_message(client, fake_openrouter):
    """retry=True no duplica el mensaje del usuario cuando la respuesta fallo."""
    fake_openrouter.chat_error = RuntimeError("modelo caido")

    failed = _send(client, "pregunta unica")
    assert failed.status_code == 502
    thread_id = client.get("/chat/threads").json()[0]["id"]

    fake_openrouter.chat_error = None
    response = client.post(
        "/chat/messages",
        json={"content": "pregunta unica", "thread_id": thread_id, "retry": True},
    )
    assert response.status_code == 200

    roles = [
        item["role"]
        for item in client.get("/chat/messages", params={"thread_id": thread_id}).json()
    ]
    assert roles == ["user", "assistant"]


def test_clear_with_thread_id_keeps_thread(client, fake_openrouter):
    """DELETE /chat/messages?thread_id= vacia solo esa conversacion."""
    body = _send(client, "uno").json()
    thread_id = body["user"]["thread_id"]
    other = _send(client, "otro chat").json()

    response = client.delete("/chat/messages", params={"thread_id": thread_id})
    assert response.status_code == 204

    assert client.get("/chat/messages", params={"thread_id": thread_id}).json() == []
    assert len(
        client.get("/chat/messages", params={"thread_id": other["user"]["thread_id"]}).json()
    ) == 2
    threads = {thread["id"]: thread for thread in client.get("/chat/threads").json()}
    assert threads[thread_id]["message_count"] == 0


def test_file_thread_is_separate_and_gets_attachment(client, make_file, fake_openrouter):
    """El hilo del archivo es distinto del global y el mock recibe el path."""
    file_row = make_file(name="apuntes.txt", content=b"apuntes de clase")
    global_thread = client.get("/chat/thread").json()

    response = _send(client, "resume esto", file_id=file_row.id)
    assert response.status_code == 200

    file_thread = client.get("/chat/thread", params={"file_id": file_row.id}).json()
    assert file_thread["file_id"] == file_row.id
    assert file_thread["id"] != global_thread["id"]

    assert _chat_calls(fake_openrouter)[-1]["files"] == [file_row.path]
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
