import { useMemo } from "react";
import { useSearch } from "../context/SearchContext";
import { searchTools } from "../data/tools";
import { ToolGrid } from "../components/ToolGrid";

export function HomePage() {
  const { query } = useSearch();

  const tools = useMemo(() => searchTools(query), [query]);

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900">All Tools</h2>
        <p className="mt-1 text-sm text-slate-500">
          {tools.length} tool{tools.length === 1 ? "" : "s"} available
        </p>
      </div>

      <ToolGrid
        tools={tools}
        emptyMessage={
          query
            ? `No tools found for "${query}". Try another keyword like passport, pdf, or resize.`
            : "No tools available."
        }
      />
    </section>
  );
}
