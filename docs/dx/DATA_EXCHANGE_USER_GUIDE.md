# Data Exchange Studio — User Guide

This guide covers the admin-facing Data Exchange Studio page used to
bulk-import Groups, Branches, Pharmacists, Assignments, KPI Registry
entries, Targets, and Actuals via Excel/CSV workbooks.

## 1. Download a template

Open **Data Exchange Studio → Template Library**. Templates are
grouped: Organization Setup, KPI & Targets, Actuals. Click **Download**
next to the template you need. Each workbook contains:

- One or more **data sheets** with the exact column headers the import
  expects, a worked **example row**, autofilter, and sized columns.
- An **Instructions** sheet explaining required vs. optional columns,
  allowed values for any closed set (status, role, KPI category/
  direction/lifecycle stage, etc.), date/month formats, and what an
  empty cell means versus a zero.
- A **Metadata** sheet showing the template name, version, and the
  sheet(s) it expects — this is informational, you don't need to edit it.

## 2. Fill in your data

- Use the **identifiers** the Instructions sheet specifies (e.g. Branch
  Code, Employee ID, KPI Key) — these are how rows are matched to
  existing records. A misspelled identifier is reported as an "Invalid
  Identifier" error rather than silently creating an unrelated record.
- **Leave a cell blank** to skip that field entirely (it is left
  untouched on commit). Enter **0** only when you mean the value is
  actually zero — blank and zero are never treated the same.
- Re-importing the **same identifier with updated values** updates the
  existing record; it does not create a duplicate.

## 3. Upload, Validate, and review

1. Click **Upload workbook** and choose your file.
2. The Studio checks the file's template version automatically. An
   unsupported (future) version is rejected immediately with a clear
   message asking you to download a fresh template — your file is
   never silently misread.
3. Click **Validate**. This is a **preview only** — it makes zero
   changes to your data. You'll see, per row: whether it's new,
   updated, a duplicate within the file, or blocked by an error.
4. Review any warnings or errors. Common categories you may see:
   - **Missing Required Column** — a required field was left blank.
   - **Invalid Identifier** — a code/key/email didn't match anything
     in the system, or referenced an inactive record.
   - **Duplicate Row** — two rows in your file resolve to the same
     record; only one will be applied.
   - **Existing Record Conflict** — your row would conflict with data
     already in the system in a way that needs your attention.
   - **Permission Denied** — the row falls outside your role's scope.

## 4. Confirm and Commit

- Once validation shows no blocking errors, tick the confirmation
  checkbox and click **Commit**. The Commit button is disabled until
  you've validated and confirmed — and disables itself the instant a
  commit starts, so clicking it again (or twice quickly) cannot start
  a second commit.
- If something about your data changed on the server since you
  validated, the commit is blocked with a **Stale Preview** message —
  re-validate before committing.

## 5. Large files — retry, resume, and cancel (Actuals only)

Branch Actuals and Pharmacist Actuals support large files with chunked
commit:

- A **progress bar** shows rows committed and elapsed time during commit.
- You can **Cancel** mid-commit — already-committed rows stay
  committed, nothing in progress is rolled back.
- If a commit is interrupted or partially fails, you can **Resume /
  Retry** — only the rows that didn't succeed are retried; already-
  successful rows are never re-applied.
- If you change the source file before resuming, the Studio detects
  this and asks you to re-validate rather than resuming against a
  stale file.

Organization Onboarding, KPI Registry, and Targets imports commit in a
single pass — if a row fails, the result tells you exactly which rows
succeeded and which didn't; correct the failed rows and re-upload them.

## 6. Supported file types and size

- Supported formats: `.xlsx`, `.xls`, `.csv`.
- Practical row ceiling: **2,000 rows per file**. Larger files should be
  split.

## 7. Import History

The **Import History** section on the Studio page lists your recent
imports — date, domain, file name, status, and row counts — so you can
confirm whether an import completed, partially failed, or is still
retryable, without needing to re-run it to find out.
