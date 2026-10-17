"use client";

import { GoalIcon, UsersIcon, WarningIcon } from "@krizaka/icons";
import { Badge } from "@krizaka/ui/badge";
import { DashboardLayout, Widget } from "@krizaka/ui/dashboard-layout";

import type { AnalyticsReport } from "@/lib/analytics";
import { useSay } from "@/lib/i18n-client";

interface Props {
  report: AnalyticsReport;
}

export function AnalyticsView({ report }: Props) {
  const { say } = useSay();
  const big = "font-display text-3xl font-extrabold text-fg";

  return (
    <DashboardLayout
      headingAs="h2"
      title={say("console.admin.analytics.title")}
      description={say("console.admin.analytics.description")}
    >
      {/* Conversion Funnel */}
      <Widget level={3} title={say("console.admin.analytics.funnelTitle")} span="full">
        <div className="flex flex-col gap-3 pt-2">
          {report.funnel.map((step) => (
            <div key={step.name} className="flex flex-col gap-1">
              <div className="flex justify-between text-xs font-medium text-fg">
                <span>{step.name}</span>
                <span className="text-fg-secondary">
                  {step.count} ({step.conversionPercent}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-edge">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(2, step.conversionPercent))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Widget>

      {/* Match Quality & Decision Ratios */}
      <Widget level={3} title={say("console.admin.analytics.matchQualityTitle")} span={2}>
        <div className="flex flex-col gap-4">
          <div>
            <span className="text-xs font-medium text-fg-secondary">
              {say("console.admin.analytics.acceptanceRate")}
            </span>
            <p className={big}>{report.matchQuality.acceptanceRate}%</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded border border-edge p-2">
              <span className="text-fg-secondary">{say("console.admin.analytics.interested")}</span>
              <p className="mt-1 font-bold text-accent">{report.matchQuality.interestedCount}</p>
            </div>
            <div className="rounded border border-edge p-2">
              <span className="text-fg-secondary">{say("console.admin.analytics.pass")}</span>
              <p className="mt-1 font-bold text-fg-muted">{report.matchQuality.passCount}</p>
            </div>
            <div className="rounded border border-edge p-2">
              <span className="text-fg-secondary">{say("console.admin.analytics.tellMeMore")}</span>
              <p className="mt-1 font-bold text-fg-secondary">{report.matchQuality.tellMeMoreCount}</p>
            </div>
          </div>
        </div>
      </Widget>

      {/* Safety Radar & Anomalies */}
      <Widget level={3} title={say("console.admin.analytics.anomaliesTitle")} span={2}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded border border-edge p-3">
            <div className="flex items-center gap-2 text-sm text-fg">
              <WarningIcon className="text-danger" size={16} />
              <span>{say("console.admin.analytics.urgentReports")}</span>
            </div>
            <Badge tone={report.anomalies.urgentReports > 0 ? "danger" : "success"}>
              {report.anomalies.urgentReports}
            </Badge>
          </div>

          <div className="flex items-center justify-between rounded border border-edge p-3">
            <div className="flex items-center gap-2 text-sm text-fg">
              <GoalIcon className="text-fg-secondary" size={16} />
              <span>{say("console.admin.analytics.openReports")}</span>
            </div>
            <Badge tone="neutral">{report.anomalies.openReports}</Badge>
          </div>

          <div className="flex items-center justify-between rounded border border-edge p-3">
            <div className="flex items-center gap-2 text-sm text-fg">
              <UsersIcon className="text-fg-secondary" size={16} />
              <span>{say("console.admin.analytics.suspendedAccounts")}</span>
            </div>
            <Badge tone="neutral">{report.anomalies.suspendedAccounts}</Badge>
          </div>
        </div>
      </Widget>

      {/* Geospatial Activity Heatmap */}
      <Widget level={3} title={say("console.admin.analytics.heatmapTitle")} span="full">
        {report.heatmap.length === 0 ? (
          <p className="text-sm text-fg-secondary">{say("console.admin.analytics.noHeatmap")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-edge text-fg-secondary">
                <tr>
                  <th className="py-2">{say("console.admin.analytics.clusterLabel")}</th>
                  <th className="py-2 text-right">{say("console.admin.analytics.activeCount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {report.heatmap.slice(0, 10).map((pt, idx) => (
                  <tr key={idx} className="hover:bg-bg-hover">
                    <td className="py-2 font-mono text-fg">{pt.clusterLabel}</td>
                    <td className="py-2 text-right font-bold text-accent">{pt.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Widget>
    </DashboardLayout>
  );
}
