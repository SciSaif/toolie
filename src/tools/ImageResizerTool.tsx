import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  CheckCircle2,
  Download,
  ImageUp,
  LoaderCircle,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import type { Tool } from "../data/types";
import { ToolShell } from "../components/ToolShell";
import {
  base64ToBlob,
  buildResizedFileName,
  bytesToBase64,
  formatBytes,
  loadImageFromFile,
  loadImageFromPath,
  pickImagePath,
  saveImageBlob,
  type LoadedImage,
  type SaveMode,
} from "../lib/files";
import { resizeImage } from "../lib/image";
import { isTauriApp } from "../lib/tauri";

interface ImageResizerToolProps {
  tool: Tool;
}

interface ProcessedResult {
  previewUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  quality: number;
  blob: Blob;
  filename: string;
}

export function ImageResizerTool({ tool }: ImageResizerToolProps) {
  const [selectedFile, setSelectedFile] = useState<LoadedImage | null>(null);
  const [result, setResult] = useState<ProcessedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [saveMode, setSaveMode] = useState<SaveMode>("new");

  const [maxWidth, setMaxWidth] = useState("1280");
  const [maxHeight, setMaxHeight] = useState("1280");
  const [maxSizeKb, setMaxSizeKb] = useState("200");
  const [quality, setQuality] = useState("85");

  const outputName = useMemo(() => {
    if (!selectedFile) return "resized.jpg";
    return buildResizedFileName(selectedFile.fileName);
  }, [selectedFile]);

  const canReplaceOriginal = Boolean(selectedFile?.sourcePath);

  useEffect(() => {
    if (!isTauriApp()) return;

    let unlisten: (() => void) | undefined;

    void getCurrentWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") {
          setIsDragging(true);
          return;
        }

        if (event.payload.type === "leave") {
          setIsDragging(false);
          return;
        }

        if (event.payload.type === "drop") {
          setIsDragging(false);
          const path = event.payload.paths[0];
          if (!path) return;

          void loadImageFromPath(path)
            .then((loaded) => {
              setSelectedFile(loaded);
              setResult(null);
              setError(null);
              setSuccessMessage(null);
              setSaveMode("new");
            })
            .catch((loadError) => {
              const message =
                loadError instanceof Error
                  ? loadError.message
                  : "Could not open that image.";
              setError(message);
            });
        }
      })
      .then((cleanup) => {
        unlisten = cleanup;
      });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!canReplaceOriginal && saveMode === "replace") {
      setSaveMode("new");
    }
  }, [canReplaceOriginal, saveMode]);

  const resetResult = () => {
    setResult(null);
    setSuccessMessage(null);
  };

  const handleChooseFile = async () => {
    setError(null);
    setSuccessMessage(null);

    try {
      if (isTauriApp()) {
        const path = await pickImagePath();
        if (!path) return;
        const loaded = await loadImageFromPath(path);
        setSelectedFile(loaded);
        setSaveMode("new");
        resetResult();
        return;
      }

      document.getElementById("image-resizer-file-input")?.click();
    } catch (chooseError) {
      const message =
        chooseError instanceof Error
          ? chooseError.message
          : "Could not open that image.";
      setError(message);
    }
  };

  const handleBrowserFiles = async (files: FileList | File[]) => {
    const file = files[0];
    if (!file) return;

    try {
      const loaded = await loadImageFromFile(file);
      setSelectedFile(loaded);
      setSaveMode("new");
      resetResult();
      setError(null);
      setSuccessMessage(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Could not open that image.";
      setError(message);
    }
  };

  const handleProcess = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setError(null);
    resetResult();

    try {
      const base64 = bytesToBase64(selectedFile.bytes);
      const parsedMaxWidth = maxWidth.trim() ? Number(maxWidth) : undefined;
      const parsedMaxHeight = maxHeight.trim() ? Number(maxHeight) : undefined;
      const parsedMaxSizeKb = maxSizeKb.trim() ? Number(maxSizeKb) : undefined;
      const parsedQuality = quality.trim() ? Number(quality) : undefined;

      if (
        (parsedMaxWidth !== undefined &&
          (!Number.isFinite(parsedMaxWidth) || parsedMaxWidth <= 0)) ||
        (parsedMaxHeight !== undefined &&
          (!Number.isFinite(parsedMaxHeight) || parsedMaxHeight <= 0)) ||
        (parsedMaxSizeKb !== undefined &&
          (!Number.isFinite(parsedMaxSizeKb) || parsedMaxSizeKb <= 0)) ||
        (parsedQuality !== undefined &&
          (!Number.isFinite(parsedQuality) ||
            parsedQuality < 10 ||
            parsedQuality > 100))
      ) {
        throw new Error("Check your resize settings and try again.");
      }

      const response = await resizeImage({
        data: base64,
        maxWidth: parsedMaxWidth,
        maxHeight: parsedMaxHeight,
        maxSizeKb: parsedMaxSizeKb,
        quality: parsedQuality,
      });

      const blob = base64ToBlob(response.data, "image/jpeg");
      const previewUrl = URL.createObjectURL(blob);

      setResult({
        previewUrl,
        width: response.width,
        height: response.height,
        sizeBytes: response.sizeBytes,
        quality: response.quality,
        blob,
        filename: outputName,
      });
    } catch (processError) {
      const message =
        processError instanceof Error
          ? processError.message
          : "Could not process the image.";
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!result || !selectedFile) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const savedPath = await saveImageBlob(result.blob, saveMode, {
        sourcePath: selectedFile.sourcePath,
        suggestedName: result.filename,
      });

      if (!savedPath) {
        return;
      }

      const label =
        saveMode === "replace"
          ? "Original file replaced"
          : `Saved to ${savedPath.split(/[/\\]/).pop()}`;

      setSuccessMessage(label);

      if (saveMode === "replace" && selectedFile.sourcePath) {
        setSelectedFile((current) =>
          current
            ? {
                ...current,
                sourcePath: savedPath,
                fileName: savedPath.split(/[/\\]/).pop() ?? current.fileName,
                sizeBytes: result.sizeBytes,
              }
            : current,
        );
      }
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Could not save the image.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ToolShell tool={tool}>
      <div className="grid gap-8 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <SlidersHorizontal className="h-4 w-4" />
            Settings
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Max width (px)
              </span>
              <input
                type="number"
                min={1}
                value={maxWidth}
                onChange={(event) => {
                  setMaxWidth(event.target.value);
                  resetResult();
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Max height (px)
              </span>
              <input
                type="number"
                min={1}
                value={maxHeight}
                onChange={(event) => {
                  setMaxHeight(event.target.value);
                  resetResult();
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Target max size (KB)
              </span>
              <input
                type="number"
                min={1}
                value={maxSizeKb}
                onChange={(event) => {
                  setMaxSizeKb(event.target.value);
                  resetResult();
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Starting quality
              </span>
              <input
                type="number"
                min={10}
                max={100}
                value={quality}
                onChange={(event) => {
                  setQuality(event.target.value);
                  resetResult();
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
              />
            </label>
          </div>

          <p className="mt-6 text-sm leading-6 text-slate-500">
            The image is resized to fit within your max dimensions, then
            compressed as JPG. Quality is lowered step-by-step until the file
            fits under the target size.
          </p>

          <button
            type="button"
            onClick={handleProcess}
            disabled={!selectedFile || isProcessing}
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isProcessing ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Resize & Compress
              </>
            )}
          </button>
        </section>

        <section className="space-y-8">
          {selectedFile ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Current file
                </p>
                <p className="mt-1 truncate text-sm font-medium text-slate-900">
                  {selectedFile.fileName}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedFile.width} x {selectedFile.height} ·{" "}
                  {formatBytes(selectedFile.sizeBytes)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleChooseFile()}
                className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Change file
              </button>
            </div>
          ) : (
            <div
              onDragOver={
                isTauriApp()
                  ? undefined
                  : (event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }
              }
              onDragLeave={isTauriApp() ? undefined : () => setIsDragging(false)}
              onDrop={
                isTauriApp()
                  ? undefined
                  : (event) => {
                      event.preventDefault();
                      setIsDragging(false);
                      void handleBrowserFiles(event.dataTransfer.files);
                    }
              }
              className={[
                "rounded-2xl border border-dashed px-8 py-16 text-center transition",
                isDragging
                  ? "border-slate-400 bg-white"
                  : "border-slate-300 bg-white/70",
              ].join(" ")}
            >
              <ImageUp className="mx-auto mb-4 h-10 w-10 text-slate-400" />
              <p className="text-base font-medium text-slate-800">
                Drop an image here
              </p>
              <p className="mt-2 text-sm text-slate-500">
                PNG, JPG, WEBP, or GIF
              </p>
              <button
                type="button"
                onClick={() => void handleChooseFile()}
                className="mt-6 inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Choose file
              </button>
              {!isTauriApp() ? (
                <input
                  id="image-resizer-file-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const files = event.target.files;
                    if (files) void handleBrowserFiles(files);
                    event.target.value = "";
                  }}
                />
              ) : null}
            </div>
          )}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {successMessage ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              {successMessage}
            </div>
          ) : null}

          {selectedFile ? (
            <div className="grid gap-8 xl:grid-cols-2">
              <PreviewPanel
                title="Original"
                previewUrl={selectedFile.previewUrl}
                meta={`${selectedFile.width} x ${selectedFile.height} · ${formatBytes(selectedFile.sizeBytes)}`}
              />

              {result ? (
                <PreviewPanel
                  title="Output"
                  previewUrl={result.previewUrl}
                  meta={`${result.width} x ${result.height} · ${formatBytes(result.sizeBytes)} · quality ${result.quality}`}
                />
              ) : (
                <div className="flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-8 py-12 text-center shadow-sm">
                  <div>
                    <p className="text-base font-medium text-slate-700">
                      No output yet
                    </p>
                    <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">
                      Adjust settings on the left, then run Resize & Compress to
                      preview the result here.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {result ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
              <div className="mb-6">
                <h3 className="text-base font-semibold text-slate-900">
                  Save options
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Choose whether to overwrite the original file or save a new
                  copy.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <SaveModeOption
                  label="Replace original"
                  description={
                    canReplaceOriginal
                      ? "Overwrite the file you opened from disk"
                      : "Available only for files opened from disk"
                  }
                  checked={saveMode === "replace"}
                  disabled={!canReplaceOriginal}
                  onSelect={() => setSaveMode("replace")}
                />
                <SaveModeOption
                  label="Save as new"
                  description="Pick a new file name and location"
                  checked={saveMode === "new"}
                  onSelect={() => setSaveMode("new")}
                />
              </div>

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300 sm:w-auto sm:min-w-56"
              >
                {isSaving ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    {saveMode === "replace"
                      ? "Replace Original"
                      : "Save As New"}
                  </>
                )}
              </button>
            </section>
          ) : null}
        </section>
      </div>
    </ToolShell>
  );
}

function SaveModeOption({
  label,
  description,
  checked,
  disabled = false,
  onSelect,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={[
        "rounded-2xl border px-5 py-5 text-left transition",
        checked
          ? "border-slate-900 bg-slate-900 text-white shadow-sm"
          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      <p className="text-base font-medium">{label}</p>
      <p
        className={[
          "mt-2 text-sm leading-6",
          checked ? "text-slate-300" : "text-slate-500",
        ].join(" ")}
      >
        {description}
      </p>
    </button>
  );
}

function PreviewPanel({
  title,
  previewUrl,
  meta,
}: {
  title: string;
  previewUrl: string;
  meta: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">{meta}</p>
      </div>
      <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 p-4">
        <img
          src={previewUrl}
          alt={title}
          className="max-h-96 w-full object-contain"
        />
      </div>
    </div>
  );
}
