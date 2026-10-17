/**
 * Universal links (iOS) and App Links (Android) — krizaka/.github#81. The app's space (`/app/*`: the talk, the batch,
 * the introductions) opens in yasakia-mobile when it is installed. The files are served only once the app's identity is
 * configured (`APP_IOS_TEAM_ID`, `APP_ANDROID_CERT_SHA256`): without it they do not exist (404), never a guess.
 * `app-links.json` at the repository root says the same for `scripts/check-app-links.mjs`.
 */

export const IOS_BUNDLE_ID = "com.krizaka.yasakia";
export const ANDROID_PACKAGE = "com.krizaka.yasakia";
export const CLAIMED_PATHS = ["/app/*"] as const;

type Env = Record<string, string | undefined>;

export function appleAppSiteAssociation(env: Env = process.env) {
  const team = env.APP_IOS_TEAM_ID?.trim();
  if (!team) return null;
  return { applinks: { details: [{ appIDs: [`${team}.${IOS_BUNDLE_ID}`], components: CLAIMED_PATHS.map((p) => ({ "/": p })) }] } };
}

export function assetLinks(env: Env = process.env) {
  const prints = (env.APP_ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!prints.length) return null;
  return [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: prints } }];
}
