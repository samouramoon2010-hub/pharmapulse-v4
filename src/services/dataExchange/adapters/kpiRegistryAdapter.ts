// ============================================================
// KPI_REGISTRY Domain Adapter (DX-4, KPI & Targets Bundle)
//
// Thin wrapper around the existing kpiRegistryService.saveKpiDefinition()
// — no new collection, no parallel schema. saveKpiDefinition() already
// enforces key format, threshold ordering, weight range, isPrimary
// invariant, key immutability, and lifecycle-transition legality; this
// adapter only adds the import-specific checks the engine needs BEFORE
// a row reaches commit: required-field shape, normalized-key collision/
// duplicate detection, protected-core-key blocking, archived/test-key
// promotion guards, and the safe-metadata-vs-structural-change split
// that decides UPDATE (auto-committable after explicit confirm) vs
// CONFLICT (blocked, requires a human decision).
//
// Canonical template fields map onto the REAL KpiDefinition contract
// (src/engine/kpiRegistry/kpiRegistryTypes.ts) as follows. Fields with
// no production equivalent are accepted as input for transparency but
// are never persisted — see docs/dx/DX4_DX5_KPI_TARGETS_BUNDLE.md:
//   KPI Key                -> key
//   KPI Name English       -> label
//   KPI Name Arabic        -> labelAr
//   Description English    -> description (registry has no Arabic
//                              description field — "Description Arabic"
//                              is accepted but not stored; documented
//                              deviation, not an invented field)
//   Unit                    -> unit (unitAr defaults to unit on create,
//                              preserved on update)
//   Category                -> category
//   Lifecycle Stage         -> lifecycleStage
//   Dashboard Enabled       -> visibility.dashboardEnabled
//   Evaluation Enabled      -> NOT a real field. Used only as a hint to
//                              default lifecycleStage when the Lifecycle
//                              Stage column is blank — lifecycleStage is
//                              the authoritative governance field and
//                              always wins on conflict (WARNING raised).
//   Target Enabled          -> visibility.targetInputEnabled
//   Direction               -> direction
//   Aggregation Method      -> aggregationType
//   Decimal Precision       -> NOT a real field. Accepted, sanity-checked
//                              (0-6), never persisted (WARNING if present).
//   Minimum Value/Maximum   -> NOT real fields (registry uses achievement-
//   Value                      % thresholds, not raw value clamps).
//                              Accepted, cross-checked if both present,
//                              never persisted (WARNING if present).
//   Active                  -> isActive
//   Sort Order              -> sortOrder
//
// Required-but-not-templated KpiDefinition fields (shortLabel, weight,
// isCore, thresholds, isPrimary, coachingAction, coachingActionAr,
// unitAr) get safe defaults on CREATE (weight 0, isCore false, isPrimary
// false, STANDARD_THRESHOLDS, '' coaching text) and are PRESERVED from
// the existing record on UPDATE — bulk import never silently strips
// governance metadata it has no column for.
// ============================================================

import { saveKpiDefinition } from '../../kpiRegistryService'
import { PROTECTED_CORE_KEYS } from '../../kpiRegistryLogic'
import { canTransitionKpiLifecycle } from '../../../engine/kpiRegistry/kpiRegistryTypes'
import type { KpiDefinition, KpiRegistry, KpiCategory, KpiDirection } from '../../../engine/kpiRegistry'
import type { KpiLifecycleStage } from '../../../engine/kpiRegistry/kpiRegistryTypes'
import type { KpiUiStatus } from '../../../engine/kpiRegistry'
import { pickField } from './columnAliasUtils'
import type {
  ImportDomainAdapter,
  ImportMappingContext,
  ImportValidationContext,
  ImportAuthorizationContext,
  ImportCommitContext,
  RowValidationOutcome,
  DuplicateDetectionResult,
  AuthorizationOutcome,
  RowDecision,
} from '../importDomainAdapter'
import type { ColumnMapping, ValidationIssue, StagedImportRow } from '../importJobTypes'

