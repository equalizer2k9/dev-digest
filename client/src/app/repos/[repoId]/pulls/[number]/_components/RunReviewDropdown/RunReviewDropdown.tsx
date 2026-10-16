/* RunReviewDropdown — ported from components2.jsx.
   "Run all enabled agents" / a specific agent → kicks off POST /pulls/:id/review
   and hands the resulting runIds up so the parent can stream SSE live status. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, Modal, type DropdownItemDef } from "@devdigest/ui";
import { useAgents } from "../../../../../../../lib/hooks/agents";
import { useRunReview } from "../../../../../../../lib/hooks/reviews";
import { useAgentEstimates, useLaunchMultiRun, useMultiRuns } from "../../../../../../../lib/hooks/multi-agent";
import { ApiError } from "../../../../../../../lib/api";
import { MultiAgentPicker } from "../../../../../../../components/multi-agent";
import { DROPDOWN_WIDTH, PICKER_MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const tm = useTranslations("multiAgent");
  const router = useRouter();
  const { data: agents } = useAgents();
  const run = useRunReview();
  const all = agents ?? [];
  const hasEnabled = all.some((a) => a.enabled);

  // Multi-agent picker (modal): the selection lives here so a failed launch keeps it.
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [launchError, setLaunchError] = React.useState<string | null>(null);
  const estimates = useAgentEstimates();
  const launch = useLaunchMultiRun();
  const { data: multiRuns } = useMultiRuns(prId);
  const latestMultiRun = multiRuns?.[0];

  const launchMulti = async () => {
    setLaunchError(null);
    try {
      const res = await launch.mutateAsync({ prId, agentIds: selected });
      router.push(`/multi-agent/${res.multi_run_id}`);
    } catch (e) {
      // Fixed copy only — server text is never rendered.
      setLaunchError(
        e instanceof ApiError && e.code === "validation_error"
          ? tm("error.invalidAgents")
          : tm("error.launch"),
      );
    }
  };

  const kick = async (opts: { all?: boolean; agentId?: string }) => {
    onRunStart?.();
    try {
      const res = await run.mutateAsync({ prId, ...opts });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
    } finally {
      onRunSettled?.();
    }
  };

  // List EVERY agent (not just enabled) so they're always visible; a specific
  // agent can be run regardless of its enabled flag. "Run all" still targets
  // only enabled agents.
  const agentItems: DropdownItemDef[] = all.length
    ? all.map((a) => ({
        label: a.name,
        icon: "Cpu" as const,
        hint: a.enabled ? a.model : `${a.model} · disabled`,
        onClick: () => kick({ agentId: a.id }),
      }))
    : [{ label: "No agents yet — create one", icon: "Plus", muted: true, onClick: () => router.push("/agents") }];

  const items: DropdownItemDef[] = [
    // Merged/closed PRs can still be reviewed (informational only); lead with a
    // muted, non-actionable warning so the intent is clear.
    ...(warnMerged
      ? [
          { label: t("runReview.mergedWarning"), icon: "AlertTriangle" as const, muted: true },
          { divider: true } as DropdownItemDef,
        ]
      : []),
    {
      label: t("runReview.runAll"),
      icon: "Play",
      ...(hasEnabled ? {} : { muted: true }),
      onClick: () => kick({ all: true }),
    },
    { label: tm("picker.open"), icon: "Layers", onClick: () => setPickerOpen(true) },
    { divider: true },
    ...agentItems,
    { divider: true },
    { label: t("runReview.configureAgents"), icon: "Settings", muted: true, onClick: () => router.push("/agents") },
  ];

  return (
    <span style={s.root}>
      {latestMultiRun && (
        <Link href={`/multi-agent/${latestMultiRun.id}`} style={s.latestLink}>
          {tm("link.latest")}
        </Link>
      )}
    <Dropdown
      width={DROPDOWN_WIDTH}
      align="right"
      items={items}
      trigger={
        <span
          title={warnMerged ? t("runReview.mergedTooltip") : undefined}
          style={warnMerged ? { opacity: 0.6 } : undefined}
        >
          <Button kind={kind} size={size} iconRight="ChevronDown" icon="Sparkles" loading={run.isPending}>
            {run.isPending ? t("runReview.running") : t("runReview.runReview")}
          </Button>
        </span>
      }
    />
      {pickerOpen && (
        <Modal title={tm("picker.modalTitle")} width={PICKER_MODAL_WIDTH} onClose={() => setPickerOpen(false)}>
          <MultiAgentPicker
            estimates={estimates.data?.agents}
            loading={estimates.isLoading}
            selected={selected}
            onChange={setSelected}
            onLaunch={launchMulti}
            launching={launch.isPending}
            error={launchError}
          />
        </Modal>
      )}
    </span>
  );
}
