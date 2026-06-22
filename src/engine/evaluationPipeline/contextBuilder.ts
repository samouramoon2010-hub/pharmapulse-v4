// ============================================================
// Evaluation Pipeline — Context Builder
//
// Constructs an EvaluationPipelineContext from the existing
// EvaluationEngineInput + EvaluationProfile, enabling the
// pipeline to run against the same data as the v1 engine.
//
// This is the ONLY bridge between the v1 engine input contract
// and the pipeline module. Everything else is pipeline-internal.
// ============================================================

import type { EvaluationEngineInput } from '../evaluationEngine/evaluationEngineTypes'
import type { EvaluationProfile, EvaluationBasket } from '../evaluationRegistry/evaluationRegistryTypes'
import type { EvaluationPipelineContext, BasketContext, ElementContext } from './types'
import { getTargetFieldName } from '../kpiRegistry/kpiUiAdapter'

/**
 * Build a pipeline context from a v1 EvaluationEngineInput.
 * Flattens targets into simple Record<field, value> maps for processor use.
 */
export function buildPipelineContext(
  input: EvaluationEngineInput,
): EvaluationPipelineContext {
  const { profile, userId, pharmacyId, month, role, kpiActuals, registry,
          personalTarget, branchTarget } = input

  // Flatten personal targets
  const flatPersonal: Record<string, number> = {}
  if (personalTarget?.targets) {
    Object.assign(flatPersonal, personalTarget.targets)
  }

  // Flatten branch targets
  const flatBranch: Record<string, number> = {}
  if (branchTarget) {
    Object.assign(flatBranch, branchTarget as unknown as Record<string, number>)
  }

  // Flatten registry to simple shape
  const flatRegistry: EvaluationPipelineContext['registry'] = {}
  for (const [key, def] of Object.entries(registry)) {
    flatRegistry[key] = { key: def.key, label: def.label, aliasFor: def.aliasFor }
  }

  // Build basket contexts from active baskets
  const activeBaskets = (profile.basketIds ?? [])
    .map((id) => profile.baskets?.[id])
    .filter((b): b is EvaluationBasket => !!b && b.active !== false)

  // ── Runtime integrity diagnostics ───────────────────────────
  // Profile Integrity Guard (profileIntegrityGuard.ts) blocks NEW publishes
  // with these defects, but a profile published before the guard existed,
  // or a profile whose Registry KPI was deactivated AFTER publish, can
  // still reach evaluation. These checks never alter actual/target/weight
  // values or any score calculation — they only record a visible,
  // controlled diagnostic in ctx.warnings (threaded into trace by
  // pipelineAdapter.ts) so a corrupted/historical Profile cannot silently
  // produce a misleadingly "successful" score with no trace of the defect.
  const integrityWarnings: string[] = []
  for (const basket of activeBaskets) {
    const seenInThisBasket = new Set<string>()
    for (const el of basket.elements) {
      const kpiDef = registry[el.kpiKey]
      if (!kpiDef) {
        integrityWarnings.push(
          `Basket "${basket.name}": KPI "${el.kpiKey}" is not in the live Registry — treated as zero contribution, not a Core KPI fallback`,
        )
      } else if (kpiDef.isActive === false) {
        integrityWarnings.push(
          `Basket "${basket.name}": KPI "${el.kpiKey}" (${kpiDef.label}) is inactive in the Registry but still present in this Profile — evaluated for historical compatibility`,
        )
      }
      if (typeof el.weight !== 'number' || !isFinite(el.weight) || el.weight < 0) {
        integrityWarnings.push(
          `Basket "${basket.name}": KPI "${el.kpiKey}" has an invalid weight (${JSON.stringify(el.weight)}) — result may not be meaningful`,
        )
      }
      if (seenInThisBasket.has(el.kpiKey)) {
        integrityWarnings.push(
          `Basket "${basket.name}" contains KPI "${el.kpiKey}" more than once — its weight is double-counted in this basket's aggregate`,
        )
      }
      seenInThisBasket.add(el.kpiKey)
    }
    if (typeof basket.weight !== 'number' || !isFinite(basket.weight) || basket.weight < 0) {
      integrityWarnings.push(
        `Basket "${basket.name}" has an invalid weight (${JSON.stringify(basket.weight)}) — result may not be meaningful`,
      )
    }
  }

  const baskets: BasketContext[] = activeBaskets.map((basket) => {
    const elements: ElementContext[] = basket.elements.map((el) => {
      const kpiDef    = registry[el.kpiKey]
      const engineKey = kpiDef?.aliasFor ?? kpiDef?.key ?? el.kpiKey
      const label     = kpiDef?.label ?? el.kpiKey

      // Resolve target value upfront for traceability.
      // IMPORTANT: resolution logic matches V1 evaluationEngine.ts resolveTarget() exactly:
      //   - Personal target: nullish check (personal != null) — accepts numeric strings
      //     because Firestore may store numeric values as strings in some edge cases.
      //     V1 uses `personal != null` (not `typeof === 'number'`).
      //   - Branch target: strict `typeof === 'number'` check (matches V1 exactly).
      // Using strict `typeof === 'number'` for personal targets was a divergence from V1
      // that could produce false shadow mismatches when Firestore stores numeric strings.
      const targetFieldName = getTargetFieldName(el.kpiKey)
      const personalVal = personalTarget?.targets?.[targetFieldName]
      const branchVal   = (branchTarget as Record<string, unknown> | null | undefined)?.[targetFieldName]

      // Personal target: nullish check matches V1 (`personal != null`)
      // Coerce to number to handle numeric string edge cases.
      const hasPersonal = personalVal != null
      const hasNumericBranch = typeof branchVal === 'number' && branchVal != null

      const target =
        hasPersonal      ? Number(personalVal)   // coerce: handles numeric strings like '120'
        : hasNumericBranch ? branchVal as number
        : 0
      const targetSource =
        hasPersonal      ? 'personal'
        : hasNumericBranch ? 'branch'
        : 'none'

      const rawActual     = kpiActuals[engineKey]
      const dataAvailable = rawActual != null && isFinite(rawActual)
      const actual        = dataAvailable ? rawActual : 0

      return {
        kpiKey:       el.kpiKey,
        engineKey,
        label,
        weight:       el.weight,
        required:     el.required,
        actual,
        target,
        targetSource: targetSource as 'personal' | 'branch' | 'none',
        dataAvailable,
        // Carry per-element threshold override for ELEMENT_BAND_SCORER.
        // Mirrors V1: el.thresholdOverride ?? basket.thresholdRule
        thresholdOverride: el.thresholdOverride,
      }
    })

    return {
      basketId:      basket.id,
      basketName:    basket.name,
      weight:        basket.weight,
      thresholdRule: basket.thresholdRule,
      elements,
    }
  })

  return {
    userId, pharmacyId, month, role,
    profileId:      profile.id,
    profileVersion: profile.version,
    kpiActuals,
    personalTarget: Object.keys(flatPersonal).length ? flatPersonal : null,
    branchTarget:   Object.keys(flatBranch).length   ? flatBranch   : null,
    registry:       flatRegistry,
    baskets,
    warnings: integrityWarnings,
  }
}

