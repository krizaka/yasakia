"use client";

import { krizakaFetch, useMutation } from "@krizaka/query";
import { Alert } from "@krizaka/ui/alert";
import { Button } from "@krizaka/ui/button";
import { Dialog } from "@krizaka/ui/dialog";
import { createKrizakaForm } from "@krizaka/ui/form";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { z } from "zod";

import { errorKey } from "@/lib/client";
import { useSay } from "@/lib/i18n-client";

export interface RuleFieldView {
  key: string;
  min: number;
  max: number;
  step: number;
}

const reason = z.string().trim().min(3, "form.errors.reasonShort").max(300);
const Published = z.object({ version: z.number(), changed: z.array(z.string()) });
type Published = z.infer<typeof Published>;

/**
 * Publish a new version of one rule set (each number on a slider within the bounds the code holds, a reason) or restore an
 * earlier one (a menu of versions, a reason). Both publish a new version — the history is append-only — and are audited.
 */
export function RuleSetActions({ domain, params, fields, versions }: { domain: string; params: Record<string, unknown>; fields: readonly RuleFieldView[]; versions: readonly number[] }) {
  const { say, locale } = useSay();
  const router = useRouter();
  const [open, setOpen] = useState<"publish" | "restore" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const i18n = { t: (key: string, vars?: unknown) => say(key, vars as Record<string, string | number> | undefined), locale };

  const publishForm = useMemo(
    () =>
      createKrizakaForm({
        // The numbers are known at run time (the schema's own bounds, from the server): the form's keys are plain strings.
        schema: z.object({ ...Object.fromEntries(fields.map((f) => [f.key, z.number().min(f.min).max(f.max)])), reason }) as z.ZodObject<Record<string, z.ZodType>>,
        defaultValues: { ...Object.fromEntries(fields.map((f) => [f.key, Number(params[f.key])])), reason: "" },
      }),
    [fields, params],
  );
  const restoreForm = useMemo(() => createKrizakaForm({ schema: z.object({ version: z.string().min(1, "form.errors.required"), reason }), defaultValues: { version: "", reason: "" } }), []);

  const answered = (result: Published) => {
    setOpen(null);
    setDone(say("admin.rules.published", { version: result.version, changed: result.changed.map((k) => say(`admin.rules.params.${k}`)).join(", ") }));
    router.refresh();
  };
  const publish = useMutation({
    mutationFn: (body: { params: Record<string, unknown>; reason: string }) => krizakaFetch(`/api/admin/rule-sets/${domain}`, { method: "POST", json: body, schema: Published }),
    onSuccess: answered,
  });
  const restore = useMutation({
    mutationFn: (body: { version: number; reason: string }) => krizakaFetch(`/api/admin/rule-sets/${domain}/restore`, { method: "POST", json: body, schema: Published }),
    onSuccess: answered,
  });

  const pub = publishForm.useForm({
    i18n,
    onSubmit: async (values) => {
      setProblem(null);
      const { reason: why, ...numbers } = values as Record<string, unknown>;
      try {
        await publish.mutateAsync({ params: { ...params, ...numbers }, reason: String(why) });
      } catch (error) {
        setProblem(say(`errors.${errorKey(error)}`));
      }
    },
  });
  const res = restoreForm.useForm({
    i18n,
    onSubmit: async (values) => {
      setProblem(null);
      try {
        await restore.mutateAsync({ version: Number(values.version), reason: values.reason });
      } catch (error) {
        setProblem(say(`errors.${errorKey(error)}`));
      }
    },
  });

  const change = (next: "publish" | "restore" | null) => {
    setProblem(null);
    setOpen(next);
  };

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex flex-wrap gap-2">
        <Dialog.Root open={open === "publish"} onOpenChange={(o) => change(o ? "publish" : null)}>
          <Dialog.Trigger asChild>
            <Button variant="primary" size="sm">
              {say("admin.rules.publish")}
            </Button>
          </Dialog.Trigger>
          <Dialog.Content closeLabel={say("shell.closeMenu")} size="md">
            <Dialog.Header>
              <Dialog.Title>{say("admin.rules.publishTitle", { domain: say(`admin.rules.domains.${domain}`) })}</Dialog.Title>
              <Dialog.Description>{say("admin.rules.publishDescription")}</Dialog.Description>
            </Dialog.Header>
            <pub.Form method="post" aria-label={say("admin.rules.publish")} className="flex flex-col gap-4">
              <Dialog.Body className="flex flex-col gap-4">
                {fields.map((f) => (
                  <pub.Slider key={f.key} name={f.key} label={say(`admin.rules.params.${f.key}`)} hint={say("admin.rules.now", { value: String(params[f.key]) })} min={f.min} max={f.max} step={f.step} />
                ))}
                <pub.TextField name="reason" label={say("admin.rules.reason")} hint={say("admin.rules.reasonHint")} maxLength={300} />
                {problem ? <Alert tone="danger">{problem}</Alert> : null}
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.Close asChild>
                  <Button type="button" variant="ghost">
                    {say("admin.user.cancel")}
                  </Button>
                </Dialog.Close>
                <pub.Submit variant="primary">
                  {say("admin.rules.publishSubmit")}
                </pub.Submit>
              </Dialog.Footer>
            </pub.Form>
          </Dialog.Content>
        </Dialog.Root>
        {versions.length > 0 ? (
          <Dialog.Root open={open === "restore"} onOpenChange={(o) => change(o ? "restore" : null)}>
            <Dialog.Trigger asChild>
              <Button variant="secondary" size="sm">
                {say("admin.rules.restore")}
              </Button>
            </Dialog.Trigger>
            <Dialog.Content closeLabel={say("shell.closeMenu")} size="md">
              <Dialog.Header>
                <Dialog.Title>{say("admin.rules.restoreTitle", { domain: say(`admin.rules.domains.${domain}`) })}</Dialog.Title>
                <Dialog.Description>{say("admin.rules.restoreDescription")}</Dialog.Description>
              </Dialog.Header>
              <res.Form method="post" aria-label={say("admin.rules.restore")} className="flex flex-col gap-4">
                <Dialog.Body className="flex flex-col gap-4">
                  <res.Select name="version" label={say("admin.rules.version")} placeholder={say("admin.rules.chooseVersion")} options={versions.map((v) => ({ value: String(v), label: say("admin.rules.versionLabel", { version: v }) }))} />
                  <res.TextField name="reason" label={say("admin.rules.reason")} hint={say("admin.rules.reasonHint")} maxLength={300} />
                  {problem ? <Alert tone="danger">{problem}</Alert> : null}
                </Dialog.Body>
                <Dialog.Footer>
                  <Dialog.Close asChild>
                    <Button type="button" variant="ghost">
                      {say("admin.user.cancel")}
                    </Button>
                  </Dialog.Close>
                  <res.Submit variant="primary">
                    {say("admin.rules.restoreSubmit")}
                  </res.Submit>
                </Dialog.Footer>
              </res.Form>
            </Dialog.Content>
          </Dialog.Root>
        ) : null}
      </div>
      {done ? <Alert tone="success">{done}</Alert> : null}
    </div>
  );
}
