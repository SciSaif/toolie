import registry from "./registry.json";
import type { Category, Tool, ToolRegistry } from "./types";

const data = registry as ToolRegistry;

export function getCategories(): Category[] {
  return data.categories;
}

export function getCategoryById(id: string): Category | undefined {
  return data.categories.find((category) => category.id === id);
}

export function getAllTools(): Tool[] {
  return data.tools;
}

export function getToolById(id: string): Tool | undefined {
  return data.tools.find((tool) => tool.id === id);
}

export function getToolsByCategory(categoryId: string): Tool[] {
  return data.tools.filter((tool) => tool.category === categoryId);
}

function matchesQuery(tool: Tool, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    tool.name,
    tool.description,
    ...tool.keywords,
    getCategoryById(tool.category)?.name ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return normalized.split(/\s+/).every((term) => haystack.includes(term));
}

export function searchTools(query: string, categoryId?: string): Tool[] {
  return data.tools.filter((tool) => {
    if (categoryId && tool.category !== categoryId) return false;
    return matchesQuery(tool, query);
  });
}
