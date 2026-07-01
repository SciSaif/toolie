import type { ComponentType } from "react";
import type { Tool } from "../data/types";
import { ImageResizerTool } from "./ImageResizerTool";
import { PhotoLayoutTool } from "./PhotoLayoutTool";
import { PngToJpgTool } from "./PngToJpgTool";

type ToolComponent = ComponentType<{ tool: Tool }>;

const toolComponents: Record<string, ToolComponent> = {
  "image-resizer": ImageResizerTool,
  "photo-layout": PhotoLayoutTool,
  "png-to-jpg": PngToJpgTool,
};

export function getToolComponent(toolId: string): ToolComponent | undefined {
  return toolComponents[toolId];
}
