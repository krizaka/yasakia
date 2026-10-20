"use client";

import { defineKeys, krizakaFetch, useMutation, useQuery, useQueryClient } from "@krizaka/query";
import { Alert } from "@krizaka/ui/alert";
import { Badge } from "@krizaka/ui/badge";
import { Button } from "@krizaka/ui/button";
import { MessageBubble, MessageComposer } from "@krizaka/ui/chat";
import { DashboardLayout, Widget } from "@krizaka/ui/dashboard-layout";
import { useEffect, useRef, useState } from "react";

import { AuthenticityMark } from "@/components/console/AuthenticityMark";
import { MediaMessage } from "@/components/console/MediaMessage";
import { MediaPicker } from "@/components/console/MediaPicker";
import { errorKey } from "@/lib/client";
import { ComposerTracker } from "@/lib/composer-signals";
import { dateFormat } from "@/lib/format-date";
import { useSay } from "@/lib/i18n-client";
import type { IntroDetail } from "@/lib/intros";

const keys = defineKeys("intro", { detail: (id: string) => [id] });
/** How often an open introduction is read again while the page is open (the other's messages). */
const POLL_MS = 8000; // @fixed: interface refresh rate, not a business parameter

/**
 * One introduction: the messages, the composer while it is open (every word is typed by the person), and
 * « continue » — once both said it, it has no end. Humans talk here; the agent never reads it.
 */
export function IntroView({ initial }: { initial: IntroDetail }) {
  const { say, locale } = useSay();
  const client = useQueryClient();
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  // How the message arrives, as counters only (typing time, characters typed and pasted, deletions) — see lib/composer-signals.ts.
  const tracker = useRef(new ComposerTracker());
  const live = initial.state === "OPEN" || initial.state === "CONTINUED";
  const query = useQuery({
    queryKey: keys.detail(initial.id),
    queryFn: ({ signal }) => krizakaFetch(`/api/intros/${initial.id}`, { signal }).then((r) => (r as { intro: IntroDetail }).intro),
    initialData: initial,
    refetchInterval: live ? POLL_MS : false,
  });
  const intro = query.data;
  const reread = () => client.invalidateQueries({ queryKey: keys.detail(intro.id) });
  const send = useMutation({
    mutationFn: (body: string) => krizakaFetch(`/api/intros/${intro.id}/messages`, { method: "POST", json: { body, clientId: crypto.randomUUID(), signals: tracker.current.snapshot(performance.now()) } }),
    onSuccess: async () => {
      tracker.current.reset();
      setDraft("");
      await reread();
    },
  });
  const cont = useMutation({ mutationFn: () => krizakaFetch(`/api/intros/${intro.id}/continue`, { method: "POST" }), onSuccess: reread });

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [intro.messages.length]);

  const open = intro.state === "OPEN" && new Date(intro.expiresAt) > new Date();
  const writable = (open || intro.state === "CONTINUED") && !intro.frozen;
  const time = dateFormat(locale, { dateStyle: "short", timeStyle: "short" });
  const name = intro.them.name || say("intros.someone");
  const submit = () => {
    const body = draft.trim();
    if (body && writable && !send.isPending) send.mutate(body);
  };

  return (
    <DashboardLayout headingAs="h2" title={say("intros.with", { name })} description={open ? say("intros.openUntil", { date: time.format(new Date(intro.expiresAt)) }) : say(`intros.states.${intro.state as "OPEN" | "CONTINUED" | "FADED" | "CLOSED"}`)}>
      <Widget level={3} title={say("intros.threadLabel")} span={2}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">{say("intros.typedByYou")}</p>
          <div role="log" aria-live="polite" aria-label={say("intros.threadLabel")} className="flex max-h-[28rem] min-h-48 flex-col gap-2 overflow-y-auto pr-1">
            {intro.messages.length === 0 ? <p className="text-sm text-fg-muted">{say("intros.noMessage")}</p> : null}
            {intro.messages.map((m) => (
              <div key={m.id} className={m.mine ? "flex flex-col items-end gap-1" : "flex flex-col items-start gap-1"}>
                {m.kind === "TEXT" ? (
                  <>
                    <AuthenticityMark signal={m.signal} />
                    <MessageBubble mine={m.mine} text={m.body} time={time.format(new Date(m.createdAt))} />
                  </>
                ) : (
                  <MediaMessage introId={intro.id} message={m} />
                )}
              </div>
            ))}
            <div ref={end} />
          </div>
          {send.isError ? <Alert tone="danger" title={say(`errors.${errorKey(send.error)}`)} /> : null}
          <MediaPicker introId={intro.id} limits={intro.mediaLimits} disabled={!writable} onSent={reread} />
          <MessageComposer value={draft} onValueChange={setDraft} onSend={submit} placeholder={say("intros.placeholder")} sendLabel={say("intros.send")} inputProps={{ onBeforeInput: (e) => tracker.current.input((e.nativeEvent as InputEvent).inputType ?? "insertText", (e.nativeEvent as InputEvent).data?.length ?? 1, performance.now()), onPaste: (e) => tracker.current.input("insertFromPaste", e.clipboardData.getData("text").length, performance.now()), onKeyDown: (e) => { if (e.key === "Backspace" || e.key === "Delete") tracker.current.input("deleteContentBackward", 0, performance.now()); } }} disabledReason={writable ? undefined : intro.frozen ? say("intros.frozen") : say("intros.closed")} maxLength={2000} />
        </div>
      </Widget>
      <Widget level={3} title={name} description={intro.them.fictional ? say("batch.fictional") : undefined} span={1}>
        <div className="flex flex-col gap-4 text-sm text-fg-secondary">
          {intro.them.fictional ? (
            <Badge tone="warning" size="sm" className="w-fit">
              {say("batch.fictionalBadge")}
            </Badge>
          ) : null}
          {intro.them.about ? <p>{intro.them.about}</p> : null}
          <p className="text-fg-muted">{say("intros.agentNeverReads")}</p>
          {intro.state === "CONTINUED" ? (
            <Badge tone="success" dot className="w-fit">
              {say("intros.states.CONTINUED")}
            </Badge>
          ) : open ? (
            <div className="flex flex-col gap-2">
              <p>{intro.continuedByMe ? say("intros.waitingForThem", { name }) : say("intros.continueLead")}</p>
              {!intro.continuedByMe ? (
                <Button variant="primary" size="sm" className="w-fit" loading={cont.isPending} onClick={() => cont.mutate()}>
                  {say("intros.continue")}
                </Button>
              ) : null}
              {cont.isError ? <Alert tone="danger" title={say(`errors.${errorKey(cont.error)}`)} /> : null}
            </div>
          ) : null}
        </div>
      </Widget>
    </DashboardLayout>
  );
}
