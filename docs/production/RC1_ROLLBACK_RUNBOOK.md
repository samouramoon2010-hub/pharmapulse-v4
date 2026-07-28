# RC1 Rollback Runbook

## Current state

| | Deploy ID | Commit | Branch | Status |
|---|---|---|---|---|
| **Now live (RC1)** | `6a3f69996cc10217f4d88321` | `5f10971886e7b1aafa624282502f51370db79a4e` (tag `pharmapulse-rc1`) | n/a (manual deploy, not Git-triggered) | Published |
| Previous production deploy | `6a235b65ece4e800088186ac` | `981a6dd8a0d64cb537082b517c12c4b803b12864` ("Evaluation stabilization complete") | `main` | Superseded, still retained by Netlify |

## Rollback method

Netlify retains every deploy for a site. Rolling back does **not** require a rebuild or a Git
revert — it republishes an already-built, already-validated artifact:

```
netlify api restoreSiteDeploy --data "{\"site_id\":\"842fdc4a-ee93-44b7-9bc0-08d3804331fc\",\"deploy_id\":\"6a235b65ece4e800088186ac\"}"
```

(Equivalently: in the Netlify UI, Deploys → select the `6a235b65ece4e800088186ac` deploy →
"Publish deploy".) This is the exact mechanism used to *promote* RC1 in the first place, run in
reverse.

No force operation, no Git history change, and no rebuild is involved either way.

## Rollback triggers (do not roll back unless one of these is confirmed)

- A confirmed, user-impacting defect introduced specifically by the RC1 deploy (not a pre-existing
  issue already logged in `RC1_DEPLOYMENT_ISSUES.md`).
- Availability failure (production URL not serving traffic, or returning errors at the HTTP
  level).
- A confirmed security exposure traceable to the RC1 build that the previous build did not have.

## Who authorizes a rollback

The repository owner (Samir Goda). This runbook documents the mechanism only — it does not
authorize execution. No rollback has been performed; this document is prepared in advance per the
deployment phase's rollback-readiness requirement.

## Notes

- Rolling back does not touch Git: the `pharmapulse-rc1` tag, the `feature/data-exchange-studio-v1`
  branch, and `main` are all unaffected by either publishing or un-publishing a Netlify deploy.
- Rolling back to `6a235b65ece4e800088186ac` would also restore the pre-existing PWA-icon and
  missing-security-header gaps described in `RC1_DEPLOYMENT_ISSUES.md` — those are present in both
  builds, so rollback neither introduces nor fixes them.
