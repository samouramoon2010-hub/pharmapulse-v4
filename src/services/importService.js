// ============================================================
// Excel Import Service
// Handles Excel file reading, validation, preview, and Firestore import
// ============================================================
import * as XLSX from 'xlsx'
import {
  doc, setDoc, addDoc, collection, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { db, COL } from './firebase'
import { logAction, AUDIT_ACTION } from './auditService'

// ── Schema definitions for each import type ──────────────────
export const IMPORT_SCHEMAS = {
  pharmacies: {
    label: 'الفروع / الصيدليات',
    required: ['name', 'code', 'region', 'city'],
    columns: {
      name:          { label: 'اسم الفرع',       type: 'string' },
      code:          { label: 'كود الفرع',        type: 'string' },
      region:        { label: 'المنطقة',          type: 'string' },
      city:          { label: 'المدينة',          type: 'string' },
      address:       { label: 'العنوان',          type: 'string', required: false },
      phone:         { label: 'الهاتف',           type: 'string', required: false },
      targetMonthly: { label: 'الهدف الشهري',     type: 'number', required: false },
    },
  },
  users: {
    label: 'الصيادلة والمستخدمين',
    required: ['displayName', 'email', 'role', 'branchCode'],
    columns: {
      displayName: { label: 'الاسم',            type: 'string' },
      email:       { label: 'البريد الإلكتروني', type: 'email'  },
      role:        { label: 'الدور',            type: 'enum', values: ['pharmacist','store_manager','area_manager','admin'] },
      branchCode:  { label: 'كود الفرع',        type: 'string' },
      employeeId:  { label: 'رقم الموظف',       type: 'string', required: false },
      phone:       { label: 'الجوال',           type: 'string', required: false },
    },
  },
  targets: {
    label: 'الأهداف',
    required: ['branchCode', 'kpiId', 'targetValue', 'period', 'year', 'month'],
    columns: {
      branchCode:  { label: 'كود الفرع',  type: 'string' },
      kpiId:       { label: 'معرف KPI',   type: 'string' },
      targetValue: { label: 'الهدف',      type: 'number' },
      period:      { label: 'الفترة',     type: 'enum', values: ['daily','weekly','monthly'] },
      year:        { label: 'السنة',      type: 'number' },
      month:       { label: 'الشهر',      type: 'number' },
    },
  },
}

// ── Read Excel file → raw rows ────────────────────────────────
export function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb    = XLSX.read(e.target.result, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' })
        resolve(rows)
      } catch (err) {
        reject(new Error('فشل قراءة الملف — تأكد أنه Excel صالح'))
      }
    }
    reader.onerror = () => reject(new Error('فشل تحميل الملف'))
    reader.readAsArrayBuffer(file)
  })
}

// ── Validate rows against schema ──────────────────────────────
export function validateRows(rows, schemaKey) {
  const schema  = IMPORT_SCHEMAS[schemaKey]
  if (!schema) return { valid: [], errors: ['نوع استيراد غير معروف'] }

  const valid  = []
  const errors = []

  rows.forEach((row, idx) => {
    const rowNum = idx + 2 // Excel rows start at 2 (row 1 = header)
    const rowErrors = []

    Object.entries(schema.columns).forEach(([field, def]) => {
      const isRequired = def.required !== false || schema.required.includes(field)
      const value      = row[def.label] ?? row[field] ?? ''

      if (isRequired && (value === '' || value === null || value === undefined)) {
        rowErrors.push(`الحقل "${def.label}" مطلوب`)
        return
      }
      if (!value && !isRequired) return

      if (def.type === 'number' && isNaN(Number(value))) {
        rowErrors.push(`"${def.label}" يجب أن يكون رقماً`)
      }
      if (def.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
        rowErrors.push(`"${def.label}" بريد إلكتروني غير صالح`)
      }
      if (def.type === 'enum' && !def.values.includes(String(value).trim())) {
        rowErrors.push(`"${def.label}" يجب أن يكون أحد: ${def.values.join(', ')}`)
      }
    })

    // Normalise keys: map Arabic labels → field names
    const normalised = {}
    Object.entries(schema.columns).forEach(([field, def]) => {
      normalised[field] = row[def.label] ?? row[field] ?? ''
    })

    if (rowErrors.length) {
      errors.push({ row: rowNum, errors: rowErrors, data: normalised })
    } else {
      valid.push(normalised)
    }
  })

  return { valid, errors, total: rows.length }
}

// ── Import validated rows to Firestore ────────────────────────
export async function importToFirestore(rows, schemaKey, actorId, actorRole, demoStore = null) {
`
      const existing = JSON.parse(localStorage.getItem(key) || '[]')
      const merged = [...existing, ...rows.map((r, i) => ({ ...r, id: `imported-${Date.now()}-${i}` }))]
      localStorage.setItem(key, JSON.stringify(merged))
    } catch { /* localStorage might not be available */ }
    if (demoStore) demoStore(rows)
    await logAction({
      action: AUDIT_ACTION.IMPORT, collection: schemaKey,
      userId: actorId, userRole: actorRole,
      meta: { count: rows.length, type: schemaKey },
    })
    return { imported: rows.length, errors: [] }
  }

  const targetCol = {
    pharmacies: COL.PHARMACIES,
    users:      COL.USERS,
    targets:    COL.TARGETS,
  }[schemaKey]

  if (!targetCol) throw new Error('نوع غير مدعوم')

  const errors    = []
  let   imported  = 0
  const BATCH_SIZE = 400 // Firestore limit is 500

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = rows.slice(i, i + BATCH_SIZE)

    chunk.forEach((row) => {
      try {
        const ref = schemaKey === 'pharmacies' && row.code
          ? doc(db, targetCol, row.code)       // use code as doc ID
          : doc(collection(db, targetCol))      // auto ID

        batch.set(ref, {
          ...row,
          importedAt:  serverTimestamp(),
          importedBy:  actorId,
          active:      true,
        }, { merge: true })
        imported++
      } catch (e) {
        errors.push({ row, error: e.message })
      }
    })

    await batch.commit()
  }

  await logAction({
    action: AUDIT_ACTION.IMPORT, collection: targetCol,
    userId: actorId, userRole: actorRole,
    meta: { imported, errors: errors.length, type: schemaKey },
  })

  return { imported, errors }
}

// ── Download a template Excel file ────────────────────────────
export function downloadTemplate(schemaKey) {
  const schema = IMPORT_SCHEMAS[schemaKey]
  if (!schema) return

  const headers = Object.values(schema.columns).map((c) => c.label)
  const ws = XLSX.utils.aoa_to_sheet([headers])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Template')
  XLSX.writeFile(wb, `pharmapulse-${schemaKey}-template.xlsx`)
}
