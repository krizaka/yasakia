"use client";

import { krizakaFetch, useMutation } from "@krizaka/query";
import { Alert } from "@krizaka/ui/alert";
import { Button } from "@krizaka/ui/button";
import { ConfirmButton } from "@krizaka/ui/confirm-button";
import { Field, Input } from "@krizaka/ui/field";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorKey } from "@/lib/client";
import { useSay } from "@/lib/i18n-client";

/** The rest of what an operator does to an account: end its sessions, change its role, erase it (Law 25). Never on yourself. */
export function AccountActions({ id, email, role, self }: { id: string; email: string; role: "USER" | "ADMIN"; self: boolean }) {
  const { say, locale } = useSay();
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const fail = (error: unknown) => {
    setNote(null);
    setProblem(say(`errors.${errorKey(error)}`));
  };
  const revoke = useMutation({
    mutationFn: () => krizakaFetch(`/api/admin/users/${id}/sessions`, { method: "POST" }) as Promise<{ revoked: number }>,
    onSuccess: (r) => {
      setProblem(null);
      setNote(say("admin.user.sessionsRevoked", { count: r.revoked }));
      router.refresh();
    },
    onError: fail,
  });
  const changeRole = useMutation({
    mutationFn: () => krizakaFetch(`/api/admin/users/${id}/role`, { method: "POST", json: { role: role === "ADMIN" ? "USER" : "ADMIN" } }),
    onSuccess: () => {
      setProblem(null);
      router.refresh();
    },
    onError: fail,
  });
  const erase = useMutation({
    mutationFn: () => krizakaFetch(`/api/admin/users/${id}`, { method: "DELETE", json: { confirmEmail: confirm } }),
    onSuccess: () => router.push(`/app/${locale}/admin/users`),
    onError: fail,
  });
  if (self) return <p className="text-sm text-fg-muted">{say("admin.user.selfNote")}</p>;
  return (
    <section className="flex flex-col gap-4" aria-label={say("admin.user.accountActions")}>
      {problem ? <Alert tone="danger">{problem}</Alert> : null}
      {note ? <Alert tone="success">{note}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <ConfirmButton variant="secondary" size="sm" confirmLabel={say("admin.user.revokeConfirm")} loading={revoke.isPending} onConfirm={() => revoke.mutate()}>
          {say("admin.user.revokeSessions")}
        </ConfirmButton>
        <ConfirmButton variant="secondary" size="sm" confirmLabel={say(role === "ADMIN" ? "admin.user.makeUserConfirm" : "admin.user.makeAdminConfirm")} loading={changeRole.isPending} onConfirm={() => changeRole.mutate()}>
          {say(role === "ADMIN" ? "admin.user.makeUser" : "admin.user.makeAdmin")}
        </ConfirmButton>
      </div>
      {role === "ADMIN" ? null : (
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
          <h3 className="font-display text-sm font-bold text-fg">{say("admin.user.eraseTitle")}</h3>
          <p className="text-sm text-fg-secondary">{say("admin.user.eraseLead")}</p>
          <Field.Root>
            <Field.Label htmlFor="confirm-email">{say("admin.user.eraseConfirm")}</Field.Label>
            <Input id="confirm-email" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field.Root>
          <div>
            <Button variant="danger" size="sm" loading={erase.isPending} disabled={confirm.trim().toLowerCase() !== email.toLowerCase()} onClick={() => erase.mutate()}>
              {say("admin.user.eraseSubmit")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
