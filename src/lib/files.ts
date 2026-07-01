import { invoke } from "@tauri-apps/api/core";
import { dirname, join } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { isTauriApp } from "./tauri";

export type SaveMode = "replace" | "new";

export interface LoadedImage {
  sourcePath: string | null;
  fileName: string;
  bytes: Uint8Array;
  previewUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

async function writeImageFile(path: string, bytes: Uint8Array): Promise<void> {
  await invoke("write_image_file", {
    request: {
      path,
      data: bytesToBase64(bytes),
    },
  });
}

async function removeImageFile(path: string): Promise<void> {
  await invoke("remove_image_file", { path });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageFileName(name: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || isImageFileName(file.name);
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read file"));
        return;
      }

      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("Could not encode file"));
        return;
      }

      resolve(base64);
    };

    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

function guessMimeType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    default:
      return "application/octet-stream";
  }
}

function readImageDimensions(
  previewUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };

    image.onerror = () => reject(new Error("Could not read image dimensions"));
    image.src = previewUrl;
  });
}

export async function pickImagePath(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
      },
    ],
  });

  if (!selected || Array.isArray(selected)) {
    return null;
  }

  return selected;
}

export async function loadImageFromPath(path: string): Promise<LoadedImage> {
  if (!isImageFileName(path)) {
    throw new Error("Please choose a PNG, JPG, WEBP, or GIF image.");
  }

  const bytes = await readFile(path);
  const fileName = path.split(/[/\\]/).pop() ?? "image";
  const previewUrl = URL.createObjectURL(
    new Blob([bytes], { type: guessMimeType(fileName) }),
  );
  const dimensions = await readImageDimensions(previewUrl);

  return {
    sourcePath: path,
    fileName,
    bytes,
    previewUrl,
    width: dimensions.width,
    height: dimensions.height,
    sizeBytes: bytes.length,
  };
}

export async function loadImageFromFile(file: File): Promise<LoadedImage> {
  if (!isImageFile(file)) {
    throw new Error("Please choose a PNG, JPG, WEBP, or GIF image.");
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const previewUrl = URL.createObjectURL(file);
  const dimensions = await readImageDimensions(previewUrl);

  return {
    sourcePath: null,
    fileName: file.name,
    bytes,
    previewUrl,
    width: dimensions.width,
    height: dimensions.height,
    sizeBytes: file.size,
  };
}

async function getJpegReplacePath(sourcePath: string): Promise<string> {
  if (/\.jpe?g$/i.test(sourcePath)) {
    return sourcePath;
  }

  const directory = await dirname(sourcePath);
  const fileName = sourcePath.split(/[/\\]/).pop() ?? "image";
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return join(directory, `${baseName}.jpg`);
}

async function replaceOriginalFile(
  sourcePath: string,
  bytes: Uint8Array,
): Promise<string> {
  const replacePath = await getJpegReplacePath(sourcePath);
  await writeImageFile(replacePath, bytes);

  if (replacePath !== sourcePath) {
    try {
      await removeImageFile(sourcePath);
    } catch {
      // Original may already be gone or locked; replacement still succeeded.
    }
  }

  return replacePath;
}

async function saveAsNewFile(
  bytes: Uint8Array,
  sourcePath: string | null | undefined,
  suggestedName: string,
): Promise<string | null> {
  let defaultPath = suggestedName;

  if (sourcePath) {
    const directory = await dirname(sourcePath);
    defaultPath = await join(directory, suggestedName);
  }

  const destination = await save({
    defaultPath,
    filters: [{ name: "JPEG Image", extensions: ["jpg", "jpeg"] }],
  });

  if (!destination) {
    return null;
  }

  await writeImageFile(destination, bytes);
  return destination;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function saveImageBlob(
  blob: Blob,
  mode: SaveMode,
  options: {
    sourcePath?: string | null;
    suggestedName: string;
  },
): Promise<string | null> {
  const bytes = new Uint8Array(await blob.arrayBuffer());

  if (isTauriApp()) {
    try {
      if (mode === "replace") {
        if (!options.sourcePath) {
          throw new Error(
            "Replace original is only available for files opened from disk.",
          );
        }

        return replaceOriginalFile(options.sourcePath, bytes);
      }

      return saveAsNewFile(bytes, options.sourcePath, options.suggestedName);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Could not save the image."));
    }
  }

  downloadBlob(blob, options.suggestedName);
  return options.suggestedName;
}

export function buildResizedFileName(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return `${baseName}-resized.jpg`;
}
