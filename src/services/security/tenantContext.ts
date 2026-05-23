// ============================================================
// Tenant Context
// Prepares multi-tenant metadata support without migrating data.
//
// Current state:  single-org, no tenantId in documents
// Future state:   documents carry tenantId + organizationId
//
// Strategy: all helpers are backward-compatible.
//   - reading: treat missing tenantId as DEFAULT_TENANT
//   - writing: attach tenantId only if tenant mode is enabled
//   - no existing document is modified
// ============================================================

// ── Tenant identity ───────────────────────────────────────────

export const DEFAULT_TENANT_ID    = 'default'
export const DEFAULT_ORG_ID       = 'org-001'
export const TENANT_ENABLED_FLAG  = 'VITE_MULTI_TENANT' // env var

/** Is multi-tenancy enabled in this deployment? */
export function isMultiTenantMode(): boolean {
  return import.meta.env[TENANT_ENABLED_FLAG] === 'true'
}

// ── Tenant context shape ──────────────────────────────────────

export interface TenantContext {
  tenantId:       string
  organizationId: string
  /** Optional: override when admin manages multiple orgs */
  activeBranchId?: string
}

export interface TenantMetadata {
  tenantId:       string
  organizationId: string
  createdBy:      string
  updatedBy:      string
  updatedAt:      string     // ISO timestamp
  createdAt?:     string
}

// ── Resolve tenant context for current user ───────────────────
// Source: Firebase Auth custom claims or env defaults
export function resolveTenantContext(
  userProfile: { uid: string; organizationId?: string; tenantId?: string } | null
): TenantContext {
  if (!userProfile) {
    return { tenantId: DEFAULT_TENANT_ID, organizationId: DEFAULT_ORG_ID }
  }
  return {
    tenantId:       userProfile.tenantId       ?? DEFAULT_TENANT_ID,
    organizationId: userProfile.organizationId ?? DEFAULT_ORG_ID,
  }
}

// ── Attach tenant metadata to a write payload ─────────────────
// Backward-compatible: only attaches if multi-tenant mode enabled
export function withTenantMetadata<T extends Record<string, unknown>>(
  payload:   T,
  ctx:       TenantContext,
  actorUid:  string,
  isCreate:  boolean = false,
): T & Partial<TenantMetadata> {
  const now = new Date().toISOString()

  const meta: Partial<TenantMetadata> = {
    updatedBy: actorUid,
    updatedAt: now,
  }

  if (isCreate) {
    meta.createdBy = actorUid
    meta.createdAt = now
  }

  // Only attach tenant fields if multi-tenant mode is enabled
  // (avoids polluting existing single-tenant documents)
  if (isMultiTenantMode()) {
    meta.tenantId       = ctx.tenantId
    meta.organizationId = ctx.organizationId
  }

  return { ...payload, ...meta }
}

// ── Read: resolve tenantId from document (backward-compat) ───
export function resolveTenantFromDoc(
  doc: Record<string, unknown> | null
): string {
  if (!doc) return DEFAULT_TENANT_ID
  return (doc.tenantId as string) ?? DEFAULT_TENANT_ID
}

// ── Tenant-aware document ID helper ──────────────────────────
// Future: prefix doc IDs with tenantId when multi-tenant
export function tenantDocId(base: string, ctx?: TenantContext): string {
  if (!ctx || !isMultiTenantMode()) return base
  return `${ctx.tenantId}:${base}`
}

// ── Safe collection path (future: tenant-scoped sub-collections) ──
export function tenantCollection(
  collectionName: string,
  _ctx?: TenantContext,
): string {
  // Phase 2: return `tenants/${ctx.tenantId}/${collectionName}`
  // Phase 1: passthrough — no migration needed
  return collectionName
}
