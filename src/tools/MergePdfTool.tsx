import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
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

type MergeStage = "idle" | "validating" | "merging" | "done" | "error";

interface MergeFile {
  id: string;
  file: File;
  thumbnailUrl?: string;
  thumbnailError?: boolean;
}

interface MergePdfToolProps {
  onStartMerge?: () => void;
  onFinishMerge?: () => void;
}

const MAX_FILE_COUNT = 12;
const MAX_TOTAL_SIZE_BYTES = 80 * 1024 * 1024; // 80 MB

function SortableFileCard({
  item,
  index,
  stage,
  onRemove,
}: {
  item: MergeFile;
  index: number;
  stage: MergeStage;
  onRemove: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: stage === "merging" });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={
        "merge-tool__file-card" +
        (isDragging ? " merge-tool__file-card--dragging" : "")
      }
    >
      <div
        ref={setActivatorNodeRef}
        className="merge-tool__file-card-inner"
        {...attributes}
        {...listeners}
      >
        <div className="merge-tool__file-card-thumb">
          {item.thumbnailUrl ? (
            <img
              src={item.thumbnailUrl}
              alt={`First page of ${item.file.name}`}
              draggable={false}
            />
          ) : item.thumbnailError ? (
            <span className="merge-tool__file-card-placeholder">
              No preview
            </span>
          ) : (
            <span className="merge-tool__file-card-placeholder">…</span>
          )}
        </div>
        <div className="merge-tool__file-card-footer">
          <span className="merge-tool__file-card-position">{index + 1}</span>
          <span className="merge-tool__file-card-name" title={item.file.name}>
            {item.file.name}
          </span>
        </div>
      </div>
      <button
        type="button"
        className="merge-tool__file-card-remove"
        onClick={() => onRemove(item.id)}
        disabled={stage === "merging"}
        aria-label="Remove file"
        title="Remove file"
      >
        ✕
      </button>
    </li>
  );
}

