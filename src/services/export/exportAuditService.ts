// ============================================================
// Export Studio — Export Audit/History (DX-10)
//
// Reuses the existing audit_logs collection and logAction() —
// no new Firestore collection. Export records carry no workbook
// contents and no raw row data, only the metadata fields specified
// in the DX-10 spec (template, actor, role, scope, filters, format,
// timestamp, row count, workbook version, status, failure category,
// file name) inside logAction()'s generic `meta` object.
//
// listRecentExportAudits() follows the same admin-gated-by-caller
// convention documented in firestoreStagingRepository.ts's
// listRecentImportJobs() — the Firestore audit_logs read rule is the
// defense-in-depth backstop.
// ============================================================
import { collection, getDocs, query, where, orderBy, limit as fbLimit } from 'firebase/firestore'
import { db, COL } from '../firebase'
import { logAction, AUDIT_ACTION } from '../auditService'
import type { ExportAuditRecord } from './exportTypes'

export async function recordExportAudit(record: ExportAuditRecord): Promise<void> {
  await logAction({
    action: AUDIT_ACTION.EXPORT,
    collection: 'export',
    userId: record.actorUid,
    userRole: record.actorRole,
    meta: {
      templateId: record.templateId,
      templateName: record.templateName,
      scopeLabel: record.scopeLabel,
      format: record.format,
      generatedAt: record.generatedAt,
      rowCount: record.rowCount,
      workbookVersion: record.workbookVersion,
      status: record.status,
      failureCategory: record.failureCategory ?? null,
      fileName: record.fileName,
    },
  })
}

export async function listRecentExportAudits(maxResults = 25): Promise<ExportAuditRecord[]> {
  const snap = await getDocs(query(
    collection(db, COL.AUDIT_LOGS),
    where('action', '==', AUDIT_ACTION.EXPORT),
    orderBy('timestamp', 'desc'),
    fbLimit(maxResults),
  ))
  return snap.docs.map((d) => {
    const data = d.data() as { meta?: Record<string, unknown>; userId?: string; userRole?: string }
    const meta = data.meta ?? {}
    return {
      templateId: meta.templateId as ExportAuditRecord['templateId'],
      templateName: (meta.templateName as string) ?? '',
      actorUid: data.userId ?? '',
      actorRole: data.userRole ?? '',
      scopeLabel: (meta.scopeLabel as string) ?? '',
      format: (meta.format as ExportAuditRecord['format']) ?? 'xlsx',
      generatedAt: (meta.generatedAt as string) ?? '',
      rowCount: (meta.rowCount as number) ?? 0,
      workbookVersion: (meta.workbookVersion as string) ?? '',
      status: (meta.status as ExportAuditRecord['status']) ?? 'FAILED',
      failureCategory: (meta.failureCategory as string | undefined) ?? undefined,
      fileName: (meta.fileName as string) ?? '',
    }
  })
}
