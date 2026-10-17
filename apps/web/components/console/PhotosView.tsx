"use client";

import { defineKeys, krizakaFetch, useMutation, useQueries, useQuery, useQueryClient } from "@krizaka/query";
import { Alert } from "@krizaka/ui/alert";
import { Badge } from "@krizaka/ui/badge";
import { Button } from "@krizaka/ui/button";
import { DashboardLayout, Widget } from "@krizaka/ui/dashboard-layout";
import { type GridPhoto, PhotoGrid } from "@krizaka/ui/photo-grid";
import { Spinner } from "@krizaka/ui/spinner";
import { useRef, useState } from "react";
import { z } from "zod";

import { ButtonLink } from "@/components/console/ButtonLink";
import { Rich } from "@/components/Rich";
import { BASE_PATH, errorKey } from "@/lib/client";
import { useSay } from "@/lib/i18n-client";
import { PHOTO_CONSENT_VERSION, type PhotoCheckView } from "@/lib/photo-rules";

const keys = defineKeys("photos", { list: () => ["list"], check: () => ["check"], url: (id: string) => ["url", id] });

/** The ceiling a declaration may take (packages/media/src/limits.ts MAX_PHOTO_BYTES) and the types the server accepts. */
const MAX_BYTES = 10 * 1024 * 1024; // @fixed: the server's limit, mirrored so the person is told before the upload
const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const OwnPhotos = z.object({ photos: z.array(z.object({ id: z.string(), position: z.number(), status: z.string() })) });
const Started = z.object({ photo: z.object({ id: z.string() }), upload: z.object({ url: z.string() }) });
const Signed = z.object({ photo: z.object({ url: z.string() }) });

export interface OwnPhoto {
  id: string;
  position: number;
  status: string;
}

/** A transparent pixel: a slot shows something while its signed URL (valid 300 s) is being fetched. */
const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** The upload URL the server signs is absolute; the browser calls the same origin under the app's base path. */
function sameOrigin(url: string): string {
  const u = new URL(url);
  return `${BASE_PATH}${u.pathname}${u.search}`;
}

/**
 * The photos: six slots (@krizaka/ui's PhotoGrid), and under each the live answer of Orazaka's check — « face detected »,
 * « several faces », « something is written on it » — in words, never a score. The photos are stored as they are added (private
 * to the person); they are *used* — shown, a batch opened — only when the whole set has passed.
 */
