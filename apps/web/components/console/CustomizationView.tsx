"use client";

import { CheckIcon, EditIcon } from "@krizaka/icons";
import { krizakaFetch, useMutation } from "@krizaka/query";
import { Badge } from "@krizaka/ui/badge";
import { Button } from "@krizaka/ui/button";
import { DashboardLayout, Widget } from "@krizaka/ui/dashboard-layout";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CustomizationConfig } from "@/lib/customization";
import { useSay } from "@/lib/i18n-client";

interface Props {
  initialConfig: CustomizationConfig;
  version: number;
}

export function CustomizationView({ initialConfig, version: initialVersion }: Props) {
  const { say } = useSay();
  const router = useRouter();

  const [version, setVersion] = useState(initialVersion);
  const [theme, setTheme] = useState(initialConfig.theme);
  const [branding, setBranding] = useState(initialConfig.branding);
  const [matching, setMatching] = useState(initialConfig.matching);
  const [featureFlags, setFeatureFlags] = useState(initialConfig.featureFlags);
  const [interestsText, setInterestsText] = useState(initialConfig.taxonomy.interests.join(", "));
  const [reason, setReason] = useState("");
  const [savedSuccess, setSavedSuccess] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const interests = interestsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        config: {
          theme,
          branding,
          matching,
          featureFlags,
          taxonomy: {
            ...initialConfig.taxonomy,
            interests,
          },
        },
        reason: reason || `Updated via Customization Studio v${version + 1}`,
      };

      const res = (await krizakaFetch("/api/admin/customization", {
        method: "PUT",
        json: payload,
      })) as { version: number; config: CustomizationConfig };
      return res;
    },
    onSuccess: (data) => {
      setVersion(data.version);
      setSavedSuccess(true);
      router.refresh();
      setTimeout(() => setSavedSuccess(false), 4000);
    },
  });

  const inputClass =
    "w-full rounded-md border border-edge bg-bg-surface px-3 py-2 text-sm text-fg focus:border-fg-accent focus:outline-none";

  return (
    <DashboardLayout
      headingAs="h2"
      title={say("console.admin.customization.title")}
      description={say("console.admin.customization.description")}
    >
      {/* Top Action Bar */}
      <div className="col-span-full flex flex-wrap items-center justify-between gap-4 rounded-lg border border-edge bg-bg-surface p-4">
        <div className="flex items-center gap-3">
          <Badge tone="accent">v{version}</Badge>
          {savedSuccess ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-accent">
              <CheckIcon size={16} /> {say("console.admin.customization.saved")}
            </span>
          ) : (
            <span className="text-xs text-fg-muted">
              {say("console.admin.customization.liveBadge")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            shape="cut"
            variant="primary"
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            <span className="flex items-center gap-1.5">
              <EditIcon size={16} /> {say("console.admin.customization.save")}
            </span>
          </Button>
        </div>
      </div>

      {/* Live Preview Box */}
      <Widget level={3} title={say("console.admin.customization.previewTitle")} span={2}>
        <div
          className="flex flex-col gap-3 rounded-lg border border-edge p-4"
          style={{
            borderRadius: theme.borderRadius === "pill" ? "1.5rem" : theme.borderRadius === "cut" ? "0.25rem" : "0.75rem",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="font-display text-lg font-bold text-fg">{branding.appName}</span>
            <span
              className="inline-block h-3.5 w-3.5 rounded-full"
              style={{ backgroundColor: theme.accentColor }}
            />
          </div>
          <p className="text-sm text-fg-secondary">{branding.tagline}</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <span
              className="px-2.5 py-1 text-xs font-semibold text-white"
              style={{
                backgroundColor: theme.accentColor,
                borderRadius: theme.borderRadius === "pill" ? "9999px" : "0.375rem",
              }}
            >
              {say("console.admin.customization.primaryButton")}
            </span>
            <span className="rounded border border-edge px-2.5 py-1 text-xs text-fg">
              {say("console.admin.customization.secondarySurface")}
            </span>
          </div>
        </div>
      </Widget>

      {/* Theme & Design Tokens */}
      <Widget level={3} title={say("console.admin.customization.themeTitle")} span={2}>
        <div className="flex flex-col gap-3 text-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-secondary">
              {say("console.admin.customization.brandHue")}
            </label>
            <select
              className={inputClass}
              value={theme.brandHue}
              onChange={(e) =>
                setTheme({ ...theme, brandHue: e.target.value as CustomizationConfig["theme"]["brandHue"] })
              }
            >
              <option value="emerald">{say("console.admin.customization.hueEmerald")}</option>
              <option value="turquoise">{say("console.admin.customization.hueTurquoise")}</option>
              <option value="violet">{say("console.admin.customization.hueViolet")}</option>
              <option value="indigo">{say("console.admin.customization.hueIndigo")}</option>
              <option value="slate">{say("console.admin.customization.hueSlate")}</option>
              <option value="amber">{say("console.admin.customization.hueAmber")}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-secondary">
              {say("console.admin.customization.accentColor")}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-12 cursor-pointer rounded border border-edge bg-transparent"
                value={theme.accentColor}
                onChange={(e) => setTheme({ ...theme, accentColor: e.target.value })}
              />
              <input
                type="text"
                className={inputClass}
                value={theme.accentColor}
                onChange={(e) => setTheme({ ...theme, accentColor: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-secondary">
                {say("console.admin.customization.borderRadius")}
              </label>
              <select
                className={inputClass}
                value={theme.borderRadius}
                onChange={(e) =>
                  setTheme({ ...theme, borderRadius: e.target.value as CustomizationConfig["theme"]["borderRadius"] })
                }
              >
                <option value="rounded">{say("console.admin.customization.radiusRounded")}</option>
                <option value="cut">{say("console.admin.customization.radiusCut")}</option>
                <option value="pill">{say("console.admin.customization.radiusPill")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-secondary">
                {say("console.admin.customization.fontDensity")}
              </label>
              <select
                className={inputClass}
                value={theme.fontDensity}
                onChange={(e) =>
                  setTheme({ ...theme, fontDensity: e.target.value as CustomizationConfig["theme"]["fontDensity"] })
                }
              >
                <option value="compact">{say("console.admin.customization.densityCompact")}</option>
                <option value="default">{say("console.admin.customization.densityDefault")}</option>
                <option value="relaxed">{say("console.admin.customization.densityRelaxed")}</option>
              </select>
            </div>
          </div>
        </div>
      </Widget>

      {/* Branding & Identity */}
      <Widget level={3} title={say("console.admin.customization.brandingTitle")} span={2}>
        <div className="flex flex-col gap-3 text-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-secondary">
              {say("console.admin.customization.appName")}
            </label>
            <input
              type="text"
              className={inputClass}
              value={branding.appName}
              onChange={(e) => setBranding({ ...branding, appName: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-secondary">
              {say("console.admin.customization.tagline")}
            </label>
            <input
              type="text"
              className={inputClass}
              value={branding.tagline}
              onChange={(e) => setBranding({ ...branding, tagline: e.target.value })}
            />
          </div>
        </div>
      </Widget>

      {/* Matching & Geolocation Rules */}
      <Widget level={3} title={say("console.admin.customization.matchingTitle")} span={2}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-secondary">
              {say("console.admin.customization.defaultRadius")}
            </label>
            <input
              type="number"
              min="1"
              max="200"
              className={inputClass}
              value={matching.defaultRadiusKm}
              onChange={(e) => setMatching({ ...matching, defaultRadiusKm: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-secondary">
              {say("console.admin.customization.maxRadius")}
            </label>
            <input
              type="number"
              min="5"
              max="500"
              className={inputClass}
              value={matching.maxRadiusKm}
              onChange={(e) => setMatching({ ...matching, maxRadiusKm: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-secondary">
              {say("console.admin.customization.minAffinity")}
            </label>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              className={inputClass}
              value={matching.minAffinity}
              onChange={(e) => setMatching({ ...matching, minAffinity: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-secondary">
              {say("console.admin.customization.batchSize")}
            </label>
            <input
              type="number"
              min="1"
              max="10"
              className={inputClass}
              value={matching.batchSize}
              onChange={(e) => setMatching({ ...matching, batchSize: Number(e.target.value) })}
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-fg-secondary">
              {say("console.admin.customization.cooldownHours")}
            </label>
            <input
              type="number"
              min="1"
              max="168"
              className={inputClass}
              value={matching.cooldownHours}
              onChange={(e) => setMatching({ ...matching, cooldownHours: Number(e.target.value) })}
            />
          </div>
        </div>
      </Widget>

      {/* Feature Flags */}
      <Widget level={3} title={say("console.admin.customization.flagsTitle")} span={2}>
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex items-center justify-between rounded border border-edge p-2.5">
            <span>{say("console.admin.customization.voiceNotes")}</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={featureFlags.voiceNotesEnabled}
              onChange={(e) =>
                setFeatureFlags({ ...featureFlags, voiceNotesEnabled: e.target.checked })
              }
            />
          </label>
          <label className="flex items-center justify-between rounded border border-edge p-2.5">
            <span>{say("console.admin.customization.instantMatches")}</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={featureFlags.instantMatchesEnabled}
              onChange={(e) =>
                setFeatureFlags({ ...featureFlags, instantMatchesEnabled: e.target.checked })
              }
            />
          </label>
          <label className="flex items-center justify-between rounded border border-edge p-2.5">
            <span>{say("console.admin.customization.proximityAlerts")}</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={featureFlags.proximityAlertsEnabled}
              onChange={(e) =>
                setFeatureFlags({ ...featureFlags, proximityAlertsEnabled: e.target.checked })
              }
            />
          </label>
          <label className="flex items-center justify-between rounded border border-edge p-2.5">
            <span>{say("console.admin.customization.debriefRequired")}</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={featureFlags.debriefRequired}
              onChange={(e) =>
                setFeatureFlags({ ...featureFlags, debriefRequired: e.target.checked })
              }
            />
          </label>
        </div>
      </Widget>

      {/* Taxonomy & Dynamic Fields */}
      <Widget level={3} title={say("console.admin.customization.taxonomyTitle")} span="full">
        <div className="flex flex-col gap-3 text-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-secondary">
              {say("console.admin.customization.interestsLabel")}
            </label>
            <textarea
              rows={3}
              className={inputClass}
              value={interestsText}
              onChange={(e) => setInterestsText(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-secondary">
              {say("console.admin.customization.reasonLabel")}
            </label>
            <input
              type="text"
              placeholder={say("console.admin.customization.reasonPlaceholder")}
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
      </Widget>
    </DashboardLayout>
  );
}