/**
 * Extract cap config from an EvaluationProfile for the ACHIEVEMENT_CAP_APPLIER.
 * Returns the caps record expected by that processor's step config.
 */
export function extractCapConfig(
  profile: EvaluationProfile,
): Record<string, { basketCap?: number; elementCaps?: Record<string, number> }> {
  const caps: Record<string, { basketCap?: number; elementCaps?: Record<string, number> }> = {}

  const activeBaskets = (profile.basketIds ?? [])
    .map((id) => profile.baskets?.[id])
    .filter((b): b is EvaluationBasket => !!b && b.active !== false)

  for (const basket of activeBaskets) {
    const hasBasketCap   = typeof basket.achievementCapPct === 'number' && basket.achievementCapPct > 0
    const elementsWithCap = basket.elements.filter(
      (el) => typeof el.achievementCapPct === 'number' && (el.achievementCapPct ?? 0) > 0
    )

    if (hasBasketCap || elementsWithCap.length > 0) {
      caps[basket.id] = {
        basketCap:   hasBasketCap ? basket.achievementCapPct! : undefined,
        elementCaps: elementsWithCap.length > 0
          ? Object.fromEntries(elementsWithCap.map((el) => [el.kpiKey, el.achievementCapPct!]))
          : undefined,
      }
    }
  }

  return caps
}
