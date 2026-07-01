import { Navigate, useParams } from "react-router-dom";
import { ToolPlaceholder } from "../components/ToolPlaceholder";
import { getToolById } from "../data/tools";

export function ToolPage() {
  const { id } = useParams();
  const tool = id ? getToolById(id) : undefined;

  if (!tool) {
    return <Navigate to="/" replace />;
  }

  return <ToolPlaceholder tool={tool} />;
}
