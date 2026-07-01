import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Download,
  ImagePlus,
  ImageUp,
  LayoutGrid,
  LoaderCircle,
  RotateCw,
  Trash2,
  XCircle,
} from "lucide-react";
import type { Tool } from "../data/types";
import { ToolShell } from "../components/ToolShell";
import {
  loadImageFromFile,
  loadImageFromPath,
  saveGeneratedFile,
  saveImageBlob,
  waitForNextPaint,
} from "../lib/files";
import { buildSingleImagePdf } from "../lib/pdf";
import { isTauriApp } from "../lib/tauri";

interface PhotoLayoutToolProps {
  tool: Tool;
}

interface SourceImage {
  id: string;
  name: string;
  previewUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  element: HTMLImageElement;
}

interface PlacedItem {
  id: string;
  sourceId: string;
  /** Axis-aligned footprint on the page, in millimeters. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation in 90-degree steps: 0 | 90 | 180 | 270. */
  rotation: number;
}

interface PaperSize {
  id: string;
  name: string;
  width: number;
  height: number;
}

const PAPER_SIZES: PaperSize[] = [
  { id: "a4", name: "A4", width: 210, height: 297 },
  { id: "a3", name: "A3", width: 297, height: 420 },
  { id: "a5", name: "A5", width: 148, height: 210 },
  { id: "letter", name: "Letter", width: 216, height: 279 },
  { id: "legal", name: "Legal", width: 216, height: 356 },
  { id: "4x6", name: "4×6 in Photo", width: 102, height: 152 },
];

type Orientation = "portrait" | "landscape";

const PAGE_MARGIN_MM = 6;
const ITEM_GAP_MM = 4;
const MIN_ITEM_MM = 10;
const DPI_OPTIONS = [150, 300];

type Corner = "nw" | "ne" | "sw" | "se";

interface DragState {
  type: "move" | "resize";
  itemId: string;
  pointerId: number;
  scale: number;
  rectLeft: number;
  rectTop: number;
  origin: PlacedItem;
  // Move-only: pointer offset from the item's top-left at grab time (mm).
  grabDX?: number;
  grabDY?: number;
  // Resize-only fields.
  corner?: Corner;
  aspect?: number;
  oppX?: number;
  oppY?: number;
  dirX?: number;
  dirY?: number;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Date.now()}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => setWidth(element.clientWidth);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

