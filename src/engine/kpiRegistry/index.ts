// ============================================================
// KPI Registry — Public API
// Import from this file, not from individual modules.
// ============================================================

// ── Types ─────────────────────────────────────────────────────
export type {
  KpiValueType,
  KpiTargetType,
  KpiDirection,
  KpiCategory,
  KpiThresholds,
  KpiVisibility,
  KpiDefinition,
  KpiRegistry,
  KpiAliasMap,
} from './kpiRegistryTypes'

// ── Utility functions ─────────────────────────────────────────
export {
  getActiveKpis,
  getCoreKpis,
  getKpisForSurface,
  buildAliasMap,
  resolveEngineKey,
  validateWeights,
  validateThresholds,
} from './kpiRegistryTypes'

// ── Default registry + alias maps ────────────────────────────
export {
  DEFAULT_KPI_REGISTRY,
  KPI_ENGINE_ALIAS_MAP,
  KPI_ENGINE_REVERSE_MAP,
  DEFAULT_ALL_KPI_KEYS,
  DEFAULT_ACTIVE_KPI_KEYS,
  DEFAULT_CORE_KPI_KEYS,
  DEFAULT_CORE_ENGINE_KEYS,
} from './defaultKpiRegistry'

// ── Adapter ───────────────────────────────────────────────────
export type {
  RegistryTarget,
  EngineTarget,
  EngineKpiResults,
  RegistryKpiResults,
} from './kpiRegistryAdapter'

export {
  toEngineKey,
  toRegistryKey,
  normalizeKpiRecord,
  denormalizeKpiRecord,
  getEngineCompatibleKpiKeys,
  getRegistryCompatibleKpiKeys,
  mapRegistryTargetsToEngineTargets,
  mapEngineTargetsToRegistryTargets,
  mapEngineResultsToRegistryResults,
  mapRegistryResultsToEngineResults,
  isKnownKpiKey,
  findKpiDefinition,
} from './kpiRegistryAdapter'

// ── UI Adapter ────────────────────────────────────────────────
export type {
  KpiUiStatus,
  KpiUiSection,
  KpiComponentType,
  KpiUiConfig,
} from './kpiUiAdapter'

export {
  DEFAULT_KPI_UI_CONFIG,
  getTargetFieldName,
  toKpiUiConfig,
  getTargetInputConfigs,
  getKpiUiConfigsForSurface,
  getKpiUiConfig,
  buildTargetPayload,
  buildFormInitialState,
  shadowComparePayloads,
} from './kpiUiAdapter'
