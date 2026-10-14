import { describe, expect, it } from "vitest";

import { CONNECTION_NAMES, connectionConfig, databaseUrl, DEV_DATABASE_URL, directDatabaseUrl } from "./connection";

describe("connections", () => {
  it("uses the local database outside production only", () => {
    expect(databaseUrl({})).toBe(DEV_DATABASE_URL);
    expect(() => databaseUrl({ NODE_ENV: "production" })).toThrow(/DATABASE_URL is required/);
  });

  it("LISTEN and migrations take DATABASE_DIRECT_URL, else DATABASE_URL", () => {
    expect(directDatabaseUrl({ DATABASE_URL: "postgres://pooled/db", DATABASE_DIRECT_URL: "postgres://direct/db" })).toBe("postgres://direct/db");
    expect(directDatabaseUrl({ DATABASE_URL: "postgres://pooled/db", DATABASE_DIRECT_URL: " " })).toBe("postgres://pooled/db");
  });

  it("names every connection", () => {
    expect(Object.values(CONNECTION_NAMES)).toEqual(["yasakia-web", "yasakia-listen", "yasakia-migrate", "yasakia-seed"]);
    expect(connectionConfig("postgres://h/db", CONNECTION_NAMES.listen, {})).toEqual({ connectionString: "postgres://h/db", application_name: "yasakia-listen" });
  });

  it("verifies a managed database's certificate against DATABASE_CA_CERT (the URL's sslmode dropped)", () => {
    const config = connectionConfig("postgres://u:p@h:25060/db?sslmode=require", CONNECTION_NAMES.web, { DATABASE_CA_CERT: "-----BEGIN CERTIFICATE-----" });
    expect(config.connectionString).toBe("postgres://u:p@h:25060/db");
    expect(config.ssl).toEqual({ ca: "-----BEGIN CERTIFICATE-----", rejectUnauthorized: true });
    expect(config.application_name).toBe("yasakia-web");
  });
});
