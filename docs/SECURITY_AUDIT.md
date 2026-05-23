# Firestore Security Audit
## PharmaPulse v4 — Architecture Hardening Phase

---

## Vulnerabilities Found & Fixed

### HIGH: Broad write-any-auth on history collections

| Collection | Before | After |
|-----------|--------|-------|
| `monthly_summaries` | `allow write: if isAny()` | `allow create: if isAny() && isOwnPharmacy()` |
| `forecast_snapshots` | `allow write: if isAny()` | Requires `isOwnPharmacy()` |
| `risk_snapshots` | `allow write: if isAny()` | Requires `isMgr()` |
| `ranking_history` | `allow write: if isAny()` | Requires `isMgr()` + `ownsPharmacy()` |

**Risk:** Any authenticated user could overwrite any branch's history data.

---

### HIGH: Broken create guard on daily_summaries

| Before | After |
|--------|-------|
| `allow create: if isAny() && resource == null` | `allow create: if isAny() && isOwnPharmacy()` |

**Risk:** `resource == null` is always true for creates — the guard did nothing.

---

### MEDIUM: Pharmacies update — over-permissive

| Before | After |
|--------|-------|
| `allow update: if isAdmin() \|\| ownsPharmacy(pid)` | `allow update: if isAdmin()` |

**Risk:** Branch managers could update pharmacy records for their own branch,
including fields like `name`, `code`, `region` — should be admin-only.

---

### MEDIUM: KPI entry create — missing pharmacyId validation

| Before | After |
|--------|-------|
| `request.resource.data.userId == uid()` only | `isOwnData() && isOwnPharmacy() && notFutureDate()` |

**Risk:** User could create KPI entries for any pharmacy by crafting the payload.

---

### LOW: targets — manager can write any pharmacy's targets

| Before | After |
|--------|-------|
| `allow create: if isMgr()` | `allow create: if isMgr() && (isAdmin() \|\| pharmId() == request.resource.data.pharmacyId)` |

**Risk:** Any manager could set targets for branches they don't manage.

---

## Added: staging_entries collection

New collection for the Upload → Staging → Validation → Commit pipeline.

Rules enforce:
- `status = 'PENDING'` on create
- Only submitter or admin can delete
- Manager who owns the pharmacy can approve

---

## Missing: tenantId enforcement

**Current state:** No tenantId in any document — single-org deployment.

**Plan:** When `VITE_MULTI_TENANT=true` env var is set:
- `withTenantMetadata()` helper attaches `tenantId` + `organizationId` to writes
- Firestore rules can be extended to check `tenantId` matches claim
- No data migration needed for existing documents (backward-compatible default)

---

## Client-side Authorization Gaps (non-Firestore)

| Gap | Mitigation |
|-----|-----------|
| Users page lists all users | Server-side: rules enforce `isMgr()` for reads |
| Import can target any pharmacyId | `accessGuard.ts` + `ingestionSafetyGuards.ts` validate before write |
| No rate limiting on KPI writes | Phase 2: Netlify Function middleware |
