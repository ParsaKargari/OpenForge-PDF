import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type ReorganizeStage = "idle" | "loading" | "reordering" | "done" | "error";

const THUMBNAIL_ZOOM_STEPS = [0.6, 0.8, 1, 1.25, 1.5, 1.75, 2];

function SortablePageCard({
  id,
  listIndex,
  originalIndex,
  thumbnails,
  onRemove,
  canRemove,
  disabled,
}: {
  id: number;
  listIndex: number;
  originalIndex: number;
  thumbnails: (string | null)[];
  onRemove: (listIndex: number) => void;
  canRemove: boolean;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={
        "reorganize-tool__page-card" +
        (isDragging ? " reorganize-tool__page-card--dragging" : "")
      }
    >
      <div
        ref={setActivatorNodeRef}
        className="reorganize-tool__page-card-inner"
        {...attributes}
        {...listeners}
      >
        <div className="reorganize-tool__page-card-thumb">
          {thumbnails[originalIndex] ? (
            <img
              src={thumbnails[originalIndex]!}
              alt={`Page ${originalIndex + 1}`}
              draggable={false}
            />
          ) : (
            <span className="reorganize-tool__page-card-placeholder">
              Page {originalIndex + 1}
            </span>
          )}
        </div>
        <div className="reorganize-tool__page-card-footer">
          <span className="reorganize-tool__page-card-position">
            {listIndex + 1}
          </span>
        </div>
      </div>
      {canRemove && (
        <button
          type="button"
          className="reorganize-tool__page-card-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(listIndex);
          }}
          disabled={disabled}
          aria-label="Remove page"
          title="Remove page"
        >
          ✕
        </button>
      )}
    </li>
  );
}

