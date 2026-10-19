import { format } from "@krizaka/i18n";
import { Button } from "@krizaka/ui/button";
import { anchorOf, type ChangelogEntry, ChangelogPage, kindOfTag, type Release } from "@krizaka/ui/changelog-page";
import Link from "next/link";

/* The body of /changelog on the Changelog template of @krizaka/ui: one entry per week of merged work, its changes tagged
   (new · fixed · security · breaking) with the pull request behind each. The footer's version links `#<version>`: the
   sentence « this site runs vX » carries that id. Words come from the `changelog` messages. */
export interface ChangelogWords {
  eyebrow: string;
  title: string;
  lead: string;
  runs: string;
  runsNoUi: string;
  feed: string;
  logLabel: string;
  empty: string;
  emptyLink: string;
  kinds: Record<"added" | "changed" | "fixed" | "removed" | "security" | "breaking", string>;
  pull: string;
  week: string;
  langTag: string;
}

export function ChangelogBody({
  c,
  releases,
  version,
  ui,
  back,
  feedHref,
  pullsUrl,
}: {
  c: ChangelogWords;
  releases: readonly Release[];
  version: string;
  ui: string;
  back: { href: string; label: string };
  feedHref: string;
  pullsUrl: string;
}) {
  const date = new Intl.DateTimeFormat(c.langTag, { dateStyle: "long", timeZone: "UTC" });
  const when = (iso: string) => date.format(new Date(`${iso}T12:00:00Z`));
  const entries: ChangelogEntry[] = releases.map((r) => ({
    id: anchorOf(r),
    date: r.date,
    dateLabel: when(r.date),
    version: format(c.week, { date: when(r.version) }),
    title: r.source,
    changes: r.changes.map((ch) => ({
      kind: kindOfTag(ch.tag),
      text: (
        <>
          {ch.text}
          {ch.pr && (
            <>
              {" "}
              <a href={ch.pr.url} aria-label={format(c.pull, { number: ch.pr.number })}>
                #{ch.pr.number}
              </a>
            </>
          )}
        </>
      ),
    })),
  }));
  return (
    <>
      <ChangelogPage
        back={back}
        linkAs={Link}
        eyebrow={c.eyebrow}
        title={c.title}
        lead={
          <>
            {c.lead} <span id={version}>{ui ? format(c.runs, { version, ui }) : format(c.runsNoUi, { version })}</span>
          </>
        }
        actions={
          <Button asChild variant="secondary" size="md" shape="cut">
            <a href={feedHref}>{c.feed}</a>
          </Button>
        }
        kindLabels={c.kinds}
        logLabel={c.logLabel}
        entries={entries}
      />
      {entries.length === 0 && (
        <p style={{ margin: "0 auto", maxWidth: "var(--kz-page-max, 72rem)", padding: "0 var(--kz-page-gutter, 1rem) 4rem" }}>
          {c.empty} <a href={pullsUrl}>{c.emptyLink}</a>
        </p>
      )}
    </>
  );
}
