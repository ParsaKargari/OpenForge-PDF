import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";

type CompressStage = "idle" | "loading" | "compressing" | "done" | "error";

interface CompressProfile {
  id: string;
  name: string;
  description: string;
  dpi: number;
  quality: number;
}

const PROFILES: CompressProfile[] = [
  {
    id: "screen",
    name: "Screen",
    description: "Smallest size, ideal for email & web sharing",
    dpi: 72,
    quality: 0.45,
  },
  {
    id: "ebook",
    name: "eBook",
    description: "Balanced quality for digital reading",
    dpi: 96,
    quality: 0.65,
  },
  {
    id: "printer",
    name: "Printer",
    description: "Good quality for standard printing",
    dpi: 150,
    quality: 0.82,
  },
  {
    id: "prepress",
    name: "Prepress",
    description: "High quality, minimal compression",
    dpi: 200,
    quality: 0.92,
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function normaliseDownloadName(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (!trimmed.toLowerCase().endsWith(".pdf")) return `${trimmed}.pdf`;
  return trimmed;
}

export function CompressPdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<CompressStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("ebook");
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [outputFileName, setOutputFileName] = useState<string>("");
  const [resultBlobUrl, setResultBlobUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number>(0);
  const [compressedSize, setCompressedSize] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [estimates, setEstimates] = useState<Record<string, number>>({});
  const [estimating, setEstimating] = useState(false);
  const estimateTokenRef = useRef(0);

  const selectedProfile =
    PROFILES.find((p) => p.id === selectedProfileId) ?? PROFILES[1];
  const isBusy = stage === "loading" || stage === "compressing";
  const canCompress = file !== null && !isBusy;

  const recommendedProfile = useMemo(() => {
    // If we haven't estimated yet, 'eBook' is the logically recommended default
    // for a good balance of quality and size reduction.
    if (Object.keys(estimates).length === 0) return "ebook";

    // Once we have estimates, strongly prefer 'ebook' if it reduces size at all
    if ((estimates["ebook"] ?? -100) > 5) return "ebook";
    
    // Fallback to 'screen' if ebook doesn't help but screen does
    if ((estimates["screen"] ?? -100) > 5) return "screen";
    
    // If nothing reduces it much, don't show a recommendation
    return null;
  }, [estimates]);

  function resetState() {
    estimateTokenRef.current += 1;
    setFile(null);
    setStage("idle");
    setError(null);
    setProgress(null);
    setOutputFileName("");
    if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
    setResultBlobUrl(null);
    setOriginalSize(0);
    setCompressedSize(0);
    setEstimates({});
    setEstimating(false);
  }

  function handleFileSelect(selected: FileList | null) {
    if (!selected || selected.length === 0) return;
    const f = selected[0];
    if (f.type !== "application/pdf") {
      setError("Please select a valid PDF file.");
      return;
    }
    estimateTokenRef.current += 1;
    setError(null);
    setStage("idle");
    setProgress(null);
    if (resultBlobUrl) {
      URL.revokeObjectURL(resultBlobUrl);
      setResultBlobUrl(null);
    }
    setEstimates({});
    setEstimating(false);
    setFile(f);
    setOriginalSize(f.size);
    const base = f.name.replace(/\.pdf$/i, "");
    setOutputFileName(`${base}-compressed.pdf`);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFileSelect(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    handleFileSelect(event.dataTransfer?.files ?? null);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
  }

  async function estimateReduction(f: File) {
    const token = ++estimateTokenRef.current;
    setEstimating(true);
    setEstimates({});

    try {
      const pdfjsLib = await import("pdfjs-dist");
      const workerSrcModule = await import("pdfjs-dist/build/pdf.worker?url");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pdfjsLib as any).GlobalWorkerOptions.workerSrc =
        workerSrcModule.default;

      const arrayBuffer = await f.arrayBuffer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loadingTask = (pdfjsLib as any).getDocument({ data: arrayBuffer });
      const srcDoc = await loadingTask.promise;

      const numPages: number = srcDoc.numPages;
      if (numPages === 0 || f.size === 0) {
        if (estimateTokenRef.current === token) {
          setEstimates({});
        }
        srcDoc.cleanup();
        srcDoc.destroy();
        return;
      }

      const sampleCount = Math.min(3, numPages);
      const samplePages: number[] = [];
      const step = numPages / sampleCount;
      for (let i = 0; i < sampleCount; i++) {
        const pageIndex = Math.floor(i * step) + 1;
        if (!samplePages.includes(pageIndex)) samplePages.push(pageIndex);
      }

      const profileTotals: Record<string, number> = {};
      for (const p of PROFILES) profileTotals[p.id] = 0;

      for (const pageNum of samplePages) {
        if (estimateTokenRef.current !== token) break;
        const page = await srcDoc.getPage(pageNum);

        for (const profile of PROFILES) {
          if (estimateTokenRef.current !== token) break;
          const scale = profile.dpi / 72;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;

          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) => {
                if (b) resolve(b);
                else reject(new Error("canvas.toBlob returned null"));
              },
              "image/jpeg",
              profile.quality,
            );
          });

          profileTotals[profile.id] += blob.size;
        }
        page.cleanup();
      }

      srcDoc.cleanup();
      srcDoc.destroy();

      if (estimateTokenRef.current === token) {
        const finalEstimates: Record<string, number> = {};
        for (const profile of PROFILES) {
          const avgPerPage = profileTotals[profile.id] / samplePages.length;
          const estimatedTotal = avgPerPage * numPages;
          finalEstimates[profile.id] = Math.round(
            (1 - estimatedTotal / f.size) * 100,
          );
        }
        setEstimates(finalEstimates);
      }
    } catch (err) {
      console.error("Failed to estimate compression", err);
      if (estimateTokenRef.current === token) {
        setEstimates({});
      }
    } finally {
      if (estimateTokenRef.current === token) {
        setEstimating(false);
      }
    }
  }

  useEffect(() => {
    if (!file) {
      setEstimates({});
      setEstimating(false);
      return;
    }

    void estimateReduction(file);
  }, [file]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canCompress || !file) return;

    setError(null);
    setStage("loading");
    setProgress(null);
    if (resultBlobUrl) {
      URL.revokeObjectURL(resultBlobUrl);
      setResultBlobUrl(null);
    }

    try {
      const pdfjsLib = await import("pdfjs-dist");
      const workerSrcModule = await import("pdfjs-dist/build/pdf.worker?url");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pdfjsLib as any).GlobalWorkerOptions.workerSrc =
        workerSrcModule.default;

      const arrayBuffer = await file.arrayBuffer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loadingTask = (pdfjsLib as any).getDocument({ data: arrayBuffer });
      const srcDoc = await loadingTask.promise;

      const numPages: number = srcDoc.numPages;
      setProgress({ current: 0, total: numPages });
      setStage("compressing");

      const { PDFDocument } = await import("pdf-lib");
      const outDoc = await PDFDocument.create();

      const { dpi, quality } = selectedProfile;
      const scale = dpi / 72;

      for (let i = 1; i <= numPages; i++) {
        setProgress({ current: i - 1, total: numPages });

        const page = await srcDoc.getPage(i);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not get canvas 2D context");

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => {
              if (b) resolve(b);
              else reject(new Error("canvas.toBlob returned null"));
            },
            "image/jpeg",
            quality,
          );
        });

        const jpegBytes = await blob.arrayBuffer();

        // Preserve original physical page dimensions (in PDF points = pixels / scale)
        const pageWidthPt = canvas.width / scale;
        const pageHeightPt = canvas.height / scale;

        const jpegImage = await outDoc.embedJpg(jpegBytes);
        const outPage = outDoc.addPage([pageWidthPt, pageHeightPt]);
        outPage.drawImage(jpegImage, {
          x: 0,
          y: 0,
          width: pageWidthPt,
          height: pageHeightPt,
        });

        page.cleanup();
        setProgress({ current: i, total: numPages });
      }

      srcDoc.cleanup();
      srcDoc.destroy();

      const savedBytes = await outDoc.save();
      const outBlob = new Blob([savedBytes as BlobPart], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(outBlob);
      setCompressedSize(outBlob.size);
      setResultBlobUrl(url);
      setStage("done");

      const filename = normaliseDownloadName(outputFileName, "compressed.pdf");
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
        "Something went wrong while compressing. The PDF may be encrypted, corrupted, or use unsupported features.",
      );
    }
  }

  const downloadName = normaliseDownloadName(outputFileName, "compressed.pdf");
  const reductionPct =
    originalSize > 0 && compressedSize > 0
      ? Math.round((1 - compressedSize / originalSize) * 100)
      : 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="merge-tool compress-tool"
      aria-label="Compress PDF"
    >
      {!file ? (
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
              <span className="merge-tool__hint">
                Drop a PDF here or browse
              </span>
            </div>
            <p className="merge-tool__summary">Single PDF file, any size.</p>
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
          </div>
        </div>
      ) : (
        <div className="compress-tool__file-card">
          <div className="compress-tool__file-card-left">
            <div className="compress-tool__file-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div className="compress-tool__file-info">
              <span className="compress-tool__file-name">{file.name}</span>
              <span className="compress-tool__file-size">{formatBytes(file.size)}</span>
            </div>
          </div>
          <button
            type="button"
            className="merge-tool__button merge-tool__button--subtle"
            onClick={(e) => {
              e.preventDefault();
              inputRef.current?.click();
            }}
            disabled={isBusy}
          >
            Change file
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        onChange={handleInputChange}
        style={{ display: "none" }}
      />

      <div className="compress-tool__profiles-section">
        <div className="compress-tool__profiles-label">Compression level</div>
        <div className="compress-tool__profiles">
          {PROFILES.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className={
                "compress-tool__profile-card" +
                (selectedProfileId === profile.id
                  ? " compress-tool__profile-card--active"
                  : "")
              }
              onClick={() => setSelectedProfileId(profile.id)}
              disabled={isBusy}
            >
              <div className="compress-tool__profile-header">
                <span className="compress-tool__profile-name">
                  {profile.name}
                </span>
                {recommendedProfile === profile.id && (
                  <span className="compress-tool__profile-badge">Recommended</span>
                )}
              </div>
              <span className="compress-tool__profile-desc">
                {profile.description}
              </span>
              <span className="compress-tool__profile-meta">
                {profile.dpi} DPI &middot; Q{Math.round(profile.quality * 100)}
              </span>
              {file && (
                <span className="compress-tool__profile-est">
                  {estimating
                    ? "Estimating…"
                    : estimates[profile.id] !== undefined
                      ? estimates[profile.id]! > 0
                        ? `Estimated −${estimates[profile.id]}%`
                        : `Estimated +${Math.abs(estimates[profile.id]!)}%`
                      : "No estimate"}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {isBusy && (
        <div className="compress-tool__progress-wrap">
          {stage === "loading" ? (
            <span className="compress-tool__progress-label">
              Loading PDF…
            </span>
          ) : progress ? (
            <>
              <div className="compress-tool__progress-header">
                <span className="compress-tool__progress-label">
                  Compressing page {progress.current} of {progress.total}
                </span>
                <span className="compress-tool__progress-pct">
                  {Math.round((progress.current / progress.total) * 100)}%
                </span>
              </div>
              <div className="compress-tool__progress-bar-track">
                <div
                  className="compress-tool__progress-bar-fill"
                  style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                  }}
                />
              </div>
            </>
          ) : null}
        </div>
      )}

      {stage === "done" && (
        <div className="compress-tool__stats">
          <div className="compress-tool__stat">
            <span className="compress-tool__stat-label">Original</span>
            <span className="compress-tool__stat-value">
              {formatBytes(originalSize)}
            </span>
          </div>
          <div className="compress-tool__stat-arrow" aria-hidden="true">
            →
          </div>
          <div className="compress-tool__stat">
            <span className="compress-tool__stat-label">Compressed</span>
            <span className="compress-tool__stat-value">
              {formatBytes(compressedSize)}
            </span>
          </div>
          {reductionPct > 0 ? (
            <span className="compress-tool__stat-badge compress-tool__stat-badge--good">
              &minus;{reductionPct}%
            </span>
          ) : (
            <span className="compress-tool__stat-badge compress-tool__stat-badge--neutral">
              +{Math.abs(reductionPct)}%
            </span>
          )}
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
            htmlFor="compress-filename"
          >
            Output file name
          </label>
          <input
            id="compress-filename"
            type="text"
            className="merge-tool__filename-input"
            value={outputFileName}
            onChange={(e) => setOutputFileName(e.target.value)}
            placeholder="compressed.pdf"
            disabled={isBusy}
          />
        </div>

        <div className="merge-tool__status">
          {isBusy && (
            <>
              <span className="merge-tool__spinner" aria-hidden="true" />
              <span>
                {stage === "loading"
                  ? "Loading PDF…"
                  : progress
                    ? `Page ${progress.current} / ${progress.total}`
                    : "Compressing…"}
              </span>
            </>
          )}
          {stage === "done" && !error && (
            <span className="merge-tool__status-text">
              Compressed successfully. Ready to download.
            </span>
          )}
          {stage === "idle" && !file && (
            <span className="merge-tool__status-text">
              Upload a PDF to get started.
            </span>
          )}
        </div>

        <div className="merge-tool__actions">
          {resultBlobUrl && (
            <a
              href={resultBlobUrl}
              download={downloadName}
              className="merge-tool__button merge-tool__button--ghost"
            >
              Download {downloadName}
            </a>
          )}
          <button
            type="submit"
            className="merge-tool__button"
            disabled={!canCompress}
          >
            {isBusy ? "Compressing…" : "Compress PDF"}
          </button>
          {file && (
            <button
              type="button"
              className="merge-tool__button merge-tool__button--subtle"
              onClick={resetState}
              disabled={isBusy}
            >
              Start over
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