export function PhotoLayoutTool({ tool }: PhotoLayoutToolProps) {
  const [sources, setSources] = useState<SourceImage[]>([]);
  const [items, setItems] = useState<PlacedItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paperId, setPaperId] = useState("a4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [dpi, setDpi] = useState(300);
  const [format, setFormat] = useState<"jpeg" | "png" | "pdf">("jpeg");
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const paper = useMemo(() => {
    const base = PAPER_SIZES.find((size) => size.id === paperId) ?? PAPER_SIZES[0];
    return orientation === "landscape"
      ? { ...base, width: base.height, height: base.width }
      : base;
  }, [paperId, orientation]);

  const [paperWrapRef, wrapWidth] = useElementWidth<HTMLDivElement>();
  const paperRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // Pixels per millimeter for the on-screen preview. Fit the page inside the
  // available width while capping the height so tall pages stay usable.
  const scale = useMemo(() => {
    if (!wrapWidth) return 2;
    const maxHeight = 620;
    return Math.min(wrapWidth / paper.width, maxHeight / paper.height);
  }, [wrapWidth, paper.width, paper.height]);

  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const sourceById = useMemo(() => {
    const map = new Map<string, SourceImage>();
    for (const source of sources) map.set(source.id, source);
    return map;
  }, [sources]);

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    return () => {
      for (const source of sources) URL.revokeObjectURL(source.previewUrl);
    };
    // Cleanup only on unmount; sources are revoked here intentionally once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addSources = useCallback(
    (loaded: SourceImage[]) => {
      if (!loaded.length) return;

      setSources((prev) => [...prev, ...loaded]);
      setItems((prev) => {
        const combinedSources = [...sources, ...loaded];
        const combinedItems = [
          ...prev,
          ...loaded.map((source) => ({
            id: nextId("item"),
            sourceId: source.id,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            rotation: 0,
          })),
        ];
        return autoArrange(combinedItems, combinedSources, paper);
      });
    },
    [sources, paper],
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      const loaded: SourceImage[] = [];
      const failures: string[] = [];

      for (const file of files) {
        try {
          const image = await loadImageFromFile(file);
          loaded.push(await toSource(image.previewUrl, image.fileName));
        } catch {
          failures.push(file.name);
        }
      }

      if (failures.length) {
        setError(`Skipped ${failures.length} unsupported file(s).`);
      }
      addSources(loaded);
    },
    [addSources],
  );

  const handlePaths = useCallback(
    async (paths: string[]) => {
      setError(null);
      const loaded: SourceImage[] = [];
      const failures: string[] = [];

      for (const path of paths) {
        try {
          const image = await loadImageFromPath(path);
          loaded.push(await toSource(image.previewUrl, image.fileName));
        } catch {
          failures.push(path);
        }
      }

      if (failures.length) {
        setError(`Skipped ${failures.length} unsupported file(s).`);
      }
      addSources(loaded);
    },
    [addSources],
  );

  const handleChooseFiles = useCallback(async () => {
    setError(null);

    try {
      if (isTauriApp()) {
        const selected = await open({
          multiple: true,
          filters: [
            {
              name: "Images",
              extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
            },
          ],
        });

        if (!selected) return;
        const paths = Array.isArray(selected) ? selected : [selected];
        await handlePaths(paths);
        return;
      }

      document.getElementById("photo-layout-file-input")?.click();
    } catch (chooseError) {
      setError(
        chooseError instanceof Error
          ? chooseError.message
          : "Could not open those images.",
      );
    }
  }, [handlePaths]);

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
          if (event.payload.paths.length) {
            void handlePaths(event.payload.paths);
          }
        }
      })
      .then((cleanup) => {
        unlisten = cleanup;
      });

    return () => {
      unlisten?.();
    };
  }, [handlePaths]);

  // ---- Interactions (move / resize) --------------------------------------

  const onItemPointerDown = (event: React.PointerEvent, item: PlacedItem) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedId(item.id);

    const rect = paperRef.current?.getBoundingClientRect();
    if (!rect) return;

    const pointerX = (event.clientX - rect.left) / scaleRef.current;
    const pointerY = (event.clientY - rect.top) / scaleRef.current;

    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = {
      type: "move",
      itemId: item.id,
      pointerId: event.pointerId,
      scale: scaleRef.current,
      rectLeft: rect.left,
      rectTop: rect.top,
      origin: item,
      grabDX: pointerX - item.x,
      grabDY: pointerY - item.y,
    };
  };

  const onHandlePointerDown = (
    event: React.PointerEvent,
    item: PlacedItem,
    corner: Corner,
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedId(item.id);

    const rect = paperRef.current?.getBoundingClientRect();
    if (!rect) return;

    const source = sourceById.get(item.sourceId);
    if (!source) return;

    const aspect = item.width / item.height;
    // The corner opposite the grabbed one stays anchored in place.
    const oppX = corner === "nw" || corner === "sw" ? item.x + item.width : item.x;
    const oppY = corner === "nw" || corner === "ne" ? item.y + item.height : item.y;
    const dirX = corner === "ne" || corner === "se" ? 1 : -1;
    const dirY = corner === "sw" || corner === "se" ? 1 : -1;

    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = {
      type: "resize",
      itemId: item.id,
      pointerId: event.pointerId,
      scale: scaleRef.current,
      rectLeft: rect.left,
      rectTop: rect.top,
      origin: item,
      corner,
      aspect,
      oppX,
      oppY,
      dirX,
      dirY,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const pointerX = (event.clientX - drag.rectLeft) / drag.scale;
    const pointerY = (event.clientY - drag.rectTop) / drag.scale;

    if (drag.type === "move") {
      const { origin } = drag;
      const grabDX = drag.grabDX ?? origin.width / 2;
      const grabDY = drag.grabDY ?? origin.height / 2;
      const nextX = clamp(pointerX - grabDX, 0, paper.width - origin.width);
      const nextY = clamp(pointerY - grabDY, 0, paper.height - origin.height);
      setItems((prev) =>
        prev.map((it) =>
          it.id === drag.itemId ? { ...it, x: nextX, y: nextY } : it,
        ),
      );
      return;
    }

    // Resize keeping the opposite corner anchored and aspect ratio locked.
    const aspect = drag.aspect ?? 1;
    const oppX = drag.oppX ?? 0;
    const oppY = drag.oppY ?? 0;
    const dirX = drag.dirX ?? 1;
    const dirY = drag.dirY ?? 1;

    const maxW = dirX > 0 ? paper.width - oppX : oppX;
    const maxH = dirY > 0 ? paper.height - oppY : oppY;

    const wFromX = (pointerX - oppX) * dirX;
    const hFromY = (pointerY - oppY) * dirY;
    let width = Math.max(wFromX, hFromY * aspect);
    width = clamp(width, MIN_ITEM_MM, maxW);
    let height = width / aspect;

    if (height > maxH) {
      height = maxH;
      width = height * aspect;
    }
    if (width < MIN_ITEM_MM || height < MIN_ITEM_MM) {
      return;
    }

    const nextX = dirX > 0 ? oppX : oppX - width;
    const nextY = dirY > 0 ? oppY : oppY - height;

    setItems((prev) =>
      prev.map((it) =>
        it.id === drag.itemId
          ? { ...it, x: nextX, y: nextY, width, height }
          : it,
      ),
    );
  };

  const endDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  // ---- Item actions -------------------------------------------------------

  const rotateSelected = useCallback(() => {
    if (!selectedId) return;
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== selectedId) return item;
        const cx = item.x + item.width / 2;
        const cy = item.y + item.height / 2;
        let width = item.height;
        let height = item.width;
        // Shrink to fit if the swapped footprint no longer fits the page.
        if (width > paper.width) {
          const s = paper.width / width;
          width *= s;
          height *= s;
        }
        if (height > paper.height) {
          const s = paper.height / height;
          width *= s;
          height *= s;
        }
        const x = clamp(cx - width / 2, 0, paper.width - width);
        const y = clamp(cy - height / 2, 0, paper.height - height);
        return {
          ...item,
          width,
          height,
          x,
          y,
          rotation: (item.rotation + 90) % 360,
        };
      }),
    );
  }, [selectedId, paper.width, paper.height]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setItems((prev) => prev.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  const bringToFront = useCallback(() => {
    if (!selectedId) return;
    setItems((prev) => {
      const target = prev.find((item) => item.id === selectedId);
      if (!target) return prev;
      return [...prev.filter((item) => item.id !== selectedId), target];
    });
  }, [selectedId]);

  const handleAutoArrange = useCallback(() => {
    setItems((prev) => autoArrange(prev, sources, paper));
  }, [sources, paper]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedId) return;
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT") return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      } else if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        rotateSelected();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, deleteSelected, rotateSelected]);

  // ---- Export -------------------------------------------------------------

  const handleExport = useCallback(async () => {
    if (!items.length) return;

    setIsExporting(true);
    setError(null);
    setSuccessMessage(null);
    await waitForNextPaint();

    try {
      const pxPerMm = dpi / 25.4;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(paper.width * pxPerMm);
      canvas.height = Math.round(paper.height * pxPerMm);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create an export canvas.");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      for (const item of items) {
        const source = sourceById.get(item.sourceId);
        if (!source) continue;

        const cx = (item.x + item.width / 2) * pxPerMm;
        const cy = (item.y + item.height / 2) * pxPerMm;
        const rotated = item.rotation === 90 || item.rotation === 270;
        const drawW = (rotated ? item.height : item.width) * pxPerMm;
        const drawH = (rotated ? item.width : item.height) * pxPerMm;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((item.rotation * Math.PI) / 180);
        ctx.drawImage(source.element, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      }

      const baseName = `layout-${paper.name.toLowerCase().replace(/\s+/g, "-")}`;
      let savedPath: string | null;

      if (format === "pdf") {
        const jpegBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((result) => resolve(result), "image/jpeg", 0.92),
        );
        if (!jpegBlob) throw new Error("Could not render the sheet.");

        const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
        const pdfBytes = buildSingleImagePdf(
          jpegBytes,
          canvas.width,
          canvas.height,
          dpi,
        );

        savedPath = await saveGeneratedFile(pdfBytes, {
          suggestedName: `${baseName}.pdf`,
          mimeType: "application/pdf",
          dialogFilterName: "PDF Document",
          dialogExtensions: ["pdf"],
        });
      } else {
        const mime = format === "png" ? "image/png" : "image/jpeg";
        const quality = format === "png" ? undefined : 0.92;
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((result) => resolve(result), mime, quality),
        );
        if (!blob) throw new Error("Could not render the sheet.");

        const extension = format === "png" ? "png" : "jpg";
        savedPath = await saveImageBlob(blob, "new", {
          suggestedName: `${baseName}.${extension}`,
        });
      }

      if (savedPath) {
        const shownName = savedPath.split(/[/\\]/).pop() ?? baseName;
        setSuccessMessage(`Sheet exported as ${shownName}`);
      }
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Could not export the sheet.",
      );
    } finally {
      setIsExporting(false);
    }
  }, [items, dpi, paper, sourceById, format]);

  const hasContent = sources.length > 0;

  return (
    <ToolShell tool={tool}>
      <div className="mx-auto max-w-6xl">
        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {successMessage ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
            <Download className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        ) : null}

        {!hasContent ? (
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
                    void handleFiles(Array.from(event.dataTransfer.files));
                  }
            }
            onChooseFiles={() => void handleChooseFiles()}
          />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <ControlPanel
              paperId={paperId}
              setPaperId={setPaperId}
              orientation={orientation}
              setOrientation={setOrientation}
              dpi={dpi}
              setDpi={setDpi}
              format={format}
              setFormat={setFormat}
              itemCount={items.length}
              onAddImages={() => void handleChooseFiles()}
              onAutoArrange={handleAutoArrange}
              onExport={() => void handleExport()}
              isExporting={isExporting}
              selectedItem={selectedItem}
              onRotate={rotateSelected}
              onDelete={deleteSelected}
              onBringToFront={bringToFront}
            />

            <div
              ref={paperWrapRef}
              className="flex min-h-[420px] items-start justify-center rounded-2xl border border-slate-200 bg-slate-100 p-6"
            >
              <div
                ref={paperRef}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerDown={() => setSelectedId(null)}
                className="relative shrink-0 touch-none bg-white shadow-lg ring-1 ring-slate-300"
                style={{
                  width: paper.width * scale,
                  height: paper.height * scale,
                }}
              >
                {items.map((item) => {
                  const source = sourceById.get(item.sourceId);
                  if (!source) return null;
                  const isSelected = item.id === selectedId;
                  const rotated =
                    item.rotation === 90 || item.rotation === 270;

                  return (
                    <div
                      key={item.id}
                      onPointerDown={(event) => onItemPointerDown(event, item)}
                      className={[
                        "absolute cursor-move select-none",
                        isSelected
                          ? "ring-2 ring-sky-500"
                          : "ring-1 ring-transparent hover:ring-sky-300",
                      ].join(" ")}
                      style={{
                        left: item.x * scale,
                        top: item.y * scale,
                        width: item.width * scale,
                        height: item.height * scale,
                      }}
                    >
                      <img
                        src={source.previewUrl}
                        alt={source.name}
                        draggable={false}
                        className="pointer-events-none absolute left-1/2 top-1/2"
                        style={{
                          width:
                            (rotated ? item.height : item.width) * scale,
                          height:
                            (rotated ? item.width : item.height) * scale,
                          transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
                        }}
                      />
                      {isSelected
                        ? (["nw", "ne", "sw", "se"] as Corner[]).map(
                            (corner) => (
                              <span
                                key={corner}
                                onPointerDown={(event) =>
                                  onHandlePointerDown(event, item, corner)
                                }
                                className={[
                                  "absolute h-3 w-3 rounded-full border border-white bg-sky-500 shadow",
                                  corner === "nw"
                                    ? "-left-1.5 -top-1.5 cursor-nwse-resize"
                                    : corner === "ne"
                                      ? "-right-1.5 -top-1.5 cursor-nesw-resize"
                                      : corner === "sw"
                                        ? "-bottom-1.5 -left-1.5 cursor-nesw-resize"
                                        : "-bottom-1.5 -right-1.5 cursor-nwse-resize",
                                ].join(" ")}
                              />
                            ),
                          )
                        : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!isTauriApp() ? (
          <input
            id="photo-layout-file-input"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = event.target.files;
              if (files) void handleFiles(Array.from(files));
              event.target.value = "";
            }}
          />
        ) : null}
      </div>
    </ToolShell>
  );
}