const VALID_CATEGORIES: KpiCategory[] = ['prescription', 'digital', 'wellness', 'commercial', 'operational', 'health_program']
const VALID_DIRECTIONS: KpiDirection[] = ['higher_is_better', 'lower_is_better']
const VALID_LIFECYCLE_STAGES: KpiLifecycleStage[] = ['draft', 'pilot_tracking', 'shadow_evaluation', 'production_evaluation', 'archived']
const VALID_AGGREGATIONS = ['SUM', 'AVG', 'RATIO', 'NOT_AGGREGATED'] as const
const KEY_RE = /^[a-zA-Z][a-zA-Z0-9]*$/
const TEST_DEMO_KEY_RE = /^(test|demo|sample|temp)/i
const STANDARD_THRESHOLDS = { healthy: 95, watch: 80, risk: 60, critical: 40 }

// Structural fields — a change here against an existing record is a
// CONFLICT (blocked from auto-commit, requires explicit human review),
// never a silent UPDATE. Matches the "block or require explicit
// confirmation" requirement for unit/aggregation/lifecycle/key/
// evaluation/target behavior changes.
type StructuralKeys = 'unit' | 'direction' | 'lifecycleStage' | 'aggregationType' | 'targetInputEnabled'

export interface KpiRegistryRaw {
  rowIndex:           number
  key?:               string
  labelEn?:           string
  labelAr?:           string
  descriptionEn?:     string
  descriptionArRaw?:  string   // accepted, never persisted — see module header
  unit?:              string
  category?:          string
  lifecycleStageRaw?: string
  dashboardEnabledRaw?: string
  evaluationEnabledRaw?: string
  targetEnabledRaw?:  string
  direction?:         string
  aggregationRaw?:    string
  decimalPrecisionRaw?: string
  minValueRaw?:       string
  maxValueRaw?:       string
  activeRaw?:         string
  sortOrderRaw?:      string
}

export interface KpiRegistryStaged {
  key:                 string
  normalizedKey:       string
  label:               string
  labelAr:             string
  description:         string
  unit:                string
  category:             KpiCategory
  lifecycleStage:       KpiLifecycleStage
  dashboardEnabled:     boolean
  targetInputEnabled:   boolean
  direction:            KpiDirection
  aggregationType?:     'SUM' | 'AVG' | 'RATIO' | 'NOT_AGGREGATED'
  isActive:             boolean
  sortOrder:            number
}

const HEADER_ALIASES = {
  key:           ['kpi key', 'key', 'مفتاح المؤشر'],
  labelEn:       ['kpi name english', 'name english', 'label', 'الاسم بالإنجليزية'],
  labelAr:       ['kpi name arabic', 'name arabic', 'labelar', 'الاسم بالعربية'],
  descriptionEn: ['description english', 'description', 'الوصف بالإنجليزية'],
  descriptionAr: ['description arabic', 'الوصف بالعربية'],
  unit:          ['unit', 'الوحدة'],
  category:      ['category', 'الفئة'],
  lifecycle:     ['lifecycle stage', 'lifecyclestage', 'مرحلة دورة الحياة'],
  dashboard:     ['dashboard enabled', 'dashboardenabled', 'تفعيل لوحة المعلومات'],
  evaluation:    ['evaluation enabled', 'evaluationenabled', 'تفعيل التقييم'],
  targetEnabled: ['target enabled', 'targetenabled', 'تفعيل الهدف'],
  direction:     ['direction', 'الاتجاه'],
  aggregation:   ['aggregation method', 'aggregationmethod', 'طريقة التجميع'],
  decimal:       ['decimal precision', 'decimalprecision', 'الدقة العشرية'],
  minValue:      ['minimum value', 'minvalue', 'الحد الأدنى'],
  maxValue:      ['maximum value', 'maxvalue', 'الحد الأقصى'],
  active:        ['active', 'الحالة'],
  sortOrder:     ['sort order', 'sortorder', 'ترتيب العرض'],
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === '') return fallback
  const lower = raw.trim().toLowerCase()
  if (['true', '1', 'yes', 'active', 'نعم'].includes(lower)) return true
  if (['false', '0', 'no', 'inactive', 'لا'].includes(lower)) return false
  return fallback
}

export interface KpiRegistryAdapterDeps {
  actorRole:        string
  existingRegistry: KpiRegistry
}

