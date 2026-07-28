// KPI & Targets Bundle (DX-5) — path-specific declaration for kpiService.js.
// Declares the real exports/payloads only — no wildcard, no `any`.
// Mirrors the existing convention used for firebase.d.ts / userService.d.ts /
// pharmacyService.d.ts / auditService.d.ts.

export interface SaveKpiEntryParams {
  userId:     string
  pharmacyId: string
  date:       string
  notes?:     string
  actorId?:   string
  actorRole?: string
  registry?:  unknown
  /** DX-6 Actuals Import: write on behalf of another user (admin bulk import). */
  isDataExchangeImport?: boolean
  /** Required when isDataExchangeImport is true — the import_jobs jobId.
   *  Must reference an existing import_jobs document; saveKpiEntry()
   *  verifies this and throws before writing if the job is missing
   *  (Maintenance Quick Wins — importBatchRef integrity). */
  importBatchRef?: string
  [kpiField: string]: unknown
}

export interface KpiEntryRecord {
  id: string
  [key: string]: unknown
}

export declare function saveKpiEntry(params: SaveKpiEntryParams): Promise<KpiEntryRecord>

export interface SubscribeKpiEntriesFilter {
  userId?:     string
  pharmacyId?: string
  from?:       string
  to?:         string
}

export declare function subscribeKpiEntries(
  filter:   SubscribeKpiEntriesFilter,
  callback: (entries: KpiEntryRecord[]) => void,
): () => void

export declare function subscribeRecentKpiEntries(
  callback: (entries: KpiEntryRecord[]) => void,
  days?:    number,
): () => void

export interface FetchKpiEntriesRangeOptions {
  pharmacyId?: string
  userId?:     string
}

export declare function fetchKpiEntriesRange(
  fromDate: string,
  toDate:   string,
  options?: FetchKpiEntriesRangeOptions,
  registry?: unknown,
): Promise<KpiEntryRecord[]>

export interface SaveTargetParams {
  pharmacyId: string
  month:      string
  actorId?:   string
  actorRole?: string
  /** Any key ending in 'Target' (e.g. wasfatyTarget, omniTarget). */
  [targetField: string]: unknown
}

export interface TargetRecord {
  id: string
  [key: string]: unknown
}

export declare function saveTarget(params: SaveTargetParams): Promise<TargetRecord>

export declare function subscribeTargets(
  pharmacyId: string,
  callback:   (targets: TargetRecord[]) => void,
  onError?:   (err: Error) => void,
): () => void

/** @deprecated unbounded listener — use subscribeRecentTargets. */
export declare function subscribeAllTargets(
  callback: (targets: TargetRecord[]) => void,
): () => void

export declare function subscribeRecentTargets(
  callback: (targets: TargetRecord[]) => void,
  months?:  number,
): () => void

export declare function deleteTarget(
  pharmacyId: string,
  month:      string,
  actorId:    string,
  actorRole:  string,
): Promise<void>