async function toSource(
  previewUrl: string,
  name: string,
): Promise<SourceImage> {
  const element = new Image();
  await new Promise<void>((resolve, reject) => {
    element.onload = () => resolve();
    element.onerror = () => reject(new Error("Could not decode image"));
    element.src = previewUrl;
  });

  return {
    id: nextId("src"),
    name,
    previewUrl,
    naturalWidth: element.naturalWidth,
    naturalHeight: element.naturalHeight,
    element,
  };
}

/**
 * Lays every item out in a tidy grid that fills the page with margins and
 * gaps, keeping each image's aspect ratio. Rotation is reset to 0.
 */
function autoArrange(
  items: PlacedItem[],
  sources: SourceImage[],
  paper: PaperSize,
): PlacedItem[] {
  const count = items.length;
  if (!count) return items;

  const sourceMap = new Map(sources.map((source) => [source.id, source]));

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellW =
    (paper.width - 2 * PAGE_MARGIN_MM - (cols - 1) * ITEM_GAP_MM) / cols;
  const cellH =
    (paper.height - 2 * PAGE_MARGIN_MM - (rows - 1) * ITEM_GAP_MM) / rows;

  return items.map((item, index) => {
    const source = sourceMap.get(item.sourceId);
    const aspect = source
      ? source.naturalWidth / source.naturalHeight
      : item.width / item.height || 1;

    let width = cellW;
    let height = width / aspect;
    if (height > cellH) {
      height = cellH;
      width = height * aspect;
    }

    const col = index % cols;
    const row = Math.floor(index / cols);
    const cellX = PAGE_MARGIN_MM + col * (cellW + ITEM_GAP_MM);
    const cellY = PAGE_MARGIN_MM + row * (cellH + ITEM_GAP_MM);
    const x = cellX + (cellW - width) / 2;
    const y = cellY + (cellH - height) / 2;

    return { ...item, x, y, width, height, rotation: 0 };
  });
}

