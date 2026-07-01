import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { Tool } from "../data/types";
import { getCategoryById } from "../data/tools";
import { getCategoryIcon } from "../lib/categories";

interface ToolShellProps {
  tool: Tool;
  children: React.ReactNode;
}

export function ToolShell({ tool, children }: ToolShellProps) {
  const category = getCategoryById(tool.category);
  const Icon = getCategoryIcon(tool.category);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link
        to={category ? `/category/${category.id}` : "/"}
        className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {category?.name ?? "tools"}
      </Link>

      <div className="mb-10 flex items-start gap-5">
        <div className="rounded-2xl bg-white p-3.5 text-slate-700 shadow-sm ring-1 ring-slate-200">
          <Icon className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {category?.name}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            {tool.name}
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-500">
            {tool.description}
          </p>
        </div>
      </div>

      {children}
    </div>
  );
}
