// ============================================================
// Closure Patch Part 7 (revised, follow-up closure patch Part 1) —
// typed re-export of db/COL.
//
// services/firebase.d.ts now declares this module's real exports
// accurately (Firestore/Auth/FirebaseApp SDK types + the literal COL
// key map), so importing '../firebase' carries zero TS7016. This
// wrapper is kept anyway as the DX-domain-scoped entry point, and so a
// file that only needs db/COL (e.g. firestoreStagingRepository.ts)
// doesn't read as depending on the wider firebase.js surface.
// ============================================================

import { db, COL } from '../firebase'

export { db, COL }