function UploadStage({
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onChooseFiles,
}: {
  isDragging: boolean;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  onChooseFiles: () => void;
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
        Drop images here to build a sheet
      </p>
      <p className="mt-2 text-sm text-slate-500">
        Select several at once &middot; they're placed automatically, then move,
        resize, and rotate freely
      </p>
      <button
        type="button"
        onClick={onChooseFiles}
        className="mt-7 inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
      >
        <ImagePlus className="h-4 w-4" />
        Choose images
      </button>
    </div>
  );
}

function ControlPanel({
  paperId,
  setPaperId,
  orientation,
  setOrientation,
  dpi,
  setDpi,
  format,
  setFormat,
  itemCount,
  onAddImages,
  onAutoArrange,
  onExport,
  isExporting,
  selectedItem,
  onRotate,
  onDelete,
  onBringToFront,
}: {
  paperId: string;
  setPaperId: (value: string) => void;
  orientation: Orientation;
  setOrientation: (value: Orientation) => void;
  dpi: number;
  setDpi: (value: number) => void;
  format: "jpeg" | "png" | "pdf";
  setFormat: (value: "jpeg" | "png" | "pdf") => void;
  itemCount: number;
  onAddImages: () => void;
  onAutoArrange: () => void;
  onExport: () => void;
  isExporting: boolean;
  selectedItem: PlacedItem | null;
  onRotate: () => void;
  onDelete: () => void;
  onBringToFront: () => void;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-800">Paper</h3>

        <label className="block">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Size
          </span>
          <select
            value={paperId}
            onChange={(event) => setPaperId(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
          >
            {PAPER_SIZES.map((size) => (
              <option key={size.id} value={size.id}>
                {size.name} ({size.width}×{size.height} mm)
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Orientation
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(["portrait", "landscape"] as Orientation[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setOrientation(value)}
                className={[
                  "rounded-xl border px-3 py-2 text-sm font-medium capitalize transition",
                  orientation === value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
                ].join(" ")}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            Images
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              {itemCount}
            </span>
          </h3>
        </div>

        <div className="grid gap-2">
          <button
            type="button"
            onClick={onAddImages}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            <ImagePlus className="h-4 w-4" />
            Add images
          </button>
          <button
            type="button"
            onClick={onAutoArrange}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            <LayoutGrid className="h-4 w-4" />
            Auto arrange
          </button>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Selected image
          </p>
          {selectedItem ? (
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={onRotate}
                title="Rotate 90° (R)"
                className="inline-flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
              >
                <RotateCw className="h-4 w-4" />
                Rotate
              </button>
              <button
                type="button"
                onClick={onBringToFront}
                title="Bring to front"
                className="inline-flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
              >
                <LayoutGrid className="h-4 w-4" />
                Front
              </button>
              <button
                type="button"
                onClick={onDelete}
                title="Delete (Del)"
                className="inline-flex flex-col items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2 py-2.5 text-xs font-medium text-red-600 transition hover:bg-red-100"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          ) : (
            <p className="text-xs leading-5 text-slate-400">
              Click an image on the page to move, resize from its corners, or
              rotate it.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-800">Export</h3>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Quality (DPI)
            </span>
            <select
              value={dpi}
              onChange={(event) => setDpi(Number(event.target.value))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
            >
              {DPI_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value} DPI
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Format
            </span>
            <select
              value={format}
              onChange={(event) =>
                setFormat(event.target.value as "jpeg" | "png" | "pdf")
              }
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
            >
              <option value="jpeg">JPG</option>
              <option value="png">PNG</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
        </div>

        {format === "pdf" ? (
          <p className="mt-3 text-xs leading-5 text-slate-400">
            The sheet is rendered as a single high-quality image and embedded
            on one PDF page sized to match your paper selection.
          </p>
        ) : null}

        <button
          type="button"
          onClick={onExport}
          disabled={isExporting || itemCount === 0}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
        >
          {isExporting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export sheet
        </button>
      </section>
    </div>
  );
}
