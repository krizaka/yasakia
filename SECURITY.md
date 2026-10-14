# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/krizaka/yasakia/security/advisories/new) or by e-mail to
**security@krizaka.com**. Do not open a public issue. We acknowledge reports within 72 hours.

A person in danger, a minor on the app, a threat: use the in-app **Report** button (persisted and reviewed first) or
call the authorities — never an issue.

## Security model (summary)

- **Sessions**: sign-in by a 6-digit e-mail code (kept as a keyed hash, 10 minutes, 5 attempts, used once, rate-limited
  per address and IP); a stateless HMAC-SHA256-signed token for the native app, sent as `Authorization: Bearer`, 30
  days, constant-time verification; the account is re-read on every request (suspension, deletion and "sign out
  everywhere" apply at once). No password, no cookie.
- **Age**: 18+ checked by the server at account creation.
- **Photos**: private; uploaded to a URL signed for one photo and 300 s, checked against the declared type and size,
  re-encoded with every metadata block stripped (GPS included); viewed only through URLs signed for one viewer for 300 s
  after an access check. No raw media URL or storage key in any answer (enforced by the end-to-end suite).
- **Data at rest**: sensitive facets, report details and exports sealed with AES-256-GCM, bound to their row; the key is
  per environment, mandatory in production, rotatable.
- **Position**: rounded to ~1 km before it is stored.
- **Operators**: `/api/admin/*` needs a service token **and** an allowed IP address (none allowed by default in production).
- **Configuration**: a production server refuses to start without its secrets; no demo mode.
- **HTTP**: Content-Security-Policy `default-src 'self'` (no third-party script, frame or font), HSTS, `nosniff`,
  `X-Frame-Options: DENY`, COOP `same-origin`, strict referrer and permissions policies.
