// ============================================================
// Universal AI Intake — KPI Definitions draft-only guard (Phase 1)
//
// Spec requirement: "lifecycle defaults to draft unless explicitly
// approved" / "Do not automatically publish new KPIs." The existing
// kpiRegistryAdapter.ts (used by Data Exchange Studio) intentionally
// defaults isActive to true and lifecycleStage to production/pilot
// when the source file doesn't specify otherwise — correct for its
// existing callers, who are aware of and rely on that behavior.
//
// Rather than changing that shared adapter's default (which would be
// an unrelated, unrequested behavior change for existing Data Exchange
// Studio users), this module wraps it for the NEW AI Intake entry
// point only: every row staged through here is forced to
// `isActive: false` / `lifecycleStage: 'draft'`, regardless of what
// the source specified, with a visible, non-blocking note so the
// preview clearly shows the KPI will need manual activation afterward.
// ============================================================

import { createKpiRegistryAdapter } from './kpiRegistryAdapter'
import type { KpiRegistryAdapterDeps, KpiRegistryRaw, KpiRegistryStaged } from './kpiRegistryAdapter'
import type { ImportDomainAdapter, ImportValidationContext, RowValidationOutcome } from '../importDomainAdapter'

export const DRAFT_ONLY_NOTE = 'Imported as draft — activate manually in KPI Registry.'

export function createDraftOnlyKpiRegistryAdapter(
  deps: KpiRegistryAdapterDeps,
): ImportDomainAdapter<KpiRegistryRaw, KpiRegistryStaged, { key: string }> {
  const inner = createKpiRegistryAdapter(deps)

  return {
    ...inner,

    validateRow(raw: KpiRegistryRaw, ctx: ImportValidationContext): RowValidationOutcome<KpiRegistryStaged> {
      const outcome = inner.validateRow(raw, ctx)
      if (!outcome.staged) return outcome

      const forced: KpiRegistryStaged = {
        ...outcome.staged,
        isActive:       false,
        lifecycleStage: 'draft',
      }

      return {
        ...outcome,
        staged: forced,
        issues: [
          ...outcome.issues,
          {
            rowIndex: raw.rowIndex,
            entity:   'KPI_REGISTRY',
            code:     'INTAKE_FORCED_DRAFT',
            message:  DRAFT_ONLY_NOTE,
            blocksCommit: false,
          },
        ],
      }
    },
  }
}
