import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CommandPaletteProvider } from "./context/CommandPaletteContext";
import { SearchProvider } from "./context/SearchContext";
import { AppLayout } from "./layouts/AppLayout";
import { CategoryPage } from "./pages/CategoryPage";
import { HomePage } from "./pages/HomePage";
import { ToolPage } from "./pages/ToolPage";

function App() {
  return (
    <SearchProvider>
      <CommandPaletteProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/category/:id" element={<CategoryPage />} />
              <Route path="/tools/:id" element={<ToolPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CommandPaletteProvider>
    </SearchProvider>
  );
}

export default App;
