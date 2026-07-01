import type { Tool } from "../data/types";
import { ToolCard } from "./ToolCard";

interface ToolGridProps {
  tools: Tool[];
  emptyMessage?: string;
}

export function ToolGrid({
  tools,
  emptyMessage = "No tools found.",
}: ToolGridProps) {
  if (tools.length === 0) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
        <p className="max-w-md text-sm text-slate-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tools.map((tool) => (
        <ToolCard key={tool.id} tool={tool} />
      ))}
    </div>
  );
}
