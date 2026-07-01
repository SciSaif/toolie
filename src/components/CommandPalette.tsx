import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useCommandPalette } from "../context/CommandPaletteContext";
import { getAllTools, getCategoryById, searchTools } from "../data/tools";

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => {
    if (!query.trim()) return getAllTools();
    return searchTools(query);
  }, [query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setActiveIndex(0);
      return;
    }

    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) =>
          results.length === 0 ? 0 : (current + 1) % results.length,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) =>
          results.length === 0
            ? 0
            : (current - 1 + results.length) % results.length,
        );
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, isOpen, results.length]);

  const openTool = (toolId: string) => {
    close();
    navigate(`/tools/${toolId}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 py-16 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close command palette"
        onClick={close}
      />

      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results[activeIndex]) {
                event.preventDefault();
                openTool(results[activeIndex].id);
              }
            }}
            placeholder="Search and open a tool..."
            className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">
            Esc
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">
              No tools match your search.
            </p>
          ) : (
            results.map((tool, index) => {
              const category = getCategoryById(tool.category);
              const isActive = index === activeIndex;

              return (
                <button
                  key={tool.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => openTool(tool.id)}
                  className={[
                    "flex w-full items-start justify-between gap-4 rounded-xl px-3 py-3 text-left transition",
                    isActive ? "bg-slate-900 text-white" : "hover:bg-slate-100",
                  ].join(" ")}
                >
                  <div>
                    <p className="text-sm font-medium">{tool.name}</p>
                    <p
                      className={[
                        "mt-1 text-xs",
                        isActive ? "text-slate-300" : "text-slate-500",
                      ].join(" ")}
                    >
                      {tool.description}
                    </p>
                  </div>
                  <span
                    className={[
                      "shrink-0 text-xs font-medium",
                      isActive ? "text-slate-300" : "text-slate-400",
                    ].join(" ")}
                  >
                    {category?.name}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
