import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ToolGrid } from "../components/ToolGrid";
import { useSearch } from "../context/SearchContext";
import { getCategoryById, searchTools } from "../data/tools";

export function CategoryPage() {
  const { id } = useParams();
  const { query } = useSearch();
  const category = id ? getCategoryById(id) : undefined;

  const tools = useMemo(() => {
    if (!id) return [];
    return searchTools(query, id);
  }, [id, query]);

  if (!category) {
    return <Navigate to="/" replace />;
  }

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900">{category.name}</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          {category.description}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {tools.length} tool{tools.length === 1 ? "" : "s"} in this category
        </p>
      </div>

      <ToolGrid
        tools={tools}
        emptyMessage={
          query
            ? `No tools in ${category.name} match "${query}".`
            : `No tools in ${category.name} yet.`
        }
      />
    </section>
  );
}
