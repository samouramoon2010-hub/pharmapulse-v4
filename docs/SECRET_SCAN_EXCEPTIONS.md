# Secret Scan — Documented Exceptions

This file records narrowly-scoped exceptions found during repository
secret scans. It does not broadly exempt any file pattern from future
scans — each entry documents a specific, reviewed file and the exact
reason it was classified as non-secret.

## `.env` (tracked since commit `3c47da6`, pre-dating this audit)

**Finding (Foundation Closure Repair, 2026-06-23):** `.env` is tracked in
git history. Variable names present:

- `VITE_DEMO_MODE` — boolean application feature flag. Not a credential.
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`

**Classification:** Firebase Web SDK public client configuration. Per
Firebase's own documentation, these values identify a Firebase project
and are safe to expose in client-side code — access control is enforced
by Firestore Security Rules (see `firestore.rules`), not by the secrecy
of these values. None of the following were found: service-account
private key, private key material, client secret, admin credential,
database password, access token, refresh token, GitHub token, or any
AI-provider/private API key.

**Disposition:**
- No git history rewrite performed as part of this closure.
- `.env` remains tracked; this is recorded as repository-security
  technical debt, not resolved.
- `.env.example` was verified to contain placeholders only (no real
  values) — confirmed safe.
- This exception applies **only** to the specific variable names listed
  above, in this specific file. It does not exempt `.env` from future
  scans, and does not extend to any other `.env*` file or to any new
  variable added to this file later. Any future addition to `.env` must
  be re-classified before being treated as covered by this exception.

**Recommended follow-up (not performed in this closure, tracked as
technical debt):** stop tracking `.env` going forward (e.g. `git rm
--cached .env` + ensure `.gitignore` covers it for new clones), and
consider rotating the Firebase Web API key as routine hygiene even
though it is not a server-side secret.
