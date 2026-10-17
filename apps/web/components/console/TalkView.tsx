"use client";

import { LockIcon } from "@krizaka/icons";
import { defineKeys, krizakaFetch, useMutation, useQuery, useQueryClient } from "@krizaka/query";
import { Alert } from "@krizaka/ui/alert";
import { Badge } from "@krizaka/ui/badge";
import { MessageBubble, MessageComposer, TypingIndicator } from "@krizaka/ui/chat";
import { DashboardLayout, Widget } from "@krizaka/ui/dashboard-layout";
import { DescriptionList } from "@krizaka/ui/description-list";
import { useEffect, useRef, useState } from "react";

import type { AgentDto } from "@/lib/agent-dto";
import { errorKey } from "@/lib/client";
import { useSay } from "@/lib/i18n-client";

const keys = defineKeys("agent", { view: () => ["view"] });

/** The agent works after it answers (it reads what you said, then writes the portrait): the page looks again for this long after a message. */
const FOLLOW_UP_MS = 45_000; // @fixed: a UI polling window, not a business parameter
const POLL_MS = 2_000; // @fixed: a UI polling interval

const asList = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : value == null ? [] : [String(value)]);

/**
 * The conversation: the thread (yours on the right, the agent's on the left), the composer, what the agent understood
 * in your own words, and — once it knows enough — your portrait. The page renders from the server (`initial`); after a
 * message it looks again every two seconds for a while, because the understanding follows the answer.
 */
export function TalkView({ initial }: { initial: AgentDto }) {
  const { say, locale } = useSay();
  const client = useQueryClient();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState(0);
  const end = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: keys.view(),
    queryFn: ({ signal }) => krizakaFetch("/api/agent", { signal }).then((r) => (r as { agent: AgentDto }).agent),
    initialData: initial,
    staleTime: 0,
    refetchInterval: () => (lastSentAt && Date.now() - lastSentAt < FOLLOW_UP_MS ? POLL_MS : false),
  });
  const agent = query.data;

  const send = useMutation({
    mutationFn: (content: string) => krizakaFetch("/api/agent/messages", { method: "POST", json: { content } }),
    onMutate: (content) => setPending(content),
    onSuccess: () => {
      setDraft("");
      setLastSentAt(Date.now());
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: keys.view() });
      setPending(null);
    },
  });

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [agent.messages.length, pending]);

  const closed = agent.state !== "ONBOARDING";
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const thinking = send.isPending || (agent.state === "ONBOARDING" && agent.waiting);
  const submit = () => {
    const content = draft.trim();
    if (content && !send.isPending && !closed) send.mutate(content);
  };

  return (
    <DashboardLayout headingAs="h2" title={say("shell.talk")} description={say("talk.lead")}>
      <Widget level={3} title={say("talk.threadLabel")} span={2}>
        <div className="flex flex-col gap-3">
          <div role="log" aria-live="polite" aria-label={say("talk.threadLabel")} className="flex max-h-[28rem] min-h-48 flex-col gap-2 overflow-y-auto pr-1">
            {agent.messages.length === 0 && !pending ? <p className="m-auto text-center text-sm text-fg-muted">{say("talk.empty")}</p> : null}
            {agent.messages.map((m) => (
              <MessageBubble key={m.id} mine={m.role === "USER"} text={m.content} time={time.format(new Date(m.createdAt))} />
            ))}
            {pending ? <MessageBubble mine text={pending} status="sending" showStatus labels={{ status: { sending: "…" } }} /> : null}
            {thinking ? <TypingIndicator label={say("talk.typing")} showLabel /> : null}
            <div ref={end} />
          </div>
          {send.isError ? (
            <Alert tone="danger" title={say(`errors.${errorKey(send.error)}`)} />
          ) : null}
          <MessageComposer value={draft} onValueChange={setDraft} onSend={submit} placeholder={say("talk.placeholder")} sendLabel={say("talk.send")} disabledReason={closed ? say("talk.closed") : undefined} maxLength={1500} />
        </div>
      </Widget>

      <Widget level={3} title={say("talk.understoodTitle")} description={say("talk.understoodDescription")}>
        {agent.facets.length ? (
          <DescriptionList
            items={agent.facets.map((f) => ({
              term: say(`talk.facets.${f.key}`),
              details: (
                <span className="inline-flex items-start gap-1.5">
                  {f.sensitive ? <LockIcon size={14} aria-label={say("talk.sealed")} className="mt-1 shrink-0" /> : null}
                  <span>{asList(f.value).join(" · ")}</span>
                </span>
              ),
            }))}
          />
        ) : (
          <p className="text-sm text-fg-secondary">{say("talk.understoodEmpty")}</p>
        )}
      </Widget>

      {agent.portrait ? (
        <Widget level={3} title={say("talk.portraitTitle")} description={say("talk.portraitDescription")} span={2}>
          <div className="flex flex-col gap-3 text-sm text-fg-secondary">
            <div>
              <p className="font-semibold text-fg">{say("talk.portraitSelf")}</p>
              <p>{agent.portrait.self}</p>
            </div>
            <div>
              <p className="font-semibold text-fg">{say("talk.portraitSeeking")}</p>
              <p>{agent.portrait.seeking}</p>
            </div>
            <p className="text-fg-muted">{say("talk.portraitNext")}</p>
          </div>
        </Widget>
      ) : (
        <Widget level={3} title={say("talk.progressTitle")}>
          <div className="flex flex-col gap-2 text-sm text-fg-secondary">
            <p>{say("talk.progressMessages", { count: agent.progress.userTurns, min: agent.progress.minUserTurns })}</p>
            {agent.missingBasics.length ? (
              <>
                <p className="font-semibold text-fg">{say("talk.stillToLearn")}</p>
                <ul className="flex flex-wrap gap-2">
                  {agent.missingBasics.map((b) => (
                    <li key={b}>
                      <Badge tone="neutral" size="sm">
                        {say(`talk.basics.${b}`)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>{say("talk.allLearned")}</p>
            )}
          </div>
        </Widget>
      )}
    </DashboardLayout>
  );
}
