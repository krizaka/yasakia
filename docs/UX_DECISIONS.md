# UX decisions

Every decision of the information architecture and the interaction of the console (the person's space and the operator's) is
one entry here: **decision · problem · principle · refused · cost · signal**. The navigation is data
(`apps/web/lib/console-nav.ts`), its shape is held by `apps/web/lib/console-nav.test.ts`, and the console crawl
(`scripts/check-console.mjs`, in CI and run on dev) walks every page at phone, tablet and desktop widths in both themes and both
languages. Reviewed screenshots of each key screen are on Bunny: `pr-assets/yasakia/dev-preview/`.

## 1. The person has five destinations, in the order of the journey

- **Decision.** The sidebar lists Home, Talk to your agent, Photos, Your batch, Introductions — five entries, in the order a person
  goes through them. The account is a utility, linked from the sidebar's footer next to « Signed in as ».
- **Problem.** There were six entries and « Account » sat among the steps of the journey: a place to change a password next to the
  place where one meets people.
- **Principle.** The navigation tells the product's story (talk → photos → batch → introductions); at most about five top-level
  entries; no mixed concepts in one menu.
- **Refused.** A « Profile » page that repeats the portrait (the agent writes it, the person reads it in Talk); a top-level
  « Settings ».
- **Cost.** The account is one click further for the rare person who looks for it; the footer link is quiet.
- **Signal.** Nobody asks where the account is in the QA sessions; if they do, the footer link moves up.

## 2. The operator has five sections

- **Decision.** Overview · People (users, with Reports as its sibling page) · Introductions · Rules · System (audit log, health,
  analytics as sibling pages). Sibling pages are a row of links above the page (`nav` with `aria-current`), not more sidebar entries.
- **Problem.** Eight flat entries mixed what needs a person's eyes (reports, introductions), the settings (rules) and the system
  (audit, health, analytics).
- **Principle.** The operator's jobs, not the database's tables: look at people, look at introductions, change a rule, check the
  system.
- **Refused.** Merging the pages (a long « System » page); a second sidebar level (nothing nests deeper than a page and its siblings).
- **Cost.** Reports, audit, health and analytics are one click further than before; the sibling row is always visible.
- **Signal.** The operator tasks run end to end in the QA sessions without hunting for a page.

## 3. On a phone the header gives up its words, not its actions

- **Decision.** At phone width the operator header shows a short « DEV » badge (the version from `sm` up) and « Sign out » as its
  icon (its name stays for assistive technology). The photo status chips wrap instead of poking out of the screen.
- **Problem.** The crawl found the operator header 14 to 58 px wider than a 390 px phone on every page, and a photo's status chip
  running past the screen edge.
- **Principle.** One thumb, one column: nothing scrolls sideways; a label is shortened before an action is hidden.
- **Refused.** Hiding the language or theme switches on a phone; a horizontally scrolling header.
- **Cost.** The version number is not visible on a phone (it is in the footer of the sidebar).
- **Signal.** `scripts/check-console.mjs` stays green in CI; any new page that overflows fails it.
