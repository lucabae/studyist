import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createFileFilesPost,
  deleteFlashcardFlashcardFlashcardIdDelete,
  getFileFilesFileIdGet,
  getFlashcardFlashcardFlashcardIdGet,
  updateFlashcardFlashcardFlashcardIdPut,
} from "../../api/generated/sdk.gen";
import type {
  FileRead,
  FlashcardRead,
} from "../../api/generated/types.gen";
import { FileDropZone } from "../../components/FileDropZone";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { Field } from "../../components/ui/Field";
import { Spinner } from "../../components/ui/Spinner";
import { Textarea } from "../../components/ui/Textarea";
import { useToast } from "../../components/ui/Toast";
import { PageHeader } from "../../layout/PageHeader";
import { apiErrorMessage } from "../../lib/api";
import { formatDateTime, formatRelative } from "../../lib/format";
import { fileUrl as filePublicUrl } from "../files/fileUtils";
import { ConfirmDialog } from "./ConfirmDialog";
import { DIFFICULTY_LABELS } from "./ReviewSession";

type ImageSide = "front" | "back";

/** Parametro de ruta -> id, o null si no es un entero positivo. */
function parseId(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** URL del archivo en el mount estatico, con el token de sesion. */
function fileUrl(file: FileRead): string {
  return filePublicUrl(file.path);
}

export default function FlashcardPage() {
  const { setId: setIdParam, cardId: cardIdParam } = useParams();
  const setId = parseId(setIdParam);
  const cardId = parseId(cardIdParam);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [card, setCard] = useState<FlashcardRead | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<number, FileRead>>({});

  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [savingText, setSavingText] = useState(false);

  const [imageSide, setImageSide] = useState<ImageSide>("front");
  const [imageBusy, setImageBusy] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (cardId === null) return;

    setLoadError(null);
    try {
      const { data } = await getFlashcardFlashcardFlashcardIdGet({
        path: { flashcard_id: cardId },
        throwOnError: true,
      });
      setCard(data);
      setFront(data.front);
      setBack(data.back);

      // Las imagenes solo se referencian por id: se resuelven aparte, sin
      // bloquear la ficha si alguna ya no existe.
      const imageIds = [data.front_img_id, data.back_img_id].filter(
        (id): id is number => typeof id === "number",
      );
      if (imageIds.length === 0) return;

      const loaded = await Promise.all(
        imageIds.map((id) =>
          getFileFilesFileIdGet({ path: { file_id: id }, throwOnError: true })
            .then(({ data: file }) => file)
            .catch(() => null),
        ),
      );
      setFiles((current) => {
        const next = { ...current };
        loaded.forEach((file) => {
          if (file) next[file.id] = file;
        });
        return next;
      });
    } catch (error) {
      setLoadError(apiErrorMessage(error));
    }
  }, [cardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!card) return false;
    return front !== card.front || back !== card.back;
  }, [back, card, front]);

  const saveText = async () => {
    if (!card || savingText || !dirty) return;
    const frontText = front.trim();
    const backText = back.trim();
    if (!frontText || !backText) return;

    setSavingText(true);
    try {
      const { data } = await updateFlashcardFlashcardFlashcardIdPut({
        path: { flashcard_id: card.id },
        body: { front: frontText, back: backText },
        throwOnError: true,
      });
      setCard(data);
      setFront(data.front);
      setBack(data.back);
      toast("Tarjeta guardada.", "success");
    } catch (error) {
      toast(apiErrorMessage(error), "error");
    } finally {
      setSavingText(false);
    }
  };

  /** Asigna (o quita, con null) la imagen de un lado. */
  const assignImage = async (side: ImageSide, fileId: number | null) => {
    if (!card) return;

    setImageBusy(true);
    try {
      const { data } = await updateFlashcardFlashcardFlashcardIdPut({
        path: { flashcard_id: card.id },
        body: side === "front" ? { front_img_id: fileId } : { back_img_id: fileId },
        throwOnError: true,
      });
      setCard(data);
      toast(fileId === null ? "Imagen quitada." : "Imagen añadida.", "success");
    } catch (error) {
      toast(apiErrorMessage(error), "error");
    } finally {
      setImageBusy(false);
    }
  };

  const uploadImage = async (selected: File[]) => {
    const file = selected[0];
    if (!file || imageBusy) return;

    setImageBusy(true);
    try {
      const { data: uploaded } = await createFileFilesPost({
        body: { upload: file },
        throwOnError: true,
      });
      setFiles((current) => ({ ...current, [uploaded.id]: uploaded }));
      await assignImage(imageSide, uploaded.id);
    } catch (error) {
      toast(apiErrorMessage(error), "error");
    } finally {
      setImageBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!card || deleting) return;

    setDeleting(true);
    try {
      await deleteFlashcardFlashcardFlashcardIdDelete({
        path: { flashcard_id: card.id },
        throwOnError: true,
      });
      toast("Tarjeta borrada.", "success");
      navigate(setId === null ? "/flashcards" : `/flashcards/${setId}`);
    } catch (error) {
      toast(apiErrorMessage(error), "error");
      setDeleting(false);
    }
  };

  if (cardId === null) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-8 sm:px-6">
        <p role="alert" className="text-[13px] text-onyx-inkMuted">
          La tarjeta que buscas no existe.
        </p>
        <Button to="/flashcards" variant="secondary" className="mt-4">
          Volver a Flashcards
        </Button>
      </div>
    );
  }

  const backToSet = setId === null ? "/flashcards" : `/flashcards/${setId}`;
  const frontFile = card?.front_img_id != null ? files[card.front_img_id] : undefined;
  const backFile = card?.back_img_id != null ? files[card.back_img_id] : undefined;
  const currentFile = imageSide === "front" ? frontFile : backFile;

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6 sm:py-8">
      <nav aria-label="Migas de pan" className="mb-3 flex flex-wrap items-center gap-1">
        <Link
          to="/flashcards"
          className="focus-ring rounded text-[13px] text-onyx-inkMuted transition-colors duration-150 hover:text-onyx-ink"
        >
          Flashcards
        </Link>
        <span aria-hidden className="text-[13px] text-onyx-inkFaint">
          /
        </span>
        <Link
          to={backToSet}
          className="focus-ring min-w-0 truncate rounded text-[13px] text-onyx-inkMuted transition-colors duration-150 hover:text-onyx-ink"
        >
          Set
        </Link>
      </nav>

      {loadError && (
        <>
          <p role="alert" className="text-[13px] leading-relaxed text-[#f0a8a1]">
            {loadError}
          </p>
          <Button to={backToSet} variant="secondary" className="mt-4">
            Volver al set
          </Button>
        </>
      )}

      {!card && !loadError && (
        <p className="flex items-center gap-2 text-[13px] text-onyx-inkMuted">
          <Spinner size="sm" label="Cargando la tarjeta" />
          Cargando la tarjeta…
        </p>
      )}

      {card && (
        <>
          <PageHeader
            title="Tarjeta"
            description="Edita el contenido, añade imágenes o borra la tarjeta."
            actions={
              <>
                <Button to={backToSet} variant="secondary">
                  Ver en el set
                </Button>
                <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                  Borrar
                </Button>
              </>
            }
          />

          <section aria-labelledby="content-heading" className="mt-6">
            <h2 id="content-heading" className="text-[15px] font-medium text-onyx-ink">
              Contenido
            </h2>

            <div className="mt-3 flex min-w-0 flex-col gap-4">
              <Field label="Delante">
                {({ id, invalid, ...aria }) => (
                  <Textarea
                    id={id}
                    rows={4}
                    value={front}
                    onChange={(event) => setFront(event.target.value)}
                    disabled={savingText}
                    invalid={invalid}
                    {...aria}
                  />
                )}
              </Field>

              <Field label="Detrás">
                {({ id, invalid, ...aria }) => (
                  <Textarea
                    id={id}
                    rows={4}
                    value={back}
                    onChange={(event) => setBack(event.target.value)}
                    disabled={savingText}
                    invalid={invalid}
                    {...aria}
                  />
                )}
              </Field>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => void saveText()}
                  disabled={savingText || !dirty || front.trim().length === 0 || back.trim().length === 0}
                >
                  {savingText && <Spinner size="sm" label="Guardando" />}
                  {savingText ? "Guardando…" : "Guardar cambios"}
                </Button>
                {dirty && (
                  <p className="text-[12px] text-onyx-inkFaint">Cambios sin guardar</p>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="images-heading" className="mt-8">
            <h2 id="images-heading" className="text-[15px] font-medium text-onyx-ink">
              Imágenes
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-onyx-inkMuted">
              Arrastra una imagen, haz clic para elegirla o pégala desde el portapapeles.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(["front", "back"] as ImageSide[]).map((side) => {
                const file = side === "front" ? frontFile : backFile;
                const label = side === "front" ? "Delante" : "Detrás";

                return (
                  <div
                    key={side}
                    className="min-w-0 rounded-xl border border-onyx-line bg-onyx-surface p-3"
                  >
                    <p className="text-[12px] uppercase tracking-wide text-onyx-inkFaint">
                      {label}
                    </p>

                    {file ? (
                      <>
                        <img
                          src={fileUrl(file)}
                          alt={`Imagen de ${label.toLowerCase()}`}
                          className="mt-2 max-h-48 w-full rounded-lg border border-onyx-line bg-onyx-bg object-contain"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          className="mt-2"
                          onClick={() => void assignImage(side, null)}
                          disabled={imageBusy}
                        >
                          Quitar imagen
                        </Button>
                      </>
                    ) : (
                      <p className="mt-2 text-[13px] text-onyx-inkFaint">Sin imagen</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-onyx-inkFaint">Destino:</span>
              <Chip active={imageSide === "front"} onClick={() => setImageSide("front")}>
                Delante
              </Chip>
              <Chip active={imageSide === "back"} onClick={() => setImageSide("back")}>
                Detrás
              </Chip>
            </div>

            <div className="mt-2">
              <FileDropZone
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                multiple={false}
                disabled={imageBusy}
                hint={`Se añadirá ${
                  imageSide === "front" ? "delante" : "detrás"
                }${currentFile ? " y sustituirá la actual" : ""}.`}
                onFiles={(selected) => {
                  void uploadImage(selected);
                }}
              />

              {imageBusy && (
                <p className="mt-2 flex items-center gap-1.5 text-[12px] text-onyx-inkFaint">
                  <Spinner size="sm" label="Guardando la imagen" />
                  Guardando…
                </p>
              )}
            </div>
          </section>

          <section aria-labelledby="meta-heading" className="mt-8">
            <h2 id="meta-heading" className="text-[15px] font-medium text-onyx-ink">
              Repaso
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <div className="min-w-0 rounded-xl border border-onyx-line bg-onyx-surface px-3 py-3">
                <dt className="text-[11px] uppercase tracking-wide text-onyx-inkFaint">
                  Dificultad
                </dt>
                <dd className="mt-1 text-[14px] text-onyx-ink">
                  {DIFFICULTY_LABELS[card.difficulty]}
                </dd>
              </div>
              <div className="min-w-0 rounded-xl border border-onyx-line bg-onyx-surface px-3 py-3">
                <dt className="text-[11px] uppercase tracking-wide text-onyx-inkFaint">
                  Última vez
                </dt>
                <dd className="mt-1 text-[14px] text-onyx-ink">
                  {card.last_seen ? (
                    <time dateTime={card.last_seen} title={formatDateTime(card.last_seen)}>
                      {formatRelative(card.last_seen)}
                    </time>
                  ) : (
                    "Nunca vista"
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <ConfirmDialog
            open={deleteOpen}
            title="Borrar tarjeta"
            description="Se borrará esta tarjeta y volverás al set."
            busy={deleting}
            onCancel={() => setDeleteOpen(false)}
            onConfirm={() => void confirmDelete()}
          />
        </>
      )}
    </div>
  );
}
