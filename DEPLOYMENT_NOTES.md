# PharmaPulse — Firestore Deployment Notes

## Project

Firebase project ID: `pharmapulse-646de`

---

## Files managed by Firebase CLI

| File | Purpose |
|---|---|
| `firestore.rules` | Security rules for all Firestore collections |
| `firestore.indexes.json` | Composite indexes for query performance |
| `firebase.json` | Firebase CLI deployment configuration |
| `.firebaserc` | Project alias (maps `default` → `pharmapulse-646de`) |

These files are the **source of truth** for Firestore security and indexes.
Always edit them locally and deploy via the CLI — never edit rules directly in
the Firebase Console unless you then copy the changes back to the local files.

---

## Prerequisites

```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Log in to Firebase
firebase login
```

---

## Deploy Firestore rules and indexes

```bash
# Deploy ONLY Firestore rules and indexes (safe — does not touch Hosting or Functions)
firebase deploy --only firestore
```

This command deploys both `firestore.rules` and `firestore.indexes.json` together.

To deploy each separately:

```bash
# Rules only
firebase deploy --only firestore:rules

# Indexes only
firebase deploy --only firestore:indexes
```

---

## ⚠️ Important: index deletion prompt

When deploying indexes, the Firebase CLI may ask:

```
The following indexes are present in your project but are not in your
firestore.indexes.json file. Would you like to delete them? (y/N)
```

**Choose N (No) unless you have reviewed the list and confirmed those
indexes are no longer needed.**

Deleting an index that is still used by a query will cause that query
to fail with a `FAILED_PRECONDITION` error in production.

---

## Shadow validation sprint — why this matters

The `shadow_evaluation_logs` collection rule was added locally in
`firestore.rules` but was never deployed to the live Firebase project.

Without deployment, Firestore applies its default **deny-all** to the
`shadow_evaluation_logs` collection, causing every `addDoc()` call to
receive `PERMISSION_DENIED`. This error is caught silently inside
`writeShadowEvaluationLog()` and logged only to `console.warn`, so
no shadow logs appear in Firestore.

**After deploying, verify:**

1. Firebase Console → Firestore → Rules tab shows `shadow_evaluation_logs`
2. Run a single-user evaluation from the admin UI
3. Check browser DevTools console — `[shadowLog] Failed...` should NOT appear
4. Check Firebase Console → Firestore → Data tab — `shadow_evaluation_logs`
   collection should appear with one document

---

## Verify deployment succeeded

```bash
# Check currently deployed rules
firebase firestore:rules:releases:list

# Or open the Firebase Console directly
# https://console.firebase.google.com/project/pharmapulse-646de/firestore/rules
```
