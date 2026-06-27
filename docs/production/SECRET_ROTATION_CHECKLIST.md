# PR-1G-B0 — Secret Rotation Checklist

Names only. No values are shown anywhere in this document or were printed
during its production. This checklist tells the product owner *what* to
rotate and *why* — rotation itself is a manual action the owner must
perform in the Firebase Console / Google Cloud Console / Netlify
dashboard. Nothing here was rotated automatically.

## Why this checklist exists

`.env` (containing the variables below) was tracked in this repository's
git history with a remote (`origin` →
`https://github.com/samouramoon2010-hub/pharmapulse-v4.git`) configured,
across 3 commits (`1b1daa8`, `1d80c24`, `3c47da6`). This phase (PR-1G-B0)
removed `.env` from *future* tracking (`git rm --cached`), but **removing
a file from tracking does not remove it from git history** — anyone with
access to the repository's commit history (or the remote, if it has ever
been pushed) can still recover the old values from those commits. Scrubbing
history (e.g. `git filter-repo`) is a separate, more invasive operation
not performed in this phase — it is listed as a manual action below.

## Public client configuration — not a private secret

| Variable | What it is | Rotation urgency |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Web SDK API key | Low — see note below |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain | None — not secret, derived from project ID |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | None — not secret, public by design |
| `VITE_FIREBASE_STORAGE_BUCKET` | Cloud Storage bucket name | None — not secret |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FCM sender ID | None — not secret |
| `VITE_FIREBASE_APP_ID` | Firebase app identifier | None — not secret |
| `VITE_FIREBASE_MEASUREMENT_ID` | Google Analytics measurement ID | None — not secret |

**Note on `VITE_FIREBASE_API_KEY`:** Firebase Web API keys are not
authorization secrets — they identify which Firebase project a client
talks to, and every Firebase web app ships this key in its public bundle
by design. Actual data access is governed by Firestore/Storage/Auth
**rules**, not by this key. This audit's prior phase (PR-1G-A) confirmed
`firestore.rules` has no open (`if true`) rules. Rotating this key is
**not security-critical**, but is still recommended as defensive hygiene
since it was exposed in git history longer than intended — and rotation
is cheap (no app code change required beyond updating `.env`).

**Manual action required (owner):** if rotating the API key, also apply
an HTTP-referrer restriction to it in Google Cloud Console → APIs &
Services → Credentials, scoped to the production domain (and any deploy-
preview domains in use), so the key cannot be used from arbitrary origins
even though it isn't a true secret.

## Build-time flags — not secret, just configuration

| Variable | What it is | Rotation urgency |
|---|---|---|
| `VITE_DEMO_MODE` | Netlify per-context build flag | None (not a secret). **Separately flagged in PR-1G-A as a P2 hygiene item: this flag is set in `netlify.toml` but is not read anywhere in `src/` — confirm intent (wire it up or remove it) independent of rotation.** |

## True secrets — none currently found in this repository

This audit (PR-1G-A) and this phase both searched the repository for:
service-account JSON files, `.pem`/`.key`/`.p12` files, hardcoded
`private_key`/API-secret literals, Sentry/analytics/monitoring tokens,
and AI-provider API key environment variables (the `src/assistant/`
module exists but does not reference any `VITE_*`/`process.env`-based
API key — it has no live external-provider wiring found in code).
**None were found.** This is a statement about what this audit could
verify by reading the repository, not a guarantee that no such secret is
held outside the repository (e.g. directly in Netlify's dashboard, or in
the Google Cloud project's IAM service accounts) — see the items below
that this audit could not directly verify.

## Items this audit could not verify directly (owner must check manually)

| Item | Why it can't be verified from the repo | Manual action required |
|---|---|---|
| Netlify site environment variables / build secrets configured directly in the Netlify dashboard (not in `netlify.toml`) | Not visible in the repository — Netlify allows setting additional env vars outside the committed `netlify.toml` | Owner should log into Netlify → Site settings → Environment variables and confirm nothing sensitive is stored there unexpectedly, and rotate anything that may have been exposed alongside the `.env` history |
| Firebase/Google Cloud service-account keys used for any out-of-repo tooling (e.g. a manually-run backup script, a CI pipeline not in this repo) | No service-account JSON or CI config was found in this repository, but that doesn't rule out one existing outside it | Owner should review Google Cloud Console → IAM & Admin → Service Accounts for any keys that may correspond to this project and rotate/restrict as needed |
| Whether the `origin` remote (`pharmapulse-v4` on GitHub) has ever actually been pushed, and whether the repository is public or private | Local git history shows commits touching `.env`, but this audit has no way to query GitHub's actual visibility/push state | Owner should check the GitHub repository's visibility setting and, if public or shared beyond the owner, treat the exposure as confirmed rather than possible |

## Recommended owner action sequence

1. Confirm the GitHub repository's visibility (private vs. public) and
   who has access.
2. Rotate `VITE_FIREBASE_API_KEY` in Firebase Console (Project Settings →
   General → Web API Key, or via Google Cloud Console → Credentials) and
   apply an HTTP-referrer restriction.
3. Update the local `.env` file with the new key (the file already
   exists locally and is now git-ignored going forward — see
   [`PR1G_B0_SIMPLIFIED_SECURITY_BACKUP.md`](PR1G_B0_SIMPLIFIED_SECURITY_BACKUP.md)).
4. Decide whether to scrub `.env`'s old values from git history
   (`git filter-repo` or equivalent) — optional, since the values are not
   true secrets, but recommended if the repository has ever been public.
5. Resolve the `VITE_DEMO_MODE` no-op (wire it up or remove it) — not a
   secret, but a configuration-hygiene item surfaced by the same review.
6. Confirm no additional Netlify-dashboard-only secrets exist beyond what
   this checklist could see in the repository.

No rotation was performed by this audit. No value was displayed, logged,
or otherwise exposed during this work.
