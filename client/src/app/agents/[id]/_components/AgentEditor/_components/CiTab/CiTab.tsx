/* CiTab — an agent's CI side: where it is installed, when CI should fail, its CI runs, and
   the "Add to CI" wizard. Reads only: runs are ingested on the /ci-runs page (NFR-5). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, SelectInput } from "@devdigest/ui";
import type { Agent, CiFailOn } from "@devdigest/shared";
import { CiRunsTable } from "@/components/ci/CiRunsTable";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { useCiInstallations, useCiRuns } from "@/lib/hooks/ci";
import { ExportWizard } from "@/components/ci/ExportWizard";
import { CI_FAIL_ON_VALUES } from "./constants";
import { s } from "./styles";

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const { data: installations = [] } = useCiInstallations(agent.id);
  const { data: runsData } = useCiRuns(agent.id);
  const update = useUpdateAgent();
  const [wizard, setWizard] = React.useState(false);

  const runs = runsData?.runs ?? [];
  const options = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: t(`ciTab.failOnOptions.${v}`) }));

  return (
    <div style={s.wrap}>
      <section style={s.section}>
        <div style={s.header}>
          <h2 style={s.h2}>{t("ciTab.installations")}</h2>
          <Button kind="primary" icon="Plus" onClick={() => setWizard(true)}>
            {t("exportWizard.addToCi")}
          </Button>
        </div>
        {installations.length === 0 ? (
          <div style={s.muted}>{t("ciTab.noInstallations")}</div>
        ) : (
          <ul style={s.list}>
            {installations.map((i) => (
              <li key={i.id}>
                <span style={s.repo}>{i.repo}</span>{" "}
                <span style={s.muted}>{t("ciTab.installed", { date: new Date(i.installed_at).toLocaleString() })}</span>
              </li>
            ))}
          </ul>
        )}
        {wizard && <ExportWizard agent={agent} onClose={() => setWizard(false)} />}
      </section>

      <section style={s.section}>
        <h2 style={s.h2}>{t("ciTab.failOn")}</h2>
        <div style={s.failOnRow}>
          <div style={s.failOnSelect}>
            <SelectInput
              value={agent.ci_fail_on}
              mono={false}
              options={options}
              onChange={(v) => update.mutate({ id: agent.id, patch: { ci_fail_on: v as CiFailOn } })}
            />
          </div>
          <div style={s.muted}>{t("ciTab.failOnNote")}</div>
        </div>
      </section>

      <section style={s.section}>
        <h2 style={s.h2}>{t("ciTab.runs")}</h2>
        {runs.length === 0 ? <div style={s.muted}>{t("ciTab.noRuns")}</div> : <CiRunsTable runs={runs} />}
      </section>
    </div>
  );
}
