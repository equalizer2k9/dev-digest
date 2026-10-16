/* /multi-agent/:id — one multi-agent run. Thin entry: the screen lives in _components/MultiRunView. */
"use client";

import { useParams } from "next/navigation";
import { MultiRunView } from "./_components/MultiRunView";

export default function MultiAgentRunPage() {
  const { id } = useParams<{ id: string }>();
  return <MultiRunView id={id} />;
}
