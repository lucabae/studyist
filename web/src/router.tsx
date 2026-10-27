/**
 * Rutas de la aplicacion.
 *
 * Todas las paginas cuelgan de AppShell (rail en escritorio, barra inferior en
 * movil). Las rutas siguen la estructura de PROJECT.md.
 */
import { Route, Routes } from "react-router-dom";
import AppShell from "./layout/AppShell";
import ExercisePage from "./pages/exercises/ExercisePage";
import EventsPage from "./pages/events/EventsPage";
import FilePage from "./pages/files/FilePage";
import FilesPage from "./pages/files/FilesPage";
import FlashcardPage from "./pages/flashcards/FlashcardPage";
import FlashcardSetPage from "./pages/flashcards/FlashcardSetPage";
import FlashcardSetsPage from "./pages/flashcards/FlashcardSetsPage";
import HomePage from "./pages/home/HomePage";
import SubjectPage from "./pages/subjects/SubjectPage";
import SubjectsPage from "./pages/subjects/SubjectsPage";
import TopicPage from "./pages/subjects/TopicPage";

function NotFoundPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <p className="text-6xl font-semibold tracking-tight text-onyx-inkFaint">404</p>
      <h1 className="mt-4 text-2xl font-medium tracking-tight">Esta página no existe</h1>
      <p className="mt-2 text-[15px] text-onyx-inkMuted">
        Puede que el enlace esté mal o que el elemento se haya borrado.
      </p>
      <a
        href="/"
        className="mt-6 inline-flex h-10 items-center rounded-lg border border-onyx-line px-4 text-sm text-onyx-ink transition-colors hover:bg-onyx-surfaceHover"
      >
        Volver al inicio
      </a>
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/archivos" element={<FilesPage />} />
        <Route path="/archivos/:id" element={<FilePage />} />
        <Route path="/asignaturas" element={<SubjectsPage />} />
        <Route path="/asignaturas/:id" element={<SubjectPage />} />
        <Route path="/temas/:id" element={<TopicPage />} />
        <Route path="/ejercicios/:id" element={<ExercisePage />} />
        <Route path="/eventos" element={<EventsPage />} />
        <Route path="/flashcards" element={<FlashcardSetsPage />} />
        <Route path="/flashcards/:setId" element={<FlashcardSetPage />} />
        <Route
          path="/flashcards/:setId/cards/:cardId"
          element={<FlashcardPage />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
