// ============================================================
// Admin-triggered Firestore Backup — Collection Allowlist
//
// Explicit list (not a wildcard/introspection scan) of every
// top-level collection this backup exports, mirrored from the
// canonical list of `match /{collection}/{doc}` blocks in
// firestore.rules. Explicit and reviewable on purpose — a backup
// endpoint must never silently start exporting a new sensitive
// collection just because someone added it to the schema.
//
// Excluded deliberately: `connector_*` / `*_operation_state`
// internal machinery collections (not business data, and not
// listed in firestore.rules — Admin-SDK-only), and any collection
// that does not appear in firestore.rules at all.
// ============================================================

export const BACKUP_COLLECTIONS: readonly string[] = [
  'users',
  'pharmacies',
  'classifications',
  'kpi_entries',
  'targets',
  'audit_logs',
  'notifications',
  'leaderboard',
  'daily_summaries',
  'monthly_summaries',
  'forecast_snapshots',
  'risk_snapshots',
  'ranking_history',
  'demo_batches',
  'ranking_snapshots',
  'staging_entries',
  'import_jobs',
  'kpi_registry',
  'kpi_audit_logs',
  'personal_targets',
  'districts',
  'regions',
  'evaluation_profiles',
  'evaluation_results',
  'shadow_evaluation_logs',
  'system_config',
  'suggestedActions',
  'actionHistory',
  'recoveryObservations',
  'profileStudioProfiles',
  'profileStudioSnapshots',
  'profileStudioAuditLogs',
  'profileStudioPublishPackages',
  'profileStudioSimulationRuns',
  'evaluationLedgerEntries',
  'item_sales_monthly',
  'item_sales_branch_monthly',
]
