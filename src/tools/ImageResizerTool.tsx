import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ImageUp,
  LoaderCircle,
  Repeat,
  Sparkles,
  SlidersHorizontal,
  XCircle,
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
  waitForNextPaint,
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

type Stage = "upload" | "configure" | "processing" | "result";

const PROCESSING_STEPS = [
  "Reading image...",
  "Resizing to fit...",
  "Compressing output...",
  "Finishing up...",
];

export function ImageResizerTool({ tool }: ImageResizerToolProps) {
  const [stage, setStage] = useState<Stage>("upload");
  const [selectedFile, setSelectedFile] = useState<LoadedImage | null>(null);
  const [result, setResult] = useState<ProcessedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);

  const [maxWidth, setMaxWidth] = useState("1280");
  const [maxHeight, setMaxHeight] = useState("1280");
  const [maxSizeKb, setMaxSizeKb] = useState("200");
  const [quality, setQuality] = useState("85");

  const outputName = useMemo(() => {
    if (!selectedFile) return "resized.jpg";
    return buildResizedFileName(selectedFile.fileName);
  }, [selectedFile]);

  const canReplaceOriginal = Boolean(selectedFile?.sourcePath);

  const reductionPercent = useMemo(() => {
    if (!result || !selectedFile || selectedFile.sizeBytes <= 0) return null;
    const savedRatio = 1 - result.sizeBytes / selectedFile.sizeBytes;
    return Math.round(savedRatio * 100);
  }, [result, selectedFile]);

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
              setStage("configure");
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
    if (stage !== "processing") return;

    setProcessingStep(0);
    const interval = setInterval(() => {
      setProcessingStep((step) =>
        step < PROCESSING_STEPS.length - 1 ? step + 1 : step,
      );
    }, 500);

    return () => clearInterval(interval);
  }, [stage]);

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
        resetResult();
        setStage("configure");
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
      resetResult();
      setError(null);
      setSuccessMessage(null);
      setStage("configure");
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

    setError(null);
    resetResult();
    setStage("processing");

    // Let the browser paint the loading state before the heavy, synchronous
    // encode/decode work below runs, so the UI never appears to "freeze".
    await waitForNextPaint();

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
      setStage("result");
    } catch (processError) {
      const message =
        processError instanceof Error
          ? processError.message
          : "Could not process the image.";
      setError(message);
      setStage("configure");
    }
  };

  const handleBackToSettings = () => {
    resetResult();
    setError(null);
    setStage("configure");
  };

  const handleSave = async (mode: SaveMode) => {
    if (!result || !selectedFile) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const savedPath = await saveImageBlob(result.blob, mode, {
        sourcePath: selectedFile.sourcePath,
        suggestedName: result.filename,
      });

      if (!savedPath) {
        return;
      }

      const label =
        mode === "replace"
          ? "Original file replaced"
          : `Saved to ${savedPath.split(/[/\\]/).pop()}`;

      setSuccessMessage(label);

      if (mode === "replace" && selectedFile.sourcePath) {
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

  const handleDownload = () => void handleSave("new");

  const handleReplace = () => void handleSave("replace");

  return (
    <ToolShell tool={tool}>
      <div className="mx-auto max-w-5xl">
        {stage !== "upload" ? <StepIndicator stage={stage} /> : null}

        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {stage === "upload" ? (
          <UploadStage
            isDragging={isDragging}
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
            onChooseFile={() => void handleChooseFile()}
            onBrowserFiles={(files) => void handleBrowserFiles(files)}
          />
        ) : null}

        {stage === "configure" && selectedFile ? (
          <ConfigureStage
            selectedFile={selectedFile}
            onChooseFile={() => void handleChooseFile()}
            maxWidth={maxWidth}
            setMaxWidth={setMaxWidth}
            maxHeight={maxHeight}
            setMaxHeight={setMaxHeight}
            maxSizeKb={maxSizeKb}
            setMaxSizeKb={setMaxSizeKb}
            quality={quality}
            setQuality={setQuality}
            onProcess={() => void handleProcess()}
          />
        ) : null}

        {stage === "processing" && selectedFile ? (
          <ProcessingStage
            previewUrl={selectedFile.previewUrl}
            step={PROCESSING_STEPS[processingStep]}
          />
        ) : null}

        {stage === "result" && result && selectedFile ? (
          <ResultStage
            result={result}
            originalSizeBytes={selectedFile.sizeBytes}
            reductionPercent={reductionPercent}
            canReplaceOriginal={canReplaceOriginal}
            isSaving={isSaving}
            successMessage={successMessage}
            onBack={handleBackToSettings}
            onDownload={handleDownload}
            onReplace={handleReplace}
          />
        ) : null}

        {!isTauriApp() && stage === "upload" ? (
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
    </ToolShell>
  );
}

function StepIndicator({ stage }: { stage: Stage }) {
  const steps: { key: Stage[]; label: string }[] = [
    { key: ["upload"], label: "Upload" },
    { key: ["configure", "processing"], label: "Configure" },
    { key: ["result"], label: "Result" },
  ];

  const activeIndex = steps.findIndex((step) => step.key.includes(stage));

  return (
    <div className="mb-8 flex items-center">
      {steps.map((step, index) => {
        const isDone = index < activeIndex;
        const isActive = index === activeIndex;
        const isLoading = isActive && stage === "processing";

        return (
          <div key={step.label} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2.5">
              <div
                className={[
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition",
                  isDone
                    ? "bg-slate-900 text-white"
                    : isActive
                      ? "bg-slate-900 text-white"
                      : "bg-slate-200 text-slate-500",
                ].join(" ")}
              >
                {isLoading ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : isDone ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={[
                  "text-sm font-medium",
                  isActive || isDone ? "text-slate-900" : "text-slate-400",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 ? (
              <div
                className={[
                  "mx-4 h-px flex-1 transition",
                  isDone ? "bg-slate-900" : "bg-slate-200",
                ].join(" ")}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function UploadStage({
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onChooseFile,
  onBrowserFiles,
}: {
  isDragging: boolean;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  onChooseFile: () => void;
  onBrowserFiles: (files: FileList) => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={[
        "rounded-3xl border-2 border-dashed px-8 py-20 text-center transition",
        isDragging
          ? "border-slate-400 bg-slate-50"
          : "border-slate-300 bg-white/70 hover:border-slate-400 hover:bg-slate-50/70",
      ].join(" ")}
    >
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 shadow-sm">
        <ImageUp className="h-8 w-8 text-white" />
      </div>
      <p className="text-lg font-semibold text-slate-900">
        Drop an image here
      </p>
      <p className="mt-2 text-sm text-slate-500">
        or choose a file from your computer &middot; PNG, JPG, WEBP, or GIF
      </p>
      <button
        type="button"
        onClick={onChooseFile}
        className="mt-7 inline-flex cursor-pointer items-center justify-center rounded-xl bg-slate-900 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
      >
        Choose file
      </button>
      {!isTauriApp() ? (
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const files = event.target.files;
            if (files) onBrowserFiles(files);
            event.target.value = "";
          }}
        />
      ) : null}
    </div>
  );
}

function ConfigureStage({
  selectedFile,
  onChooseFile,
  maxWidth,
  setMaxWidth,
  maxHeight,
  setMaxHeight,
  maxSizeKb,
  setMaxSizeKb,
  quality,
  setQuality,
  onProcess,
}: {
  selectedFile: LoadedImage;
  onChooseFile: () => void;
  maxWidth: string;
  setMaxWidth: (value: string) => void;
  maxHeight: string;
  setMaxHeight: (value: string) => void;
  maxSizeKb: string;
  setMaxSizeKb: (value: string) => void;
  quality: string;
  setQuality: (value: string) => void;
  onProcess: () => void;
}) {
  return (
    <div className="animate-fade-in-up space-y-6">
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
          onClick={onChooseFile}
          className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Change file
        </button>
      </div>

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
                onChange={(event) => setMaxWidth(event.target.value)}
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
                onChange={(event) => setMaxHeight(event.target.value)}
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
                onChange={(event) => setMaxSizeKb(event.target.value)}
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
                onChange={(event) => setQuality(event.target.value)}
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
            onClick={onProcess}
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <Sparkles className="h-4 w-4" />
            Resize & Compress
          </button>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="mb-5">
            <h3 className="text-base font-semibold text-slate-900">
              Original
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {selectedFile.width} x {selectedFile.height} ·{" "}
              {formatBytes(selectedFile.sizeBytes)}
            </p>
          </div>
          <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 p-4">
            <img
              src={selectedFile.previewUrl}
              alt="Original"
              className="max-h-96 w-full object-contain"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function ProcessingStage({
  previewUrl,
  step,
}: {
  previewUrl: string;
  step: string;
}) {
  return (
    <div className="animate-fade-in-up flex min-h-112 flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
      <div className="relative mb-6 h-28 w-28 overflow-hidden rounded-2xl bg-slate-100">
        <img
          src={previewUrl}
          alt="Processing"
          className="h-full w-full object-cover opacity-40 blur-[1px]"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/10">
          <LoaderCircle className="h-9 w-9 animate-spin text-slate-900" />
        </div>
      </div>

      <p className="text-base font-semibold text-slate-900">
        Processing your image
      </p>
      <p className="mt-2 min-h-5 text-sm text-slate-500">{step}</p>

      <div className="mt-6 h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full w-1/3 rounded-full bg-slate-900 animate-loading-bar" />
      </div>
    </div>
  );
}

function ResultStage({
  result,
  originalSizeBytes,
  reductionPercent,
  canReplaceOriginal,
  isSaving,
  successMessage,
  onBack,
  onDownload,
  onReplace,
}: {
  result: ProcessedResult;
  originalSizeBytes: number;
  reductionPercent: number | null;
  canReplaceOriginal: boolean;
  isSaving: boolean;
  successMessage: string | null;
  onBack: () => void;
  onDownload: () => void;
  onReplace: () => void;
}) {
  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Image ready
          </div>
          <p className="mt-3 text-sm text-slate-500">
            {formatBytes(originalSizeBytes)} &rarr;{" "}
            <span className="font-medium text-slate-800">
              {formatBytes(result.sizeBytes)}
            </span>
            {reductionPercent !== null && reductionPercent > 0
              ? ` · ${reductionPercent}% smaller`
              : null}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      {successMessage ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {successMessage}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:p-8">
        <div className="flex min-h-96 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 p-4">
          <img
            src={result.previewUrl}
            alt="Resized output"
            className="max-h-112 w-full object-contain"
          />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-slate-500">
          <span>
            {result.width} x {result.height}
          </span>
          <span>{formatBytes(result.sizeBytes)}</span>
          <span>Quality {result.quality}</span>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        {canReplaceOriginal ? (
          <button
            type="button"
            onClick={onReplace}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-56"
          >
            {isSaving ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Repeat className="h-4 w-4" />
            )}
            Replace Original
          </button>
        ) : null}

        <button
          type="button"
          onClick={onDownload}
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300 sm:min-w-56"
        >
          {isSaving ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download
        </button>
      </div>
    </div>
  );
}
