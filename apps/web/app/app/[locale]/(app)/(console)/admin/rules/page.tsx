import { Badge } from "@krizaka/ui/badge";
import { DescriptionList } from "@krizaka/ui/description-list";
import { PageHeader } from "@krizaka/ui/page-header";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RuleSetActions } from "@/components/console/RuleSetActions";
import { pageAdmin } from "@/lib/console-access";
import { asLocale, getDictionary, translator } from "@/lib/i18n";
import { RULE_DOMAINS, ruleFields, ruleSetHistory } from "@/lib/rule-sets";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(asLocale((await params).locale)).console.shell.rules };
}

const shown = (value: unknown) => (Array.isArray(value) ? value.join(", ") : String(value));

/**
 * The rule sets the app reads (the batch, the agent): the active version, its parameters, every earlier version and why
 * it was published. An operator publishes a new version or restores an old one — never a deploy. 404 unless administrator.
 */
export default async function RulesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  if (!(await pageAdmin())) notFound();
  const t = getDictionary(locale).console.admin.rules;
  const say = translator(locale);
  const history = await ruleSetHistory();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <>
      <PageHeader as="h2" title={t.title} description={t.description} className="mb-6" />
      <div className="flex flex-col gap-10">
        {RULE_DOMAINS.map((domain) => {
          const versions = history[domain];
          const active = versions.find((v) => v.active);
          return (
            <section key={domain} aria-labelledby={`rules-${domain}`} className="flex max-w-3xl flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <h3 id={`rules-${domain}`} className="font-display text-base font-bold text-fg">
                  {t.domains[domain]}
                </h3>
                {active ? <Badge tone="success" dot>{say("console.admin.rules.activeVersion", { version: active.version })}</Badge> : <Badge tone="danger">{t.noActive}</Badge>}
              </div>
              <p className="text-sm text-fg-secondary">{t.domainHints[domain]}</p>
              {active ? (
                <>
                  <DescriptionList layout="inline" items={Object.entries(active.params).map(([key, value]) => ({ term: t.params[key as keyof typeof t.params] ?? key, details: <span className="font-mono">{shown(value)}</span> }))} />
                  <RuleSetActions domain={domain} params={active.params} fields={ruleFields(domain)} versions={versions.filter((v) => !v.active).map((v) => v.version)} />
                </>
              ) : null}
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-fg">{say("console.admin.rules.history", { count: versions.length })}</summary>
                <ol className="mt-3 flex flex-col gap-3">
                  {versions.map((v) => (
                    <li key={v.version} className="flex flex-col gap-1 border-l-2 border-border-default pl-3">
                      <span className="flex flex-wrap items-center gap-2 text-fg">
                        <span className="font-mono">{say("console.admin.rules.versionLabel", { version: v.version })}</span>
                        {v.active ? <Badge tone="success">{t.active}</Badge> : null}
                        <span className="text-xs text-fg-muted">{date.format(new Date(v.createdAt))}</span>
                      </span>
                      <span className="text-fg-secondary">{v.reason}</span>
                    </li>
                  ))}
                </ol>
              </details>
            </section>
          );
        })}
      </div>
    </>
  );
}
