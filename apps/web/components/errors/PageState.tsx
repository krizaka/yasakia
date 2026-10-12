import { Mascot } from "@krizaka/ui/mascots";
import { SectionBackdrop } from "@krizaka/ui/section-backdrop";

/**
 * A whole-page state — an error, a page that does not exist — in the Krizaka language (Orochia's PageState): the
 * brand's section backdrop, a bird of the flock (the falcon watches over errors, the owl read everything and did not
 * find it), words that say what happened and what to do, the ways out, and the error reference when there is one.
 */
export function PageState({
  bird,
  mood,
  eyebrow,
  title,
  body,
  actions,
  reference,
  as = "section",
}: {
  bird: "falcon" | "owl";
  mood: "error" | "empty" | "thinking";
  eyebrow: string;
  title: string;
  body: string;
  actions: React.ReactNode;
  reference?: React.ReactNode;
  as?: "section" | "main";
}) {
  const page = (
    <SectionBackdrop as="section" className="flex min-h-[70vh] items-center overflow-hidden px-4 py-14 sm:px-6 sm:py-20">
      <div className="relative mx-auto flex w-full max-w-xl flex-col items-center text-center">
        <span className="flex h-36 w-36 items-center justify-center rounded-full border border-accent/20 bg-accent/10 shadow-lg sm:h-40 sm:w-40" aria-hidden>
          <Mascot bird={bird} mood={mood} size={112} />
        </span>
        <p className="mt-6 text-[10px] font-bold uppercase tracking-widest text-fg-accent">{eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-fg text-balance sm:text-5xl">{title}</h1>
        <p className="mt-3 max-w-md text-sm text-fg-secondary text-pretty sm:text-base">{body}</p>
        <div className="mt-7 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">{actions}</div>
        {reference && <div className="mt-8">{reference}</div>}
      </div>
    </SectionBackdrop>
  );
  return as === "main" ? <main>{page}</main> : page;
}
