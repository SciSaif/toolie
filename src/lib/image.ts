import { invoke } from "@tauri-apps/api/core";

export interface ResizeImageRequest {
  data: string;
  maxWidth?: number;
  maxHeight?: number;
  maxSizeKb?: number;
  quality?: number;
}

export interface ResizeImageResponse {
  data: string;
  width: number;
  height: number;
  sizeBytes: number;
  quality: number;
  format: string;
}

export function resizeImage(
  request: ResizeImageRequest,
): Promise<ResizeImageResponse> {
  return invoke<ResizeImageResponse>("resize_image", { request });
}

export interface ConvertPngToJpgRequest {
  data: string;
  quality?: number;
  maxSizeKb?: number;
}

export interface ConvertPngToJpgResponse {
  data: string;
  width: number;
  height: number;
  sizeBytes: number;
  quality: number;
}

export function convertPngToJpg(
  request: ConvertPngToJpgRequest,
): Promise<ConvertPngToJpgResponse> {
  return invoke<ConvertPngToJpgResponse>("convert_png_to_jpg", { request });
}
