import { Navigate, useParams } from "react-router-dom";
import { ToolPlaceholder } from "../components/ToolPlaceholder";
import { getToolById } from "../data/tools";
import { getToolComponent } from "../tools";

export function ToolPage() {
  const { id } = useParams();
  const tool = id ? getToolById(id) : undefined;

  if (!tool) {
    return <Navigate to="/" replace />;
  }

  const ToolComponent = id ? getToolComponent(id) : undefined;

  if (ToolComponent) {
    return <ToolComponent tool={tool} />;
  }

  return <ToolPlaceholder tool={tool} />;
}
