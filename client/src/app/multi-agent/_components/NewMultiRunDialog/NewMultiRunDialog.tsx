/* NewMultiRunDialog — choose a repository and a pull request, then the same picker as the PR page.
   Launch posts the chosen PR with the ticked agents and opens the run page. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Modal, SelectInput } from "@devdigest/ui";
import { MultiAgentPicker } from "@/components/multi-agent";
import { useRepos, usePulls } from "@/lib/hooks/core";
import { useAgentEstimates, useLaunchMultiRun } from "@/lib/hooks/multi-agent";
import { ApiError } from "@/lib/api";
import { DIALOG_WIDTH } from "./constants";
import { s } from "./styles";

export function NewMultiRunDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const [repoId, setRepoId] = React.useState("");
  const [prId, setPrId] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const repos = useRepos();
  const pulls = usePulls(repoId || null);
  const estimates = useAgentEstimates();
  const launch = useLaunchMultiRun();

  const onLaunch = async () => {
    setError(null);
    try {
      const res = await launch.mutateAsync({ prId, agentIds: selected });
      router.push(`/multi-agent/${res.multi_run_id}`);
    } catch (e) {
      // Fixed copy only — server text is never rendered.
      setError(
        e instanceof ApiError && e.code === "validation_error"
          ? t("error.invalidAgents")
          : t("error.launch"),
      );
    }
  };

  const pickRepo = (id: string) => {
    setRepoId(id);
    setPrId("");
  };

  return (
    <Modal title={t("newRun.title")} width={DIALOG_WIDTH} onClose={onClose}>
      <div style={s.fields}>
        <div>
          <div style={s.label}>{t("newRun.repo")}</div>
          <SelectInput
            mono={false}
            value={repoId}
            onChange={pickRepo}
            options={[
              { value: "", label: t("newRun.chooseRepo") },
              ...(repos.data ?? []).map((r) => ({ value: r.id, label: r.full_name })),
            ]}
          />
        </div>
        {repoId && (
          <div>
            <div style={s.label}>{t("newRun.pr")}</div>
            {pulls.data && pulls.data.length === 0 ? (
              <div style={s.note}>{t("newRun.noPulls")}</div>
            ) : (
              <SelectInput
                mono={false}
                value={prId}
                onChange={setPrId}
                options={[
                  { value: "", label: t("newRun.choosePr") },
                  ...(pulls.data ?? []).flatMap((p) =>
                    p.id ? [{ value: p.id, label: `#${p.number} ${p.title}` }] : [],
                  ),
                ]}
              />
            )}
          </div>
        )}
      </div>
      {prId && (
        <MultiAgentPicker
          estimates={estimates.data?.agents}
          loading={estimates.isLoading}
          selected={selected}
          onChange={setSelected}
          onLaunch={onLaunch}
          launching={launch.isPending}
          error={error}
        />
      )}
    </Modal>
  );
}
