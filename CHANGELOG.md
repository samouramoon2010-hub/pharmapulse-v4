# Changelog — PharmaPulse

## [2.0.0] — Production Release

### ✅ Added
- **Firebase Production Integration** — dual-mode (Demo/Production)
- **Audit Log System** (`audit_logs` collection) — every create/update/delete/approve/reject/import/login recorded with before/after snapshots
- **Excel Import Service** — upload → validate → preview → batch write to Firestore
  - Supports: pharmacies, users, targets
  - Template download for each type
  - Row-level validation with Arabic error messages
- **Excel Import Page** — drag-drop UI with full validation display
- **Audit Logs Page** (Admin only) — searchable, filterable, expandable before/after diff
- **`auditService.js`** — centralized logging service
- **`importService.js`** — Excel read/validate/import with Firestore batch writes
- **`COL` constants** in `firebase.js` — single source of truth for collection names
- New collections: `pharmacies`, `regions`, `targets`, `approvals`, `audit_logs`
- Firestore Indexes for all new query patterns (16 indexes)
- Production Firestore Security Rules with region/branch-level guards
- Node 20.19.0 in netlify.toml
- `/admin/audit` route — Audit Logs page
- `/*/import` routes — Excel Import page (admin, area, manager)

### 🔧 Changed
- `firebase.js` — migrated to `initializeFirestore` with persistent multi-tab cache
- `authStore.js` — audit logs on login/logout/profile update; error message mapping for all Firebase auth codes
- `kpiStore.js` — full audit logging on all mutations; strict KPI validation (no future dates, no negatives, no duplicate same-day entries except via update)
- `approvalStore.js` — full audit logging on approve/reject/bulk-approve
- `netlify.toml` — Node version → 20.19.0; deploy-preview auto sets `VITE_DEMO_MODE=true`
- `App.jsx` — added 6 new routes (audit, import ×3)
- `Sidebar.jsx` — added Excel Import + Audit Log nav items

### 🏗️ Architecture
- All Firestore collection names centralised in `COL` constant
- `IS_DEMO` flag exported from `firebase.js` (single source)
- All stores check `IS_DEMO` before touching Firestore
- Audit service works in both modes (in-memory vs Firestore)

## [1.0.0] — Base System

### ✅ Features
- React 19 + Vite + TailwindCSS + Firebase
- 4 Roles: Admin, Area Manager, Store Manager, Pharmacist
- Dynamic KPI Builder with Formula type
- Realtime Firestore listeners
- KPI Entry with validation
- Approval Workflow (pending/approved/rejected/needs_edit)
- Alert Center (auto-generated)
- Branch Management (CRUD)
- Team Management (CRUD)
- Reports (daily/weekly/monthly) + CSV + Excel export
- Demo Mode (no Firebase needed)
- PWA support
- Netlify deployment
