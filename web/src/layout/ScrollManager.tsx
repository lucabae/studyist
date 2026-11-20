import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const STORAGE_KEY = "studyist.scroll";
const MAX_ENTRIES = 100;
const LOAD_TIMEOUT_MS = 2000;
const EXTRA_HEIGHT_WAIT_MS = 300;

function readStorage(): Map<string, number> {
  const map = new Map<string, number>();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return map;
    const entries = JSON.parse(raw) as unknown;
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        if (
          Array.isArray(entry) &&
          entry.length === 2 &&
          typeof entry[0] === "string" &&
          typeof entry[1] === "number" &&
          Number.isFinite(entry[1])
        ) {
          map.set(entry[0], entry[1]);
        }
      }
    }
  } catch {
    // Ignorar errores de sessionStorage (p. ej. modo privado restringido).
  }
  return map;
}

function writeStorage(map: Map<string, number>): void {
  try {
    while (map.size > MAX_ENTRIES) {
      const oldestKey = map.keys().next().value;
      if (oldestKey === undefined) break;
      map.delete(oldestKey);
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(map.entries())));
  } catch {
    // Ignorar errores de almacenamiento.
  }
}

function isMainLoading(): boolean {
  const main = document.getElementById("contenido");
  if (!main) return true;
  return main.querySelector('[role="status"]') !== null;
}

/**
 * Mantiene y restaura la posición de scroll al volver (tanto con el botón
 * atrás del navegador como con los enlaces "Volver" con `#hash`), esperando a que
 * termine la carga asíncrona de cada página.
 */
export function ScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();

  const scrollMapRef = useRef<Map<string, number> | null>(null);
  if (scrollMapRef.current === null) {
    scrollMapRef.current = readStorage();
  }

  const routeId = `${location.key}|${location.pathname}${location.search}${location.hash}`;
  const prevRouteIdRef = useRef<string | null>(null);
  const isRestoringRef = useRef(false);

  // Bloquea sincrónicamente la captura al cambiar de ruta para que el colapso
  // temporal del DOM hacia <Spinner /> no sobrescriba con 0 la posición guardada.
  if (prevRouteIdRef.current !== null && prevRouteIdRef.current !== routeId) {
    isRestoringRef.current = true;
  }
  prevRouteIdRef.current = routeId;

  const activeRouteRef = useRef({
    key: location.key,
    path: `${location.pathname}${location.search}`,
  });

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    const saveCurrentScroll = () => {
      if (isRestoringRef.current || isMainLoading()) return;
      const map = scrollMapRef.current;
      if (!map) return;
      const y = window.scrollY;
      const { key, path } = activeRouteRef.current;
      map.delete(`key:${key}`);
      map.set(`key:${key}`, y);
      map.delete(`path:${path}`);
      map.set(`path:${path}`, y);
      writeStorage(map);
    };

    window.addEventListener("scroll", saveCurrentScroll, { passive: true });
    window.addEventListener("pointerdown", saveCurrentScroll, { capture: true });
    window.addEventListener("click", saveCurrentScroll, { capture: true });

    return () => {
      window.removeEventListener("scroll", saveCurrentScroll);
      window.removeEventListener("pointerdown", saveCurrentScroll, { capture: true });
      window.removeEventListener("click", saveCurrentScroll, { capture: true });
    };
  }, []);

  useEffect(() => {
    const currentPath = `${location.pathname}${location.search}`;
    activeRouteRef.current = { key: location.key, path: currentPath };

    const state = location.state as { restoreScroll?: boolean } | null;
    const shouldRestore =
      navigationType === "POP" ||
      Boolean(location.hash) ||
      Boolean(state?.restoreScroll);

    let cancelled = false;
    let rafId = 0;
    let observer: MutationObserver | null = null;
    let settledAt: number | null = null;
    const startedAt = performance.now();

    const release = () => {
      rafId = window.requestAnimationFrame(() => {
        if (!cancelled) isRestoringRef.current = false;
      });
    };

    if (!shouldRestore) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      release();
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(rafId);
      };
    }

    const map = scrollMapRef.current;
    const savedY =
      navigationType === "POP"
        ? (map?.get(`key:${location.key}`) ?? map?.get(`path:${currentPath}`))
        : map?.get(`path:${currentPath}`);

    let targetId = "";
    if (location.hash) {
      try {
        targetId = decodeURIComponent(location.hash.slice(1));
      } catch {
        targetId = location.hash.slice(1);
      }
    }

    const applyScroll = () => {
      if (savedY !== undefined && savedY > 0) {
        window.scrollTo({ top: savedY, behavior: "instant" as ScrollBehavior });
        if (targetId) {
          const el = document.getElementById(targetId);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.top < 0 || rect.bottom > window.innerHeight) {
              el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
            }
          }
        }
      } else if (targetId) {
        const el = document.getElementById(targetId);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (savedY === undefined || rect.top < 0 || rect.bottom > window.innerHeight) {
            el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
          }
        }
      } else if (savedY !== undefined) {
        window.scrollTo({ top: savedY, behavior: "instant" as ScrollBehavior });
      }
    };

    const isReady = (): boolean => {
      const now = performance.now();
      if (now - startedAt >= LOAD_TIMEOUT_MS) return true;
      if (isMainLoading()) return false;
      if (targetId && !document.getElementById(targetId)) return false;
      if (savedY !== undefined && savedY > 0) {
        const neededHeight = savedY + Math.min(window.innerHeight * 0.5, 200);
        if (document.documentElement.scrollHeight < neededHeight) {
          if (settledAt === null) settledAt = now;
          if (now - settledAt < EXTRA_HEIGHT_WAIT_MS) return false;
        }
      }
      return true;
    };

    const attempt = () => {
      if (cancelled) return;
      if (isReady()) {
        observer?.disconnect();
        observer = null;
        applyScroll();
        release();
        return;
      }
      rafId = window.requestAnimationFrame(attempt);
    };

    const main = document.getElementById("contenido");
    if (main) {
      observer = new MutationObserver(() => {
        if (!cancelled && isReady()) {
          observer?.disconnect();
          observer = null;
          window.cancelAnimationFrame(rafId);
          applyScroll();
          release();
        }
      });
      observer.observe(main, { childList: true, subtree: true });
    }

    attempt();

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.cancelAnimationFrame(rafId);
    };
  }, [
    location.key,
    location.pathname,
    location.search,
    location.hash,
    location.state,
    navigationType,
  ]);

  return null;
}
