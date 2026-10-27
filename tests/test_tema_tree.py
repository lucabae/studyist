"""Jerarquia de temas: padre, ciclos y borrado en cascada."""

from fastapi.testclient import TestClient


def _subject(client: TestClient, name: str) -> dict:
    """Crea una asignatura de prueba y devuelve su JSON."""
    response = client.post(
        "/asignatura",
        json={"name": name, "year": 1, "semester": 1, "color": "6f6f6f"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_create_child_and_list_tree(client: TestClient) -> None:
    """Un tema puede colgar de otro y ambos aparecen con su parentesco."""
    subject = _subject(client, "__test_tree_lista__")

    parent = client.post(
        "/tema",
        json={"asignatura_id": subject["id"], "name": "Tema 1", "notes": ""},
    ).json()
    child = client.post(
        "/tema",
        json={
            "asignatura_id": subject["id"],
            "name": "Tema 1.1",
            "notes": "",
            "parent_id": parent["id"],
        },
    )
    assert child.status_code == 201, child.text
    child_body = child.json()
    assert child_body["parent_id"] == parent["id"]

    topics = client.get(
        "/tema", params={"asignatura_id": subject["id"]}
    ).json()
    by_id = {topic["id"]: topic for topic in topics}
    assert by_id[parent["id"]]["parent_id"] is None
    assert by_id[parent["id"]]["child_ids"] == [child_body["id"]]
    assert by_id[child_body["id"]]["child_ids"] == []

    client.delete(f"/asignatura/{subject['id']}")


def test_parent_must_exist_and_share_subject(client: TestClient) -> None:
    """Un padre inexistente da 404 y uno de otra asignatura da 400."""
    first = _subject(client, "__test_tree_a__")
    second = _subject(client, "__test_tree_b__")
    foreign = client.post(
        "/tema", json={"asignatura_id": second["id"], "name": "Ajeno", "notes": ""}
    ).json()

    missing = client.post(
        "/tema",
        json={"asignatura_id": first["id"], "name": "Huerfano", "parent_id": 999999},
    )
    assert missing.status_code == 404

    crossed = client.post(
        "/tema",
        json={
            "asignatura_id": first["id"],
            "name": "Cruzado",
            "parent_id": foreign["id"],
        },
    )
    assert crossed.status_code == 400
    assert "misma asignatura" in crossed.json()["detail"]

    client.delete(f"/asignatura/{first['id']}")
    client.delete(f"/asignatura/{second['id']}")


def test_cannot_create_cycles(client: TestClient) -> None:
    """Un tema no puede ser su propio padre ni colgar de un descendiente."""
    subject = _subject(client, "__test_tree_ciclos__")
    root = client.post(
        "/tema", json={"asignatura_id": subject["id"], "name": "Raiz", "notes": ""}
    ).json()
    child = client.post(
        "/tema",
        json={
            "asignatura_id": subject["id"],
            "name": "Hijo",
            "notes": "",
            "parent_id": root["id"],
        },
    ).json()

    itself = client.put(f"/tema/{root['id']}", json={"parent_id": root["id"]})
    assert itself.status_code == 400

    loop = client.put(f"/tema/{root['id']}", json={"parent_id": child["id"]})
    assert loop.status_code == 400
    assert "hijos" in loop.json()["detail"]

    client.delete(f"/asignatura/{subject['id']}")


def test_move_to_root_and_cascade_delete(client: TestClient) -> None:
    """parent_id null devuelve el tema a la raiz; borrar el padre borra hijos."""
    subject = _subject(client, "__test_tree_mover__")
    root = client.post(
        "/tema", json={"asignatura_id": subject["id"], "name": "Raiz", "notes": ""}
    ).json()
    child = client.post(
        "/tema",
        json={
            "asignatura_id": subject["id"],
            "name": "Hijo",
            "notes": "",
            "parent_id": root["id"],
        },
    ).json()
    grandchild = client.post(
        "/tema",
        json={
            "asignatura_id": subject["id"],
            "name": "Nieto",
            "notes": "",
            "parent_id": child["id"],
        },
    ).json()

    moved = client.put(f"/tema/{child['id']}", json={"parent_id": None})
    assert moved.status_code == 200, moved.text
    assert moved.json()["parent_id"] is None

    # El nieto sigue colgando del hijo, que ahora es raiz.
    still_there = client.get(f"/tema/{grandchild['id']}")
    assert still_there.status_code == 200
    assert still_there.json()["parent_id"] == child["id"]

    deleted = client.delete(f"/tema/{child['id']}")
    assert deleted.status_code == 204
    assert client.get(f"/tema/{grandchild['id']}").status_code == 404

    client.delete(f"/asignatura/{subject['id']}")
