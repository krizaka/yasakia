"use client";

import { krizakaFetch, useMutation } from "@krizaka/query";
import { Alert } from "@krizaka/ui/alert";
import { createKrizakaForm } from "@krizaka/ui/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { errorKey } from "@/lib/client";
import { useSay } from "@/lib/i18n-client";

/** Two steps on @krizaka/ui's form: the e-mail (a code is sent, the same answer for every address), then the code and the new password. */
const emailStep = createKrizakaForm({ schema: z.object({ email: z.string().trim().min(1).email() }), defaultValues: { email: "" } });
const codeStep = createKrizakaForm({
  schema: z.object({ code: z.string().regex(/^\d{6}$/), password: z.string().min(1).max(256) }),
  defaultValues: { code: "", password: "" },
});

export function ResetForm({ locale, signInHref }: { locale: "en" | "fr"; signInHref: string }) {
  const { say } = useSay();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const send = useMutation({ mutationFn: (body: { email: string; locale: "en" | "fr" }) => krizakaFetch("/api/auth/password/forgot", { method: "POST", json: body }) });
  const reset = useMutation({ mutationFn: (body: { email: string; code: string; password: string }) => krizakaFetch("/api/auth/password/reset", { method: "POST", json: body }) });
  const i18n = { t: (key: string, vars?: Record<string, unknown>) => say(key, vars as Record<string, string | number> | undefined), locale };

  const askForCode = emailStep.useForm({
    i18n,
    onSubmit: async (values) => {
      setProblem(null);
      try {
        await send.mutateAsync({ email: values.email, locale });
        setEmail(values.email);
      } catch (error) {
        setProblem(say(`errors.${errorKey(error)}`));
      }
    },
  });
  const setNew = codeStep.useForm({
    i18n,
    onSubmit: async (values) => {
      setProblem(null);
      try {
        await reset.mutateAsync({ email: email ?? "", code: values.code, password: values.password });
        setDone(true);
        router.refresh();
      } catch (error) {
        setProblem(say(`errors.${errorKey(error)}`));
      }
    },
  });

  if (done) return <Alert tone="success">{say("reset.done")}</Alert>;
  if (!email) {
    return (
      <askForCode.Form aria-label={say("reset.title")} className="flex flex-col gap-4">
        <askForCode.TextField name="email" label={say("reset.email")} type="email" autoComplete="username" />
        {problem ? <Alert tone="danger">{problem}</Alert> : null}
        <askForCode.Submit size="lg" shape="cut" className="w-full">
          {say("reset.sendCode")}
        </askForCode.Submit>
        <Link className="text-sm underline" href={signInHref}>
          {say("reset.back")}
        </Link>
      </askForCode.Form>
    );
  }
  return (
    <setNew.Form aria-label={say("reset.title")} className="flex flex-col gap-4">
      <p className="text-sm text-fg-secondary">{say("reset.sent")}</p>
      <setNew.TextField name="code" label={say("reset.code")} inputMode="numeric" autoComplete="one-time-code" />
      <setNew.TextField name="password" label={say("reset.password")} type="password" autoComplete="new-password" />
      <p className="text-xs text-fg-muted">{say("reset.passwordHint")}</p>
      {problem ? <Alert tone="danger">{problem}</Alert> : null}
      <setNew.Submit size="lg" shape="cut" className="w-full">
        {say("reset.submit")}
      </setNew.Submit>
      <button type="button" className="text-left text-sm underline" onClick={() => setEmail(null)}>
        {say("reset.changeEmail")}
      </button>
    </setNew.Form>
  );
}
