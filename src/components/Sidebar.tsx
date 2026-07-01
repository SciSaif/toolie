import { NavLink } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { getCategories } from "../data/tools";
import { getCategoryIcon } from "../lib/categories";

export function Sidebar() {
  const categories = getCategories();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
      isActive
        ? "bg-slate-900 text-white"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    ].join(" ");

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5">
      <div className="mb-6 px-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Browse
        </p>
      </div>

      <nav className="flex flex-col gap-1">
        <NavLink to="/" end className={linkClass}>
          <LayoutGrid className="h-4 w-4" />
          All Tools
        </NavLink>

        {categories.map((category) => {
          const Icon = getCategoryIcon(category.id);
          return (
            <NavLink
              key={category.id}
              to={`/category/${category.id}`}
              className={linkClass}
            >
              <Icon className="h-4 w-4" />
              {category.name}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
