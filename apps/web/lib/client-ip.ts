/**
 * The client's IP address, as far as this deployment can trust it. `X-Forwarded-For` is a list each proxy appends to:
 * its LEFT end is whatever the client sent (anyone can write `X-Forwarded-For: 1.2.3.4`), so a limit keyed on it is a
 * limit the attacker chooses. The address the last trusted proxy saw is read from the RIGHT:
 *
 * - `ABUSE_CLIENT_IP_HEADER` (e.g. `do-connecting-ip` on DigitalOcean App Platform, `cf-connecting-ip` behind Cloudflare):
 *   a header the edge sets and overwrites, read first when present;
 * - otherwise the entry `ABUSE_TRUSTED_PROXY_HOPS` (default 1: one proxy) from the right of `X-Forwarded-For`, then `X-Real-IP`;
 * - otherwise null (local development without a proxy).
 */
export function clientIp(headers: Headers, env: Record<string, string | undefined> = process.env): string | null {
  const custom = env.ABUSE_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (custom) {
    const value = headers.get(custom)?.split(",")[0]?.trim();
    if (value && isIp(value)) return value;
  }
  const hops = Math.max(1, Math.min(10, Number(env.ABUSE_TRUSTED_PROXY_HOPS) || 1));
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const fromRight = chain[chain.length - hops];
  if (fromRight && isIp(fromRight)) return fromRight;
  const real = headers.get("x-real-ip")?.trim();
  if (real && isIp(real)) return real;
  return null;
}

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]+(?:%\w+)?$/i;
function isIp(value: string): boolean {
  return (IPV4.test(value) && value.split(".").every((n) => Number(n) <= 255)) || (value.includes(":") && IPV6.test(value));
}
