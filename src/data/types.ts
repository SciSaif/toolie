export type ToolStatus = "coming-soon" | "available";

export interface Category {
  id: string;
  name: string;
  description: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
  keywords: string[];
  status: ToolStatus;
}

export interface ToolRegistry {
  categories: Category[];
  tools: Tool[];
}
