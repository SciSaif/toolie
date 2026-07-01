import { Link } from "react-router-dom";
import { ArrowLeft, Construction } from "lucide-react";
import type { Tool } from "../data/types";
import { getCategoryById } from "../data/tools";
import { getCategoryIcon } from "../lib/categories";

interface ToolPlaceholderProps {
  tool: Tool;
}

export function ToolPlaceholder({ tool }: ToolPlaceholderProps) {
  const category = getCategoryById(tool.category);
  const Icon = getCategoryIcon(tool.category);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to={category ? `/category/${category.id}` : "/"}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {category?.name ?? "tools"}
      </Link>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-start gap-4">
          <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {category?.name}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">
              {tool.name}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {tool.description}
            </p>
          </div>
        </div>

        <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
          <Construction className="mb-4 h-10 w-10 text-slate-400" />
          <h2 className="text-lg font-medium text-slate-800">Coming soon</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
            This tool is registered and ready to open. Processing logic will be
            added in the next phase.
          </p>
        </div>
      </div>
    </div>
  );
}
