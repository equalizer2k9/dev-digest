/* /eval/compare?a=<runId>&b=<runId> — Compare two completed eval runs of one agent.
   Thin entry: the ids come from the URL, the whole screen lives in EvalCompareView. */
"use client";

import { useSearchParams } from "next/navigation";
import { EvalCompareView } from "./_components/EvalCompareView";

export default function EvalComparePage() {
  const search = useSearchParams();
  return <EvalCompareView a={search.get("a")} b={search.get("b")} />;
}