export function MergePdfTool({
  onStartMerge,
  onFinishMerge,
}: MergePdfToolProps) {
  const [files, setFiles] = useState<MergeFile[]>([]);
  const [stage, setStage] = useState<MergeStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mergedBlobUrl, setMergedBlobUrl] = useState<string | null>(null);
  const [mergedFileName, setMergedFileName] = useState<string>("merged.pdf");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const totalSizeBytes = useMemo(
    () => files.reduce((sum, item) => sum + item.file.size, 0),
    [files],
  );

  const hasFiles = files.length > 0;
  const canMerge =
    files.length >= 2 && stage !== "merging" && stage !== "validating";

  function resetState() {
    setFiles([]);
    setStage("idle");
    setError(null);
    if (mergedBlobUrl) {
      URL.revokeObjectURL(mergedBlobUrl);
    }
    setMergedBlobUrl(null);
    setMergedFileName("merged.pdf");
  }

  function handleFiles(selected: FileList | null) {
    if (!selected || selected.length === 0) return;

    const incoming = Array.from(selected);
    const pdfs = incoming.filter((file) => file.type === "application/pdf");
    const rejectedCount = incoming.length - pdfs.length;

    const nextFiles: MergeFile[] = [
      ...files,
      ...pdfs.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
      })),
    ];

    if (nextFiles.length > MAX_FILE_COUNT) {
      setError(`You can add up to ${MAX_FILE_COUNT} PDF files.`);
      return;
    }

    const total = nextFiles.reduce((sum, item) => sum + item.file.size, 0);
    if (total > MAX_TOTAL_SIZE_BYTES) {
      setError(
        "These files are quite large. Try fewer or smaller PDFs (max ~80 MB total).",
      );
      return;
    }

    setError(
      rejectedCount > 0
        ? `${rejectedCount} item(s) were skipped because they are not PDF files.`
        : null,
    );
    setFiles(nextFiles);
    setStage("idle");
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFiles(event.target.files);
    // Reset input value so selecting the same file again still triggers change
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    handleFiles(event.dataTransfer?.files ?? null);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
  }

  function removeFile(id: string) {
    setFiles((current) => current.filter((item) => item.id !== id));
    setError(null);
    setStage("idle");
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  function handleFileDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over == null || active.id === over.id) return;
    const oldIndex = files.findIndex((f) => f.id === active.id);
    const newIndex = files.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setFiles((current) => arrayMove(current, oldIndex, newIndex));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canMerge) return;

    setError(null);
    setStage("validating");
    setMergedBlobUrl((existing) => {
      if (existing) URL.revokeObjectURL(existing);
      return null;
    });
    onStartMerge?.();

    try {
      setStage("merging");

      // Lazy-import pdf-lib to keep initial bundle light
      const { PDFDocument } = await import("pdf-lib");

      const mergedPdf = await PDFDocument.create();

      for (const item of files) {
        const buffer = await item.file.arrayBuffer();
        const doc = await PDFDocument.load(buffer);
        const copiedPages = await mergedPdf.copyPages(
          doc,
          doc.getPageIndices(),
        );
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes as BlobPart], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      setMergedBlobUrl(url);
      setStage("done");
      onFinishMerge?.();
      const filename = normaliseDownloadName(mergedFileName);
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
      setError(
        "Something went wrong while merging. Please try again with fewer or simpler PDFs.",
      );
    }
  }

  const summary = useMemo(() => {
    const totalMb = totalSizeBytes / (1024 * 1024);
    if (!hasFiles) return "Up to 12 PDF files, ~80 MB combined.";
    return `${files.length} PDF${files.length > 1 ? "s" : ""} • ${totalMb.toFixed(1)} MB total`;
  }, [files.length, hasFiles, totalSizeBytes]);

  useEffect(() => {
    let cancelled = false;

    async function generateThumbnails() {
      const pending = files.filter(
        (item) => !item.thumbnailUrl && !item.thumbnailError,
      );
      if (pending.length === 0) return;

      try {
        const pdfjsLib = await import("pdfjs-dist");
        const workerSrcModule = await import("pdfjs-dist/build/pdf.worker?url");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pdfjsLib as any).GlobalWorkerOptions.workerSrc =
          workerSrcModule.default;

        for (const item of pending) {
          if (cancelled) return;
          try {
            const arrayBuffer = await item.file.arrayBuffer();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const loadingTask = (pdfjsLib as any).getDocument({
              data: arrayBuffer,
            });
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 0.25 });

            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (!context) {
              throw new Error("Could not get canvas context");
            }
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: context, viewport }).promise;
            const dataUrl = canvas.toDataURL("image/png");

            pdf.cleanup();
            pdf.destroy();

            if (cancelled) return;

            setFiles((current) =>
              current.map((f) =>
                f.id === item.id
                  ? { ...f, thumbnailUrl: dataUrl, thumbnailError: false }
                  : f,
              ),
            );
          } catch (thumbnailError) {
            console.error("Failed to generate thumbnail", thumbnailError);
            if (cancelled) return;
            setFiles((current) =>
              current.map((f) =>
                f.id === item.id ? { ...f, thumbnailError: true } : f,
              ),
            );
          }
        }
      } catch (err) {
        console.error("Failed to initialise PDF.js", err);
      }
    }

    generateThumbnails();

    return () => {
      cancelled = true;
    };
  }, [files]);

  function normaliseDownloadName(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "merged.pdf";
    if (!trimmed.toLowerCase().endsWith(".pdf")) {
      return `${trimmed}.pdf`;
    }
    return trimmed;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="merge-tool"
      aria-label="Merge PDFs"
    >
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
            <span className="merge-tool__hint">Drop PDFs here or browse</span>
          </div>
          <p className="merge-tool__summary">{summary}</p>
          <button
            type="button"
            className="merge-tool__browse"
            onClick={(event) => {
              event.stopPropagation();
              inputRef.current?.click();
            }}
          >
            Choose files
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleInputChange}
            style={{ display: "none" }}
          />
        </div>
      </div>

      {hasFiles && (
        <div className="merge-tool__files" aria-label="Selected PDF files">
          <div className="merge-tool__files-header">
            <span>Order &amp; files</span>
            <span className="merge-tool__files-meta">
              {files.length} file{files.length > 1 ? "s" : ""}
            </span>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleFileDragEnd}
            modifiers={[restrictToParentElement]}
          >
            <ul className="merge-tool__file-grid">
              <SortableContext
                items={files.map((f) => f.id)}
                strategy={rectSortingStrategy}
                disabled={stage === "merging"}
              >
                {files.map((item, index) => (
                  <SortableFileCard
                    key={item.id}
                    item={item}
                    index={index}
                    stage={stage}
                    onRemove={removeFile}
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
            htmlFor="merged-filename"
          >
            Merged file name
          </label>
          <input
            id="merged-filename"
            type="text"
            className="merge-tool__filename-input"
            value={mergedFileName}
            onChange={(event) => setMergedFileName(event.target.value)}
            placeholder="merged.pdf"
            disabled={stage === "merging"}
          />
        </div>
        <div className="merge-tool__status">
          {stage === "merging" && (
            <>
              <span className="merge-tool__spinner" aria-hidden="true" />
              <span>Merging pages in your browser…</span>
            </>
          )}
          {stage === "done" && !error && (
            <span className="merge-tool__status-text">
              Merged successfully. Ready to download.
            </span>
          )}
          {stage === "idle" && !hasFiles && (
            <span className="merge-tool__status-text">
              Add at least two PDF files to enable merging.
            </span>
          )}
        </div>

        <div className="merge-tool__actions">
          {mergedBlobUrl && (
            <a
              href={mergedBlobUrl}
              download={normaliseDownloadName(mergedFileName)}
              className="merge-tool__button merge-tool__button--ghost"
            >
              Download {normaliseDownloadName(mergedFileName)}
            </a>
          )}
          <button
            type="submit"
            className="merge-tool__button"
            disabled={!canMerge}
          >
            {stage === "merging" ? "Merging…" : "Merge PDFs"}
          </button>
          {hasFiles && (
            <button
              type="button"
              className="merge-tool__button merge-tool__button--subtle"
              onClick={resetState}
              disabled={stage === "merging"}
            >
              Start over
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