export function ReorganizePdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [thumbnails, setThumbnails] = useState<(string | null)[]>([]);
  const [stage, setStage] = useState<ReorganizeStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [resultBlobUrl, setResultBlobUrl] = useState<string | null>(null);
  const [outputFileName, setOutputFileName] =
    useState<string>("reorganized.pdf");
  const [thumbnailZoom, setThumbnailZoom] = useLocalStorage(
    "pdf-tools-thumbnail-zoom",
    1.25,
    {
      parse: (raw) => {
        const n = Number(raw);
        if (!Number.isFinite(n)) return null;
        return THUMBNAIL_ZOOM_STEPS.includes(n) ? n : null;
      },
    },
  );
  const inputRef = useRef<HTMLInputElement | null>(null);

  const zoomIndex = THUMBNAIL_ZOOM_STEPS.indexOf(thumbnailZoom);
  const canZoomIn = zoomIndex >= 0 && zoomIndex < THUMBNAIL_ZOOM_STEPS.length - 1;
  const canZoomOut = zoomIndex > 0;

  const pageCount = pageOrder.length;
  const canApply =
    file !== null &&
    pageCount > 0 &&
    stage !== "reordering" &&
    stage !== "loading";

  function resetState() {
    setFile(null);
    setPageOrder([]);
    setThumbnails([]);
    setStage("idle");
    setError(null);
    if (resultBlobUrl) {
      URL.revokeObjectURL(resultBlobUrl);
    }
    setResultBlobUrl(null);
    setOutputFileName("reorganized.pdf");
  }

  async function handleFileSelect(selected: File | null) {
    if (!selected) return;
    if (selected.type !== "application/pdf") {
      setError("Please select a PDF file.");
      return;
    }

    setError(null);
    setStage("loading");
    setResultBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    try {
      const { PDFDocument } = await import("pdf-lib");
      const buffer = await selected.arrayBuffer();
      const doc = await PDFDocument.load(buffer);
      const count = doc.getPageCount();
      setFile(selected);
      setPageOrder(Array.from({ length: count }, (_, i) => i));
      setThumbnails(Array(count).fill(null));
      setStage("idle");
    } catch (err) {
      console.error(err);
      setStage("error");
      setError("Could not load the PDF. Try a different file.");
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    handleFileSelect(chosen ?? null);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const dropped = event.dataTransfer?.files?.[0];
    handleFileSelect(dropped ?? null);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  function handlePageDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over == null || active.id === over.id) return;
    const oldIndex = pageOrder.indexOf(active.id as number);
    const newIndex = pageOrder.indexOf(over.id as number);
    if (oldIndex === -1 || newIndex === -1) return;
    setPageOrder((current) => arrayMove(current, oldIndex, newIndex));
  }

  function removePage(listIndex: number) {
    setPageOrder((current) =>
      current.filter((_, index) => index !== listIndex),
    );
  }

  async function handleApply(event: FormEvent) {
    event.preventDefault();
    if (!canApply || !file) return;

    setError(null);
    setStage("reordering");
    setResultBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    try {
      const { PDFDocument } = await import("pdf-lib");
      const buffer = await file.arrayBuffer();
      const sourceDoc = await PDFDocument.load(buffer);
      const mergedPdf = await PDFDocument.create();
      const copiedPages = await mergedPdf.copyPages(sourceDoc, pageOrder);
      copiedPages.forEach((page) => mergedPdf.addPage(page));

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes as BlobPart], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      setResultBlobUrl(url);
      setStage("done");
      const filename = normaliseDownloadName(outputFileName);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
      setStage("error");
      setError("Something went wrong. Try a different file.");
    }
  }

  // Generate thumbnails for each page when file and pageOrder are set
  useEffect(() => {
    if (!file || pageOrder.length === 0) return;

    const fileRef = file;
    let cancelled = false;

    async function generateThumbnails() {
      try {
        // Use legacy build for better Vite/browser compatibility
        const pdfjsLib = await import(
          "pdfjs-dist/legacy/build/pdf.mjs"
        );
        const workerModule = await import(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"
        );
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;

        const arrayBuffer = await fileRef.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          useSystemFonts: false,
        });
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;

        for (let i = 0; i < numPages; i++) {
          if (cancelled) return;
          try {
            const page = await pdf.getPage(i + 1);
            const viewport = page.getViewport({ scale: 0.6 });

            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Could not get canvas context");
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            const renderTask = page.render({
              canvasContext: context,
              viewport,
              canvas,
            });
            await renderTask.promise;
            const dataUrl = canvas.toDataURL("image/png");

            page.cleanup();

            if (cancelled) return;

            setThumbnails((prev) => {
              const next = [...prev];
              next[i] = dataUrl;
              return next;
            });
          } catch (thumbnailError) {
            console.error(
              "Failed to generate thumbnail for page",
              i + 1,
              thumbnailError,
            );
            if (cancelled) return;
            setThumbnails((prev) => {
              const next = [...prev];
              next[i] = null;
              return next;
            });
          }
        }

        pdf.destroy();
      } catch (err) {
        console.error("Failed to initialise PDF.js", err);
        // Fallback: try without worker (main-thread parsing)
        try {
          const pdfjsLib = await import(
            "pdfjs-dist/legacy/build/pdf.mjs"
          );
          pdfjsLib.GlobalWorkerOptions.workerSrc = "";

          const arrayBuffer = await fileRef.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer,
            useSystemFonts: false,
          });
          const pdf = await loadingTask.promise;
          const numPages = pdf.numPages;

          for (let i = 0; i < numPages; i++) {
            if (cancelled) return;
            try {
              const page = await pdf.getPage(i + 1);
              const viewport = page.getViewport({ scale: 0.6 });
              const canvas = document.createElement("canvas");
              const context = canvas.getContext("2d");
              if (!context) throw new Error("Could not get canvas context");
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              context.fillStyle = "#ffffff";
              context.fillRect(0, 0, canvas.width, canvas.height);
              await page.render({
                canvasContext: context,
                viewport,
                canvas,
              }).promise;
              const dataUrl = canvas.toDataURL("image/png");
              page.cleanup();
              if (cancelled) return;
              setThumbnails((prev) => {
                const next = [...prev];
                next[i] = dataUrl;
                return next;
              });
            } catch {
              if (cancelled) return;
              setThumbnails((prev) => {
                const next = [...prev];
                next[i] = null;
                return next;
              });
            }
          }
          pdf.destroy();
        } catch (fallbackErr) {
          console.error("PDF.js fallback also failed", fallbackErr);
        }
      }
    }

    generateThumbnails();

    return () => {
      cancelled = true;
    };
  }, [file, pageOrder.length]);

  function normaliseDownloadName(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "reorganized.pdf";
    if (!trimmed.toLowerCase().endsWith(".pdf")) return `${trimmed}.pdf`;
    return trimmed;
  }

  return (
    <form
      onSubmit={handleApply}
      className="reorganize-tool merge-tool"
      aria-label="Reorganize PDF"
    >
      {!file && (
        <div
          className="merge-tool__dropzone"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
        >
          <div className="merge-tool__dropzone-inner">
            <div className="merge-tool__icon-row">
              <span className="merge-tool__icon-stack">
                <span className="merge-tool__icon-layer" />
                <span className="merge-tool__icon-layer merge-tool__icon-layer--top" />
              </span>
              <span className="merge-tool__hint">Drop a PDF here or browse</span>
            </div>
            <p className="merge-tool__summary">Single PDF only.</p>
            <button
              type="button"
              className="merge-tool__browse"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              Choose file
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              onChange={handleInputChange}
              style={{ display: "none" }}
            />
          </div>
        </div>
      )}

      {file && pageCount > 0 && (
        <div
          className="merge-tool__files reorganize-tool__pages"
          aria-label="Page order"
        >
          <div className="merge-tool__files-header reorganize-tool__page-header">
            <span>Page order</span>
            <span className="merge-tool__files-meta">{pageCount} pages</span>
            <div className="reorganize-tool__zoom">
              <button
                type="button"
                className="reorganize-tool__zoom-btn"
                onClick={() =>
                  setThumbnailZoom((z) => {
                    const i = THUMBNAIL_ZOOM_STEPS.indexOf(z);
                    return i > 0 ? THUMBNAIL_ZOOM_STEPS[i - 1]! : z;
                  })
                }
                disabled={!canZoomOut}
                aria-label="Zoom out"
                title="Zoom out"
              >
                −
              </button>
              <span className="reorganize-tool__zoom-label">
                {Math.round(thumbnailZoom * 100)}%
              </span>
              <button
                type="button"
                className="reorganize-tool__zoom-btn"
                onClick={() =>
                  setThumbnailZoom((z) => {
                    const i = THUMBNAIL_ZOOM_STEPS.indexOf(z);
                    return i >= 0 && i < THUMBNAIL_ZOOM_STEPS.length - 1
                      ? THUMBNAIL_ZOOM_STEPS[i + 1]!
                      : z;
                  })
                }
                disabled={!canZoomIn}
                aria-label="Zoom in"
                title="Zoom in"
              >
                +
              </button>
            </div>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handlePageDragEnd}
            modifiers={[restrictToParentElement]}
          >
            <ul
              className="reorganize-tool__page-grid"
              style={
                {
                  "--thumb-width": `${Math.round(96 * thumbnailZoom)}px`,
                  "--thumb-height": `${Math.round(128 * thumbnailZoom)}px`,
                } as React.CSSProperties
              }
            >
              <SortableContext
                items={pageOrder}
                strategy={rectSortingStrategy}
                disabled={stage === "reordering"}
              >
                {pageOrder.map((originalIndex, listIndex) => (
                  <SortablePageCard
                    key={originalIndex}
                    id={originalIndex}
                    listIndex={listIndex}
                    originalIndex={originalIndex}
                    thumbnails={thumbnails}
                    onRemove={removePage}
                    canRemove={pageOrder.length > 1}
                    disabled={stage === "reordering"}
                  />
                ))}
              </SortableContext>
            </ul>
          </DndContext>
        </div>
      )}

      {error && (
        <div
          className="merge-tool__message merge-tool__message--error"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="merge-tool__footer">
        <div className="merge-tool__filename">
          <label
            className="merge-tool__filename-label"
            htmlFor="reorganized-filename"
          >
            Output file name
          </label>
          <input
            id="reorganized-filename"
            type="text"
            className="merge-tool__filename-input"
            value={outputFileName}
            onChange={(e) => setOutputFileName(e.target.value)}
            placeholder="reorganized.pdf"
            disabled={stage === "reordering"}
          />
        </div>
        <div className="merge-tool__status">
          {stage === "reordering" && (
            <>
              <span className="merge-tool__spinner" aria-hidden="true" />
              <span>Reordering pages…</span>
            </>
          )}
          {stage === "loading" && (
            <span className="merge-tool__status-text">Loading PDF…</span>
          )}
          {stage === "done" && !error && (
            <span className="merge-tool__status-text">Ready to download.</span>
          )}
          {stage === "idle" && !file && (
            <span className="merge-tool__status-text">
              Add a PDF to reorder its pages.
            </span>
          )}
        </div>

        <div className="merge-tool__actions">
          {resultBlobUrl ? (
            <>
              <a
                href={resultBlobUrl}
                download={normaliseDownloadName(outputFileName)}
                className="merge-tool__button"
              >
                Download {normaliseDownloadName(outputFileName)}
              </a>
              <button
                type="button"
                className="merge-tool__button merge-tool__button--subtle"
                onClick={resetState}
              >
                Start over
              </button>
            </>
          ) : (
            <>
              <button
                type="submit"
                className="merge-tool__button"
                disabled={!canApply}
              >
                {stage === "reordering"
                  ? "Reordering…"
                  : "Download reordered PDF"}
              </button>
              {file && (
                <button
                  type="button"
                  className="merge-tool__button merge-tool__button--subtle"
                  onClick={resetState}
                  disabled={stage === "reordering"}
                >
                  Start over
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </form>
  );
}
