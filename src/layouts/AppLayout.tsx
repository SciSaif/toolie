import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { CommandPalette } from "../components/CommandPalette";
import { SearchBar } from "../components/SearchBar";
import { Sidebar } from "../components/Sidebar";
import { useCommandPalette } from "../context/CommandPaletteContext";

export function AppLayout() {
  const { open } = useCommandPalette();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isPaletteShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";

      if (isPaletteShortcut) {
        event.preventDefault();
        open();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="flex h-full bg-slate-100 text-slate-900">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">FormCraft</h1>
            <p className="text-sm text-slate-500">
              Browse, search, and open your tools
            </p>
          </div>

          <div className="flex items-center gap-3">
            <SearchBar />
            <button
              type="button"
              onClick={open}
              className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 sm:inline-flex"
            >
              <span>Command</span>
              <kbd className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">
                ⌘K
              </kbd>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">
          <Outlet />
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}
