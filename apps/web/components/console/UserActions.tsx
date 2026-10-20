"use client";

import { krizakaFetch, useMutation } from "@krizaka/query";
import { Alert } from "@krizaka/ui/alert";
import { Button } from "@krizaka/ui/button";
import { ConfirmButton } from "@krizaka/ui/confirm-button";
import { Dialog } from "@krizaka/ui/dialog";
import { createKrizakaForm } from "@krizaka/ui/form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { errorKey } from "@/lib/client";
import { useSay } from "@/lib/i18n-client";

const suspension = createKrizakaForm({
  schema: z.object({ reason: z.string().trim().min(3, "form.errors.reasonShort").max(200) }),
  defaultValues: { reason: "" },
});

/** Suspend (with a reason, in a dialog) or restore (two presses) one account; the page refreshes from the server after. */
export function UserActions({ id, status, role }: { id: string; status: "ACTIVE" | "PAUSED" | "SUSPENDED"; role: "USER" | "ADMIN" }) {
  const { say, locale } = useSay();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const suspend = useMutation({
    mutationFn: (body: { reason: string }) => krizakaFetch(`/api/admin/users/${id}/suspend`, { method: "POST", json: body }),
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const restore = useMutation({
    mutationFn: () => krizakaFetch(`/api/admin/users/${id}/restore`, { method: "POST" }),
    onSuccess: () => router.refresh(),
    onError: (error) => setProblem(say(`errors.${errorKey(error)}`)),
  });
  const form = suspension.useForm({
    i18n: { t: (key, vars) => say(key, vars as Record<string, string | number> | undefined), locale },
    onSubmit: async (values) => {
      setProblem(null);
      try {
        await suspend.mutateAsync(values);
      } catch (error) {
        setProblem(say(`errors.${errorKey(error)}`));
      }
    },
  });
  if (status === "SUSPENDED") {
    return (
      <div className="flex flex-col items-end gap-2">
        <ConfirmButton variant="secondary" size="sm" confirmLabel={say("admin.user.restoreConfirm")} loading={restore.isPending} onConfirm={() => restore.mutate()}>
          {say("admin.user.restore")}
        </ConfirmButton>
        {problem ? <Alert tone="danger">{problem}</Alert> : null}
      </div>
    );
  }
  if (role === "ADMIN") return null;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="danger" size="sm">
          {say("admin.user.suspend")}
        </Button>
      </Dialog.Trigger>
      <Dialog.Content closeLabel={say("shell.closeMenu")} size="md">
        <Dialog.Header>
          <Dialog.Title>{say("admin.user.suspendTitle")}</Dialog.Title>
          <Dialog.Description>{say("admin.user.suspendDescription")}</Dialog.Description>
        </Dialog.Header>
        <form.Form method="post" aria-label={say("admin.user.suspendTitle")} className="flex flex-col gap-4">
          <Dialog.Body className="flex flex-col gap-4">
            <form.TextField name="reason" label={say("admin.user.suspendReason")} hint={say("admin.user.suspendReasonHint")} maxLength={200} />
            {problem ? <Alert tone="danger">{problem}</Alert> : null}
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost">
                {say("admin.user.cancel")}
              </Button>
            </Dialog.Close>
            <form.Submit variant="danger">
              {say("admin.user.suspendSubmit")}
            </form.Submit>
          </Dialog.Footer>
        </form.Form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
