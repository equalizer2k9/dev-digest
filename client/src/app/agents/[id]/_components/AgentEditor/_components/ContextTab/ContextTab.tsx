/* ContextTab — which project documents this agent reads, and in what order.
   A thin wrapper: the list, preview and writes live in AttachmentsEditor. */
"use client";

import React from "react";
import type { Agent } from "@devdigest/shared";
import { AttachmentsEditor } from "@/components/project-context/AttachmentsEditor";

export function ContextTab({ agent }: { agent: Agent }) {
  return <AttachmentsEditor owner="agent" ownerId={agent.id} />;
}
