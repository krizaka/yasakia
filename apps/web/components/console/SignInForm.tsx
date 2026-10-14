"use client";

import { krizakaFetch, useMutation } from "@krizaka/query";
import { Alert } from "@krizaka/ui/alert";
import { createKrizakaForm } from "@krizaka/ui/form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { errorKey } from "@/lib/client";
import { useSay } from "@/lib/i18n-client";

const signIn = createKrizakaForm({
  schema: z.object({ email: z.string().trim().min(1).email(), password: z.string().min(1) }),
  defaultValues: { email: "", password: "" },
});

/** E-mail and password on @krizaka/ui's form; the server sets the session cookie, the page then opens the home. */
export function SignInForm({ next }: { next: string }) {
  const { say, locale } = useSay();
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);
  const request = useMutation({
    mutationFn: (body: { email: string; password: string }) => krizakaFetch("/api/auth/password", { method: "POST", json: body }),
    onSuccess: () => {
      router.replace(next);
      router.refresh();
    },
  });
  const form = signIn.useForm({
    i18n: { t: (key, vars) => say(key, vars as Record<string, string | number> | undefined), locale },
    onSubmit: async (values) => {
      setProblem(null);
      try {
        await request.mutateAsync(values);
      } catch (error) {
        setProblem(say(`errors.${errorKey(error)}`));
      }
    },
  });
  return (
    <form.Form aria-label={say("signIn.title")} className="flex flex-col gap-4">
      <form.TextField name="email" label={say("signIn.email")} type="email" autoComplete="username" />
      <form.TextField name="password" label={say("signIn.password")} type="password" autoComplete="current-password" />
      {problem ? <Alert tone="danger">{problem}</Alert> : null}
      <form.Submit size="lg" shape="cut" shimmer className="w-full">
        {say("signIn.submit")}
      </form.Submit>
    </form.Form>
  );
}
