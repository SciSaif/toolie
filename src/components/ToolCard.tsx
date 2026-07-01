import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { Tool } from "../data/types";
import { getCategoryById } from "../data/tools";
import { getCategoryIcon } from "../lib/categories";

interface ToolCardProps {
  tool: Tool;
}

export function ToolCard({ tool }: ToolCardProps) {
  const category = getCategoryById(tool.category);
  const Icon = getCategoryIcon(tool.category);

  return (
    <Link
      to={`/tools/${tool.id}`}
      className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
          <Icon className="h-5 w-5" />
        </div>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
          Coming soon
        </span>
      </div>

      <div className="flex-1">
        <h3 className="text-base font-semibold text-slate-900">{tool.name}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {tool.description}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {category?.name}
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 opacity-0 transition group-hover:opacity-100">
          Open
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
