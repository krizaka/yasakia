import { buildPayload, parseVersion } from "@krizaka/app-config";
import { describe, expect, it } from "vitest";

import { recordFromRow } from "./app-config";
import { appleAppSiteAssociation, assetLinks, CLAIMED_PATHS } from "./app-links";

const row = {
  platform: "ios",
  min_supported_version: "1.2.0",
  latest_version: "1.4.0",
  update_override: null,
  store_url: null,
  maintenance_on: false,
  maintenance_message: {},
  message: { en: "A new version is out.", fr: "Une nouvelle version est là." },
  contract_min: 1,
  contract_max: 1,
  contract_sunset: null,
  flags: {},
  revision: 3,
  updated_at: new Date("2026-10-17T12:00:00Z"),
  updated_by: "seed",
};

describe("the app-version contract (krizaka/.github#75): the row is the record", () => {
  it("maps a database row to the contract's record, dates as ISO strings", () => {
    const record = recordFromRow(row);
    expect(record).toMatchObject({ platform: "ios", minSupportedVersion: "1.2.0", latestVersion: "1.4.0", updateOverride: null, contractMin: 1, revision: 3, updatedAt: "2026-10-17T12:00:00.000Z" });
  });
  it("forces an app below the minimum, suggests to one below the latest, leaves the latest alone — in its language", () => {
    const record = recordFromRow(row);
    expect(buildPayload(record, parseVersion("1.0.0"), "fr").updateMode).toBe("force");
    expect(buildPayload(record, parseVersion("1.3.0"), "fr")).toMatchObject({ updateMode: "soft", message: "Une nouvelle version est là." });
    expect(buildPayload(record, parseVersion("1.4.0"), "en").updateMode).toBe("none");
  });
  it("refuses a platform the contract does not know", () => {
    expect(() => recordFromRow({ ...row, platform: "symbian" })).toThrow();
  });
});

describe("universal links and App Links (krizaka/.github#81): served only when the app's identity is configured", () => {
  it("claims the app's space and nothing else", () => {
    expect(CLAIMED_PATHS).toEqual(["/app/*"]);
  });
  it("names the iOS app by its Team ID and bundle id, or is not served", () => {
    expect(appleAppSiteAssociation({})).toBeNull();
    expect(appleAppSiteAssociation({ APP_IOS_TEAM_ID: "ABCDE12345" })).toEqual({ applinks: { details: [{ appIDs: ["ABCDE12345.com.krizaka.yasakia"], components: [{ "/": "/app/*" }] }] } });
  });
  it("names the Android app by its package and signing fingerprints, or is not served", () => {
    expect(assetLinks({})).toBeNull();
    const fp = Array.from({ length: 32 }, () => "AB").join(":");
    expect(assetLinks({ APP_ANDROID_CERT_SHA256: `${fp}, ${fp.replace(/AB/g, "CD")}` })).toEqual([
      { relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "com.krizaka.yasakia", sha256_cert_fingerprints: [fp, fp.replace(/AB/g, "CD")] } },
    ]);
  });
});
