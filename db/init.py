"""Crea el esquema SQLite del proyecto.

No es un sistema de migraciones. Cada vez que se anada o modifique una tabla
o una columna, se ejecuta este archivo (es idempotente gracias a
CREATE TABLE IF NOT EXISTS) y, si la tabla ya existia con datos, se escribe un
script puntual en /db/temp y se aplica a mano.

Uso: python db/init.py
"""

import sqlite3
from pathlib import Path

# Ruta absoluta para que funcione sin importar el cwd desde el que se lance.
DB_PATH = Path(__file__).resolve().parent / "db.sqlite3"

# Una sentencia por tabla. El orden importa: primero las tablas sin FK y
# despues las que las referencian.
SCHEMA: list[str] = [
    # Asignatura: nombre unico, curso y semestre.
    """
    CREATE TABLE IF NOT EXISTS asignatura (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        name     TEXT    NOT NULL UNIQUE,
        year     INTEGER NOT NULL,
        semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
        color    TEXT    NOT NULL
    )
    """,
    # Evento: examen o tarea. "uid" lo asigna CalDAV al crear el evento remoto
    # y es lo que permite borrarlo despues; puede ser NULL si CalDAV fallo.
    # "calendar_url" es la URL del VEVENT en iCloud para el boton "abrir en
    # iCloud": NULL si CalDAV fallo o no esta configurado.
    # "fecha" se guarda como ISO-8601 con offset ("2026-11-05T09:00:00+01:00")
    # en hora de Madrid: SQLite no tiene tipo fecha y asi no se pierde el
    # offset en el cambio de hora. El TypeDecorator MadridDateTime de db.py es
    # quien hace la conversion.
    """
    CREATE TABLE IF NOT EXISTS evento (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        type             TEXT    NOT NULL CHECK (type IN ('Examen', 'Tarea')),
        asignatura_id    INTEGER NOT NULL REFERENCES asignatura(id) ON DELETE CASCADE,
        tema_id          INTEGER REFERENCES tema(id) ON DELETE SET NULL,
        name             TEXT    NOT NULL,
        fecha            TEXT    NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 120,
        uid              TEXT    UNIQUE,
        calendar_url     TEXT
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_evento_tema ON evento(tema_id)
    """,
    # Chat: enlaces a conversaciones de Gemini/Claude/Notebook LLM de un evento.
    """
    CREATE TABLE IF NOT EXISTS chat (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        evento_id INTEGER NOT NULL REFERENCES evento(id) ON DELETE CASCADE,
        name      TEXT    NOT NULL,
        url       TEXT    NOT NULL
    )
    """,
    # File: cualquier documento guardado bajo /files.
    # "hash" es sha256 del contenido y sirve para detectar subidas duplicadas.
    """
    CREATE TABLE IF NOT EXISTS file (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        name      TEXT    NOT NULL,
        type      TEXT    NOT NULL,
        kind      TEXT    NOT NULL DEFAULT 'otros',
        path      TEXT    NOT NULL UNIQUE,
        size      INTEGER NOT NULL,
        thumbnail TEXT,
        hash      TEXT    NOT NULL UNIQUE
    )
    """,
    # Tema: pertenece a una asignatura. Los files y los sets van en tablas
    # intermedias porque son ManyToMany. parent_id apunta a otro tema de la
    # misma asignatura (NULL = raiz); al borrar el padre caen sus hijos.
    """
    CREATE TABLE IF NOT EXISTS tema (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        asignatura_id INTEGER NOT NULL REFERENCES asignatura(id) ON DELETE CASCADE,
        parent_id     INTEGER REFERENCES tema(id) ON DELETE CASCADE,
        name          TEXT    NOT NULL,
        notes         TEXT
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_tema_parent ON tema(parent_id)
    """,
    """
    CREATE TABLE IF NOT EXISTS tema_file (
        tema_id INTEGER NOT NULL REFERENCES tema(id) ON DELETE CASCADE,
        file_id INTEGER NOT NULL REFERENCES file(id) ON DELETE CASCADE,
        PRIMARY KEY (tema_id, file_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS flashcard_set (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tema_flashcard_set (
        tema_id           INTEGER NOT NULL REFERENCES tema(id) ON DELETE CASCADE,
        flashcard_set_id  INTEGER NOT NULL REFERENCES flashcard_set(id) ON DELETE CASCADE,
        PRIMARY KEY (tema_id, flashcard_set_id)
    )
    """,
    # Flashcard: pertenece a un unico set (1:N). front_img_id / back_img_id son
    # opcionales: si se borra el file, la referencia pasa a NULL y la tarjeta
    # se conserva.
    # TODO abierto: falta definir el algoritmo de repaso (SM-2 u otro). De
    # momento solo se guarda last_seen y la dificultad reportada.
    """
    CREATE TABLE IF NOT EXISTS flashcard (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        flashcard_set_id  INTEGER NOT NULL
                          REFERENCES flashcard_set(id) ON DELETE CASCADE,
        last_seen         TEXT,
        difficulty        TEXT NOT NULL DEFAULT 'medium'
                          CHECK (difficulty IN ('hard', 'medium', 'easy')),
        front             TEXT NOT NULL,
        back              TEXT NOT NULL,
        front_img_id      INTEGER REFERENCES file(id) ON DELETE SET NULL,
        back_img_id       INTEGER REFERENCES file(id) ON DELETE SET NULL
    )
    """,
    # Chat interno: un hilo global (file_id NULL) y uno por archivo. El UNIQUE
    # es parcial para permitir varios hilos sin archivo y solo uno por archivo.
    """
    CREATE TABLE IF NOT EXISTS chat_thread (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id    INTEGER REFERENCES file(id) ON DELETE CASCADE,
        created_at TEXT    NOT NULL,
        updated_at TEXT    NOT NULL
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_thread_file
        ON chat_thread(file_id) WHERE file_id IS NOT NULL
    """,
    # Un solo hilo global: indice unico parcial sobre la expresion constante
    # para que dos peticiones simultaneas no creen dos hilos con file_id NULL.
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_thread_global
        ON chat_thread((file_id IS NULL)) WHERE file_id IS NULL
    """,
    # Mensajes del hilo: role solo admite user/assistant. "model" queda NULL en
    # los mensajes del usuario.
    """
    CREATE TABLE IF NOT EXISTS chat_message (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id  INTEGER NOT NULL REFERENCES chat_thread(id) ON DELETE CASCADE,
        role       TEXT    NOT NULL CHECK (role IN ('user', 'assistant')),
        content    TEXT    NOT NULL,
        model      TEXT,
        created_at TEXT    NOT NULL
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_chat_message_thread
        ON chat_message(thread_id, id)
    """,
    # Indice de busqueda de texto completo de los archivos. "content" lo
    # rellena la aplicacion al subir (texto plano o extraido del PDF); el
    # trigger de INSERT lo deja vacio y luego se actualiza con un UPDATE.
    """
    CREATE VIRTUAL TABLE IF NOT EXISTS file_fts USING fts5(
        name,
        content,
        tokenize = 'unicode61 remove_diacritics 2'
    )
    """,
    # Triggers que mantienen file_fts sincronizado con la tabla file.
    """
    CREATE TRIGGER IF NOT EXISTS file_fts_insert AFTER INSERT ON file BEGIN
      INSERT INTO file_fts(rowid, name, content) VALUES (new.id, new.name, '');
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS file_fts_delete AFTER DELETE ON file BEGIN
      DELETE FROM file_fts WHERE rowid = old.id;
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS file_fts_update AFTER UPDATE OF name ON file BEGIN
      UPDATE file_fts SET name = new.name WHERE rowid = new.id;
    END
    """,
]


def connect(db_path: Path = DB_PATH) -> sqlite3.Connection:
    """Abre la conexion SQLite.

    Pasos: crear la conexion a db_path, activar PRAGMA foreign_keys = ON
    (SQLite lo trae desactivado por defecto y sin esto los ON DELETE CASCADE /
    SET NULL no se aplican), y devolver la conexion.
    """
    connection = sqlite3.connect(db_path)
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def create_tables(connection: sqlite3.Connection) -> None:
    """Ejecuta el esquema.

    Pasos: bucle for sobre SCHEMA ejecutando cada sentencia con
    connection.execute, y al final connection.commit.
    """
    for statement in SCHEMA:
        connection.execute(statement)
    connection.commit()


def main() -> None:
    """Punto de entrada del script.

    Pasos: llamar a connect(), luego a create_tables(), imprimir la ruta de la
    base de datos creada y cerrar la conexion.
    """
    connection = connect()
    try:
        create_tables(connection)
        print(f"Esquema aplicado en {DB_PATH}")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
