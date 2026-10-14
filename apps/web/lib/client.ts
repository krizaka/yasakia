import { isKrizakaApiError } from "@krizaka/query";

/** The path the app is served under (`/app` on dev.yasakia.com), inlined at build. */
export const BASE_PATH = process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "";

/** The server's stable `code` of a failed call (`INVALID_CREDENTIALS`…), when it sent one. */
export function serverCode(error: unknown): string | undefined {
  if (!isKrizakaApiError(error)) return undefined;
  const code = (error.body as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}

/** The catalogue key (under `console.errors`) that words a failed call — the server's English is never shown. */
export function errorKey(error: unknown): string {
  const code = serverCode(error);
  if (code) return code;
  if (isKrizakaApiError(error)) {
    if (error.status === 0) return "network";
    if (error.status === 429) return "RATE_LIMITED";
    if (error.status === 401) return "UNAUTHENTICATED";
    if (error.status === 503) return "UNAVAILABLE";
  }
  return "generic";
}