export function PhotosView({ initial }: { initial: { photos: OwnPhoto[]; check: PhotoCheckView } }) {
  const { say, locale } = useSay();
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const list = useQuery({
    queryKey: keys.list(),
    queryFn: ({ signal }) => krizakaFetch("/api/me/photos", { signal, schema: OwnPhotos }).then((r) => r.photos),
    initialData: initial.photos,
    staleTime: 10_000,
  });
  const check = useQuery({
    queryKey: keys.check(),
    queryFn: ({ signal }) => krizakaFetch("/api/me/photos/check", { signal }).then((r) => (r as { check: PhotoCheckView }).check),
    initialData: initial.check,
    staleTime: 0,
    // The check takes seconds to a minute on the engine's side: ask again until it is no longer under way.
    refetchInterval: (query) => (query.state.data?.state === "CHECKING" || query.state.data?.state === "UNCHECKED" ? 2_000 : false), // @fixed: a poll every two seconds
  });
  const photos = [...(list.data ?? [])].filter((p) => p.status !== "UPLOADING").sort((a, b) => a.position - b.position);
  const urls = useQueries({
    queries: photos.map((p) => ({
      queryKey: keys.url(p.id),
      queryFn: ({ signal }: { signal: AbortSignal }) => krizakaFetch(`/api/photos/${p.id}?w=480`, { signal, schema: Signed }).then((r) => r.photo.url),
      staleTime: 240_000, // @fixed: the signed URL lives 300 seconds
    })),
  });
  const view = check.data;
  const refresh = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: keys.list() }), client.invalidateQueries({ queryKey: keys.check() })]);
  };

  const add = useMutation({
    mutationFn: async (file: File) => {
      const type = file.type as (typeof TYPES)[number];
      if (!TYPES.includes(type)) throw new Error("wrongType");
      if (file.size > MAX_BYTES) throw new Error("tooLarge");
      const started = await krizakaFetch("/api/me/photos", { method: "POST", json: { contentType: type, bytes: file.size }, schema: Started });
      const put = await fetch(sameOrigin(started.upload.url), { method: "PUT", headers: { "content-type": type }, body: file });
      if (!put.ok) throw new Error("failed");
      await krizakaFetch(`/api/me/photos/${started.photo.id}/complete`, { method: "PUT" });
    },
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => krizakaFetch(`/api/me/photos/${id}`, { method: "DELETE" }),
    onSettled: refresh,
  });
  const reorder = useMutation({
    mutationFn: (order: string[]) => krizakaFetch("/api/me/photos", { method: "PATCH", json: { order } }),
    onSettled: refresh,
  });
  const agree = useMutation({
    mutationFn: () => krizakaFetch("/api/me/photos/consent", { method: "PUT", json: { version: PHOTO_CONSENT_VERSION } }),
    onSettled: refresh,
  });
  const withdraw = useMutation({
    mutationFn: () => krizakaFetch("/api/me/photos/consent", { method: "DELETE" }),
    onSettled: refresh,
  });
  const recheck = useMutation({
    mutationFn: () => krizakaFetch("/api/me/photos/check", { method: "POST" }),
    onSettled: refresh,
  });

  const rules = view?.rules ?? initial.check.rules;
  const room = Math.max(0, rules.maxPhotos - photos.length);
  const onFiles = async (files: FileList | null) => {
    setNotice(null);
    for (const file of Array.from(files ?? []).slice(0, room)) {
      try {
        await add.mutateAsync(file);
      } catch (error) {
        const message = error instanceof Error && ["wrongType", "tooLarge", "failed"].includes(error.message) ? say(`photos.upload.${error.message}`) : say(`errors.${errorKey(error)}`);
        setNotice(message);
        break;
      }
    }
    if (input.current) input.current.value = "";
  };

  const grid: GridPhoto[] = photos.map((p, i) => ({ id: p.id, src: urls[i]?.data ?? BLANK, alt: say("photos.grid.photo", { position: i + 1 }) }));
  const onValueChange = (next: GridPhoto[]) => {
    if (next.length < grid.length) {
      const gone = grid.find((g) => !next.some((n) => n.id === g.id));
      if (gone) remove.mutate(gone.id);
    } else reorder.mutate(next.map((n) => n.id));
  };

  const busy = add.isPending || remove.isPending || reorder.isPending;
  const state = view?.state ?? "EMPTY";
  const verified = view?.verified ?? false;
  const placeholders = { min: rules.minPhotos, max: rules.maxPhotos, faces: rules.minFacePhotos };

  return (
    <DashboardLayout headingAs="h2" title={say("shell.photos")} description={say("photos.lead", placeholders)}>
      <Widget level={3} title={say("photos.add")} span={3}>
        <div className="flex flex-col gap-4">
          <PhotoGrid
            value={grid}
            onValueChange={onValueChange}
            onAdd={room > 0 && !busy ? () => input.current?.click() : undefined}
            slots={rules.maxPhotos}
            required={rules.minPhotos}
            labels={{
              add: say("photos.grid.add"),
              main: say("photos.grid.main"),
              photo: (position) => say("photos.grid.photo", { position }),
              moveEarlier: say("photos.grid.moveEarlier"),
              moveLater: say("photos.grid.moveLater"),
              remove: say("photos.grid.remove"),
              moved: (position) => say("photos.grid.moved", { position }),
            }}
          />
          <input ref={input} type="file" accept={TYPES.join(",")} multiple hidden onChange={(e) => void onFiles(e.target.files)} data-testid="photo-input" />
          {add.isPending ? (
            <p className="inline-flex items-center gap-2 text-sm text-fg-secondary" role="status">
              <Spinner size="sm" label={say("photos.upload.working")} /> {say("photos.upload.working")}
            </p>
          ) : null}
          {notice ? <Alert tone="danger" title={notice} /> : null}
          {remove.isError ? <Alert tone="danger" title={say("photos.removeFailed")} /> : null}
          {reorder.isError ? <Alert tone="danger" title={say(`errors.${errorKey(reorder.error)}`)} /> : null}
        </div>
      </Widget>

      {view?.comparison === "NEEDS_CONSENT" ? (
        <Widget level={3} title={say("photos.consent.title")} description={say("photos.consent.lead")} span={3}>
          <div className="flex flex-col gap-3 text-sm text-fg-secondary">
            <p>{say("photos.consent.purpose")}</p>
            <p>{say("photos.consent.nothingKept")}</p>
            <p>{say("photos.consent.optional")}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="md" variant="primary" shape="cut" loading={agree.isPending} onClick={() => agree.mutate()}>
                {say("photos.consent.accept")}
              </Button>
            </div>
            {agree.isError ? <Alert tone="danger" title={say(`errors.${errorKey(agree.error)}`)} /> : null}
          </div>
        </Widget>
      ) : null}

      <Widget level={3} title={say(`photos.state.${state}`)} span={3}>
        <div className="flex flex-col gap-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={(view?.counts.photos ?? 0) >= rules.minPhotos ? "success" : "neutral"} dot>
              {say("photos.counts", { count: view?.counts.photos ?? photos.length, min: rules.minPhotos, max: rules.maxPhotos })}
            </Badge>
            <Badge tone={(view?.counts.facePhotos ?? 0) >= rules.minFacePhotos ? "success" : "neutral"} dot>
              {say("photos.faceCount", { count: view?.counts.facePhotos ?? 0, min: rules.minFacePhotos })}
            </Badge>
            {state === "CHECKING" || state === "UNCHECKED" ? <Spinner size="sm" label={say("photos.status.CHECKING")} /> : null}
          </div>
          {view && view.state === "FAILED" ? (
            <ul className="list-disc pl-5 text-sm text-fg-secondary">
              {view.blockers.map((b) => (
                <li key={b.code}>{say(`photos.blocker.${b.code}`, placeholders)}</li>
              ))}
            </ul>
          ) : null}
          <ol className="flex flex-col gap-2">
            {(view?.photos ?? []).map((p, i) => (
              <li key={p.id} className="flex flex-col gap-1 text-sm">
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{say("photos.grid.photo", { position: i + 1 })}</span>
                  <Badge tone={p.check === "FACE" ? "success" : "neutral"} size="sm">
                    {say(`photos.status.${p.check === "PENDING" && (state === "CHECKING" || state === "UNCHECKED") ? "CHECKING" : p.check}`)}
                  </Badge>
                </span>
                {p.findings.map((code) => (
                  <span key={code} className={code === "UNVERIFIED" || code === "GROUP_PHOTO" ? "text-fg-muted" : "text-danger-text"}>
                    {say(`photos.finding.${code}`)}
                  </span>
                ))}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            {state === "UNAVAILABLE" || state === "FAILED" ? (
              <Button size="sm" variant="secondary" loading={recheck.isPending} onClick={() => recheck.mutate()}>
                {say("photos.retry")}
              </Button>
            ) : null}
            {verified ? (
              <ButtonLink href={`/app/${locale}/batch`} size="md" variant="primary" shape="cut">
                {say("photos.continue")}
              </ButtonLink>
            ) : (
              <Button size="md" variant="primary" shape="cut" disabled>
                {say("photos.continue")}
              </Button>
            )}
            {verified ? null : <span className="text-sm text-fg-muted">{say("photos.continueHint")}</span>}
          </div>
        </div>
      </Widget>

      <Widget level={3} title={say("photos.privacy.title")} description={say("photos.privacy.intro")} span={3}>
        <div className="flex flex-col gap-2 text-sm text-fg-secondary">
          <ul className="list-disc pl-5">
            {(["faces", "same", "questions", "not"] as const).map((n) => (
              <li key={n}>
                <Rich text={say(`photos.privacy.items.${n}`)} />
              </li>
            ))}
          </ul>
          <p>{say(`photos.privacy.comparison.${view?.comparison ?? "OFF"}`)}</p>
          {view?.comparison === "ON" ? (
            <div>
              <Button size="sm" variant="ghost" loading={withdraw.isPending} onClick={() => withdraw.mutate()}>
                {say("photos.consent.withdraw")}
              </Button>
            </div>
          ) : null}
          <p>{say("photos.privacy.limits")}</p>
          <p>
            <a className="underline" href={`/${locale}/privacy`}>
              {say("photos.privacy.more")}
            </a>
          </p>
        </div>
      </Widget>
    </DashboardLayout>
  );
}
