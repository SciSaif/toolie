import type { LucideIcon } from "lucide-react";
import {
  FileText,
  Image,
  Settings,
  Zap,
} from "lucide-react";
import type { Category } from "../data/types";

const categoryIcons: Record<string, LucideIcon> = {
  presets: Zap,
  image: Image,
  pdf: FileText,
  system: Settings,
};

export function getCategoryIcon(categoryId: string): LucideIcon {
  return categoryIcons[categoryId] ?? Settings;
}

export function getCategoryLabel(category: Category): string {
  return category.name;
}