export function createKpiRegistryAdapter(
  deps: KpiRegistryAdapterDeps,
): ImportDomainAdapter<KpiRegistryRaw, KpiRegistryStaged, { key: string }> {
  // normalized (lowercased) key -> real existing key, for cross-case
  // collision detection ("key" must not collide with another normalized key).
  const existingNormalizedKeys = new Map<string, string>()
  for (const existingKey of Object.keys(deps.existingRegistry)) {
    existingNormalizedKeys.set(existingKey.toLowerCase(), existingKey)
  }

  function identityKey(staged: KpiRegistryStaged): string {
    return staged.normalizedKey
  }

  return {
    domain: 'KPI_REGISTRY',

    resolveColumns(headerRow: string[], _ctx: ImportMappingContext): ColumnMapping[] {
      return headerRow.map((header) => {
        const lower = header.trim().toLowerCase()
        const match = Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(lower))
        return { sourceHeader: header, targetField: match ? match[0] : header, matchedVia: match ? 'STRUCTURAL_ALIAS' : 'UNRESOLVED' }
      })
    },

    parseRow(rawRow: Record<string, unknown>, rowIndex: number, _ctx: ImportMappingContext): KpiRegistryRaw {
      return {
        rowIndex,
        key:                  pickField(rawRow, HEADER_ALIASES.key),
        labelEn:              pickField(rawRow, HEADER_ALIASES.labelEn),
        labelAr:              pickField(rawRow, HEADER_ALIASES.labelAr),
        descriptionEn:        pickField(rawRow, HEADER_ALIASES.descriptionEn),
        descriptionArRaw:     pickField(rawRow, HEADER_ALIASES.descriptionAr),
        unit:                 pickField(rawRow, HEADER_ALIASES.unit),
        category:             pickField(rawRow, HEADER_ALIASES.category),
        lifecycleStageRaw:    pickField(rawRow, HEADER_ALIASES.lifecycle),
        dashboardEnabledRaw:  pickField(rawRow, HEADER_ALIASES.dashboard),
        evaluationEnabledRaw: pickField(rawRow, HEADER_ALIASES.evaluation),
        targetEnabledRaw:     pickField(rawRow, HEADER_ALIASES.targetEnabled),
        direction:            pickField(rawRow, HEADER_ALIASES.direction),
        aggregationRaw:       pickField(rawRow, HEADER_ALIASES.aggregation),
        decimalPrecisionRaw:  pickField(rawRow, HEADER_ALIASES.decimal),
        minValueRaw:          pickField(rawRow, HEADER_ALIASES.minValue),
        maxValueRaw:          pickField(rawRow, HEADER_ALIASES.maxValue),
        activeRaw:            pickField(rawRow, HEADER_ALIASES.active),
        sortOrderRaw:         pickField(rawRow, HEADER_ALIASES.sortOrder),
      }
    },

    validateRow(raw: KpiRegistryRaw, _ctx: ImportValidationContext): RowValidationOutcome<KpiRegistryStaged> {
      const issues: ValidationIssue[] = []

      if (!raw.key || !KEY_RE.test(raw.key)) {
        issues.push({ rowIndex: raw.rowIndex, column: 'key', entity: 'KPI_REGISTRY', code: 'INVALID_KEY', message: `KPI key "${raw.key ?? ''}" is required and must be camelCase letters/numbers`, blocksCommit: true })
      }
      if (!raw.labelEn) {
        issues.push({ rowIndex: raw.rowIndex, column: 'labelEn', entity: 'KPI_REGISTRY', code: 'MISSING_REQUIRED_FIELD', message: 'KPI Name English is required', blocksCommit: true })
      }
      if (!raw.labelAr) {
        issues.push({ rowIndex: raw.rowIndex, column: 'labelAr', entity: 'KPI_REGISTRY', code: 'MISSING_ARABIC_LABEL', message: 'KPI Name Arabic is empty — registry will store an empty Arabic label', blocksCommit: false })
      }
      if (raw.descriptionArRaw) {
        issues.push({ rowIndex: raw.rowIndex, column: 'descriptionAr', entity: 'KPI_REGISTRY', code: 'FIELD_NOT_PERSISTED', message: 'Description Arabic has no field in the production KPI Registry contract — value will not be stored', blocksCommit: false })
      }
      if (!raw.unit) {
        issues.push({ rowIndex: raw.rowIndex, column: 'unit', entity: 'KPI_REGISTRY', code: 'MISSING_REQUIRED_FIELD', message: 'Unit is required', blocksCommit: true })
      }

      let category: KpiCategory | null = null
      if (!raw.category || !VALID_CATEGORIES.includes(raw.category as KpiCategory)) {
        issues.push({ rowIndex: raw.rowIndex, column: 'category', entity: 'KPI_REGISTRY', code: 'INVALID_CATEGORY', message: `Category "${raw.category ?? ''}" must be one of: ${VALID_CATEGORIES.join(', ')}`, blocksCommit: true })
      } else {
        category = raw.category as KpiCategory
      }

      let direction: KpiDirection | null = null
      if (raw.direction) {
        if (!VALID_DIRECTIONS.includes(raw.direction as KpiDirection)) {
          issues.push({ rowIndex: raw.rowIndex, column: 'direction', entity: 'KPI_REGISTRY', code: 'INVALID_DIRECTION', message: `Direction "${raw.direction}" must be one of: ${VALID_DIRECTIONS.join(', ')}`, blocksCommit: true })
        } else {
          direction = raw.direction as KpiDirection
        }
      }

      let aggregationType: KpiRegistryStaged['aggregationType']
      if (raw.aggregationRaw) {
        if (!VALID_AGGREGATIONS.includes(raw.aggregationRaw as (typeof VALID_AGGREGATIONS)[number])) {
          issues.push({ rowIndex: raw.rowIndex, column: 'aggregation', entity: 'KPI_REGISTRY', code: 'INVALID_AGGREGATION_METHOD', message: `Aggregation Method "${raw.aggregationRaw}" must be one of: ${VALID_AGGREGATIONS.join(', ')}`, blocksCommit: true })
        } else {
          aggregationType = raw.aggregationRaw as (typeof VALID_AGGREGATIONS)[number]
        }
      }

      // Lifecycle Stage is authoritative. Evaluation Enabled is only a
      // hint used when Lifecycle Stage is blank — never overrides an
      // explicit Lifecycle Stage value (see module header).
      let lifecycleStage: KpiLifecycleStage | null = null
      const evaluationEnabled = raw.evaluationEnabledRaw != null && raw.evaluationEnabledRaw.trim() !== ''
        ? parseBoolean(raw.evaluationEnabledRaw, false)
        : null
      if (raw.lifecycleStageRaw) {
        if (!VALID_LIFECYCLE_STAGES.includes(raw.lifecycleStageRaw as KpiLifecycleStage)) {
          issues.push({ rowIndex: raw.rowIndex, column: 'lifecycle', entity: 'KPI_REGISTRY', code: 'INVALID_LIFECYCLE_STAGE', message: `Lifecycle Stage "${raw.lifecycleStageRaw}" must be one of: ${VALID_LIFECYCLE_STAGES.join(', ')}`, blocksCommit: true })
        } else {
          lifecycleStage = raw.lifecycleStageRaw as KpiLifecycleStage
          if (evaluationEnabled === false && lifecycleStage === 'production_evaluation') {
            issues.push({ rowIndex: raw.rowIndex, column: 'evaluation', entity: 'KPI_REGISTRY', code: 'EVALUATION_FLAG_IGNORED', message: 'Evaluation Enabled=false conflicts with Lifecycle Stage=production_evaluation — Lifecycle Stage governs and was kept', blocksCommit: false })
          }
        }
      } else if (evaluationEnabled === true) {
        lifecycleStage = 'production_evaluation'
      } else if (evaluationEnabled === false) {
        lifecycleStage = 'pilot_tracking'
      }

      if (lifecycleStage === 'production_evaluation' && raw.key && TEST_DEMO_KEY_RE.test(raw.key)) {
        issues.push({ rowIndex: raw.rowIndex, column: 'key', entity: 'KPI_REGISTRY', code: 'TEST_KEY_PROMOTION_BLOCKED', message: `KPI key "${raw.key}" matches a test/demo naming pattern and cannot be promoted to production_evaluation via bulk import`, blocksCommit: true })
      }

      // Decimal Precision / Min/Max Value: no field exists for these in
      // the production contract — sanity-check the input, never persist.
      if (raw.decimalPrecisionRaw) {
        const dp = Number(raw.decimalPrecisionRaw)
        if (isNaN(dp) || dp < 0 || dp > 6) {
          issues.push({ rowIndex: raw.rowIndex, column: 'decimal', entity: 'KPI_REGISTRY', code: 'FIELD_NOT_PERSISTED', message: `Decimal Precision "${raw.decimalPrecisionRaw}" is out of the sane 0-6 range, and is not stored — the registry has no decimal-precision field`, blocksCommit: false })
        } else {
          issues.push({ rowIndex: raw.rowIndex, column: 'decimal', entity: 'KPI_REGISTRY', code: 'FIELD_NOT_PERSISTED', message: 'Decimal Precision is not part of the production KPI Registry contract and will not be stored', blocksCommit: false })
        }
      }
      let minVal: number | null = null, maxVal: number | null = null
      if (raw.minValueRaw) minVal = Number(raw.minValueRaw)
      if (raw.maxValueRaw) maxVal = Number(raw.maxValueRaw)
      if (minVal != null && maxVal != null && !isNaN(minVal) && !isNaN(maxVal) && minVal > maxVal) {
        issues.push({ rowIndex: raw.rowIndex, column: 'minValue', entity: 'KPI_REGISTRY', code: 'INVALID_MIN_MAX', message: `Minimum Value (${minVal}) is greater than Maximum Value (${maxVal})`, blocksCommit: false })
      }
      if (raw.minValueRaw || raw.maxValueRaw) {
        issues.push({ rowIndex: raw.rowIndex, column: 'minValue', entity: 'KPI_REGISTRY', code: 'FIELD_NOT_PERSISTED', message: 'Minimum/Maximum Value have no field in the production KPI Registry contract (it uses achievement-% thresholds instead) — not stored', blocksCommit: false })
      }

      let sortOrder: number | null = null
      if (raw.sortOrderRaw) {
        const n = Number(raw.sortOrderRaw)
        if (isNaN(n)) {
          issues.push({ rowIndex: raw.rowIndex, column: 'sortOrder', entity: 'KPI_REGISTRY', code: 'INVALID_SORT_ORDER', message: `Sort Order "${raw.sortOrderRaw}" must be numeric`, blocksCommit: true })
        } else {
          sortOrder = n
        }
      }

      // Cross-case collision: normalized key matches an EXISTING key with
      // different exact casing — identity ambiguity, never a normal update.
      const normalizedKey = (raw.key ?? '').toLowerCase()
      const collidingExistingKey = existingNormalizedKeys.get(normalizedKey)
      if (raw.key && collidingExistingKey && collidingExistingKey !== raw.key) {
        issues.push({ rowIndex: raw.rowIndex, column: 'key', entity: 'KPI_REGISTRY', code: 'NORMALIZED_KEY_COLLISION', message: `Key "${raw.key}" collides with existing KPI "${collidingExistingKey}" after case-insensitive normalization — KPI keys must not collide when lowercased`, blocksCommit: true })
      }

      const blocking = issues.some((i) => i.blocksCommit)
      if (blocking) return { classification: 'ERROR', issues }

      const staged: KpiRegistryStaged = {
        key: raw.key!, normalizedKey,
        label: raw.labelEn!, labelAr: raw.labelAr || '',
        description: raw.descriptionEn || '',
        unit: raw.unit!,
        category: category!,
        lifecycleStage: lifecycleStage ?? 'draft',
        dashboardEnabled: parseBoolean(raw.dashboardEnabledRaw, true),
        targetInputEnabled: parseBoolean(raw.targetEnabledRaw, false),
        direction: direction ?? 'higher_is_better',
        aggregationType,
        isActive: parseBoolean(raw.activeRaw, true),
        sortOrder: sortOrder ?? 999,
      }

      return { classification: issues.length > 0 ? 'WARNING' : 'VALID', issues, staged }
    },

    identityKey,

    detectFileDuplicates(staged: KpiRegistryStaged[]): DuplicateDetectionResult<KpiRegistryStaged> {
      const seen = new Map<string, KpiRegistryStaged>()
      for (const s of staged) seen.set(identityKey(s), s)
      return { deduplicated: [...seen.values()], duplicateCount: staged.length - seen.size }
    },

    async loadExistingRecords(): Promise<Map<string, unknown>> {
      const map = new Map<string, unknown>()
      for (const [key, def] of Object.entries(deps.existingRegistry)) {
        map.set(key.toLowerCase(), def)
      }
      return map
    },

    diffAgainstExisting(staged: KpiRegistryStaged, existing: unknown | null): RowDecision {
      const def = existing as KpiDefinition | null
      if (!def) return 'CREATE'

      // Protected core KPIs: any structural OR metadata change is a
      // conflict — these 5 keys are never modified via bulk import.
      if (PROTECTED_CORE_KEYS.has(def.key)) {
        return 'CONFLICT'
      }

      // Archived records must not be silently un-archived by an import
      // row that doesn't explicitly request a legal lifecycle transition.
      if (def.lifecycleStage && staged.lifecycleStage !== def.lifecycleStage) {
        if (!canTransitionKpiLifecycle(def.lifecycleStage, staged.lifecycleStage)) {
          return 'CONFLICT'
        }
      }

      const structuralChanged: Record<StructuralKeys, boolean> = {
        unit:               def.unit !== staged.unit,
        direction:           def.direction !== staged.direction,
        lifecycleStage:      (def.lifecycleStage ?? 'production_evaluation') !== staged.lifecycleStage,
        aggregationType:     staged.aggregationType != null && def.aggregationType !== staged.aggregationType,
        targetInputEnabled:  (def.visibility.targetInputEnabled ?? false) !== staged.targetInputEnabled,
      }
      // A legal lifecycle transition is allowed to proceed as UPDATE —
      // only an ILLEGAL one (caught above) blocks as CONFLICT. Re-check
      // the remaining structural fields excluding lifecycleStage.
      const otherStructuralChanged = structuralChanged.unit || structuralChanged.direction ||
        structuralChanged.aggregationType || structuralChanged.targetInputEnabled
      if (otherStructuralChanged) return 'CONFLICT'

      const metadataChanged =
        def.label !== staged.label || def.labelAr !== staged.labelAr ||
        (def.description ?? '') !== staged.description ||
        def.category !== staged.category ||
        def.visibility.dashboardEnabled !== staged.dashboardEnabled ||
        def.isActive !== staged.isActive ||
        def.sortOrder !== staged.sortOrder ||
        structuralChanged.lifecycleStage

      return metadataChanged ? 'UPDATE' : 'SKIP'
    },

    authorizeRow(_staged: KpiRegistryStaged, ctx: ImportAuthorizationContext): AuthorizationOutcome {
      if (ctx.actorRole !== 'admin') {
        return { allowed: false, reason: 'Bulk KPI Registry import requires Organization Admin' }
      }
      return { allowed: true }
    },

    toStagedRow(staged, jobId, rowIndex, classification, issues): StagedImportRow<KpiRegistryStaged> {
      return {
        rowId: `${jobId}-${rowIndex}`, jobId, rowIndex,
        identityKey: staged ? identityKey(staged) : `unresolved-${jobId}-${rowIndex}`,
        classification, issues, staged, state: 'STAGED',
      }
    },

    async commitBatch(rows: StagedImportRow<KpiRegistryStaged>[], _ctx: ImportCommitContext): Promise<{ key: string }> {
      const row = rows[0]
      const staged = row.staged
      if (!staged) throw new Error('Cannot commit a row with no staged value')

      const existing = deps.existingRegistry[staged.key]
      const uiStatus: KpiUiStatus = staged.isActive ? 'ACTIVE' : 'ARCHIVED'

      const def: KpiDefinition = {
        key:         staged.key,
        label:       staged.label,
        shortLabel:  existing?.shortLabel ?? staged.label,
        labelAr:     staged.labelAr,
        category:    staged.category,
        valueType:   existing?.valueType ?? 'number',
        unit:        staged.unit,
        unitAr:      existing?.unitAr ?? staged.unit,
        direction:   staged.direction,
        targetType:  existing?.targetType ?? 'absolute',
        weight:      existing?.weight ?? 0,
        isActive:    staged.isActive,
        isCore:      existing?.isCore ?? false,
        thresholds:  existing?.thresholds ?? STANDARD_THRESHOLDS,
        visibility: {
          dashboardEnabled:   staged.dashboardEnabled,
          teamEnabled:        existing?.visibility.teamEnabled ?? false,
          executiveEnabled:   existing?.visibility.executiveEnabled ?? false,
          regionalEnabled:    existing?.visibility.regionalEnabled ?? false,
          targetInputEnabled: staged.targetInputEnabled,
        },
        sortOrder:        staged.sortOrder,
        description:      staged.description,
        isPrimary:        existing?.isPrimary ?? false,
        coachingAction:   existing?.coachingAction ?? '',
        coachingActionAr: existing?.coachingActionAr ?? '',
        aggregationType:  staged.aggregationType ?? existing?.aggregationType,
        lifecycleStage:   staged.lifecycleStage,
      }

      await saveKpiDefinition(def, uiStatus, deps.existingRegistry)
      return { key: def.key }
    },
  }
}
