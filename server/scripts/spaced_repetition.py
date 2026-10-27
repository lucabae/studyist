"""Intervalos fijos de repaso espaciado (sin ease factor).

Regla del proyecto (PROJECT.md, seccion Flashcard System): hard vuelve al
dia siguiente, medium a los 2 y easy a los 3. Una tarjeta nunca vista toca hoy.
"""

from datetime import datetime, timedelta

from db.db import MADRID

# Dias que espera una tarjeta antes de volver a tocar, segun la dificultad que
# reporto el usuario.
INTERVAL_DAYS: dict[str, int] = {"hard": 1, "medium": 2, "easy": 3}

# Centinela para que las tarjetas nunca vistas queden antes que el resto al
# ordenar por fecha de proximo repaso.
_NEVER_SEEN = datetime.min.replace(tzinfo=MADRID)


def days_for(difficulty: str) -> int:
    """Devuelve los dias de espera de una dificultad.

    Pasos: buscar difficulty en INTERVAL_DAYS; si no esta, lanzar ValueError
    nombrando el valor recibido.
    """
    try:
        return INTERVAL_DAYS[difficulty]
    except KeyError:
        raise ValueError(f"Dificultad desconocida: {difficulty}") from None


def next_review(last_seen: datetime | None, difficulty: str) -> datetime | None:
    """Calcula cuando vuelve a tocar una tarjeta.

    Pasos: si last_seen es None, devolver None (nunca vista); pasarlo a
    Europe/Madrid (un naive se interpreta como hora de Madrid); sumarle
    timedelta(days=days_for(difficulty)).
    """
    if last_seen is None:
        return None
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=MADRID)

    return last_seen.astimezone(MADRID) + timedelta(days=days_for(difficulty))


def is_due(
    last_seen: datetime | None,
    difficulty: str,
    now: datetime | None = None,
) -> bool:
    """Dice si una tarjeta toca repasar en la sesion actual.

    Pasos: si nunca se ha visto, devolver True; resolver now (por defecto
    datetime.now(MADRID), y un naive se interpreta como hora de Madrid);
    comparar next_review(last_seen, difficulty) <= now.
    """
    if last_seen is None:
        return True
    if now is None:
        now = datetime.now(MADRID)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=MADRID)

    return next_review(last_seen, difficulty) <= now


def order_due(flashcards: list) -> list:
    """Ordena tarjetas por urgencia de repaso.

    Pasos: ordenar por la tupla (nunca vista, next_review, id), con un
    centinela para las nunca vistas, de forma que primero salgan las que no se
    han visto nunca y despues las mas atrasadas; devolver una lista nueva.
    """

    def key(flashcard) -> tuple:
        due = next_review(flashcard.last_seen, flashcard.difficulty)
        if due is None:
            return (0, _NEVER_SEEN, flashcard.id)
        return (1, due, flashcard.id)

    return sorted(flashcards, key=key)
