# HR Nexus V3 release procedure

How V3 is verified before the `v3.0.0` tag, and what must still hold afterwards. The
milestone record, decisions and every measured result are in
[HR_NEXUS_V3_PLAN.md](HR_NEXUS_V3_PLAN.md); the design is in
[HR_NEXUS_V3_ARCHITECTURE.md](HR_NEXUS_V3_ARCHITECTURE.md).

**The tag is created by a person.** Automation prepares the repository and reports whether
it is ready; it never creates or pushes `v3.0.0` (master §43).

## Protected baseline

These hold before and after every step, and are re-read at release:

- The migration ledger contains exactly the reviewed files, each with its recorded
  SHA-256 (below).
- The five historical attendance rows without an employee record are unchanged
  (fingerprint `1:1,3:1,4:2,5:1,6:1`). They are never reconciled or deleted.
- The September 2026 payroll period exists and is not destroyed. Its accepted state is
  `calculated` (with no payroll records), set by the owner through the application on
  14 September 2026; it changes only through the normal payroll workflow.
- Employees, accounts and attendance on the application database are unchanged by any
  release step. No demo data is ever written there.
- `HR_NEXUS_V2_MASTER.md` and `docs/schema.dbml` stay untracked.
- The Docker volume `hr-nexus_postgres_data` is never removed: no `docker compose down -v`.

## 1. Code checks

```bash
cd frontend && npx tsc -b && npm run lint && npm run build && npm run check:bundle
cd backend  && npm run type-check && npm test
```

`check:bundle` fails if any page is imported statically, if the vendor chunks are missing,
or if a first visit downloads more than 380 kB of JavaScript (125 kB gzip).

## 2. Backend laboratory suite

Every database suite runs in a throwaway backend container on the isolated laboratory
network `hr-nexus-v2-migration-lab`, against clones of the `hr_nexus_v2_settings_baseline`
database. The laboratory cannot reach the application database, which sits on the compose
network only. From the repository root:

```bash
docker run --rm --volumes-from hr-nexus-backend:ro --network hr-nexus-v2-migration-lab \
  -e HR_NEXUS_MIGRATION_LAB=1 -e HR_NEXUS_SETTINGS_LAB=1 -e HR_NEXUS_EMPLOYEE_LAB=1 \
  -e HR_NEXUS_IMPORT_LAB=1 -e HR_NEXUS_ATTENDANCE_LAB=1 -e HR_NEXUS_LEAVE_LAB=1 \
  -e HR_NEXUS_PAYROLL_LAB=1 -e HR_NEXUS_REPORTS_LAB=1 -e HR_NEXUS_AUDIT_LAB=1 \
  -e HR_NEXUS_DEMO_LAB=1 -e HR_NEXUS_DASHBOARD_LAB=1 -e HR_NEXUS_EXPORT_LAB=1 \
  -e HR_NEXUS_PASSWORD_LAB=1 -e HR_NEXUS_V3_LAB=1 -e HR_NEXUS_DB_TESTS=1 \
  -e DATABASE_URL=postgresql://postgres@hr-nexus-v2-migration-lab/postgres \
  --mount "type=bind,src=$PWD/database,dst=/database,readonly" \
  --mount "type=bind,src=$PWD/docs,dst=/docs,readonly" \
  hr-nexus-backend sh -c "node --import tsx --test tests/*.test.ts"
```

Every test must pass and none may be skipped. A passing suite drops the clones it
created; a failing one keeps them for inspection.

## 3. Migrations

V3 adds 0010–0016. Each was applied to the application database only through the guarded
procedure in the plan: a fresh `pg_dump` with its checksum, a proven restore, a rehearsal
of apply, no-op, rollback in reverse order and re-apply on the restored copy, then the
application apply, a no-op, a business-data fingerprint comparison and a post-apply dump.
Evidence lives in `.local-backups/<versions>-<date>/`. Rollback scripts are in `docs/sql/`.

| Version | File | SHA-256 |
| --- | --- | --- |
| 0010 | `0010_org_structure.sql` | `e2b1a23bb35c60f1113565afed956b058dd0f647be9310677c2bd961f96ec308` |
| 0011 | `0011_profiles_timeline.sql` | `1e1f92c588a7df8faf706d35ed0336879a3b5b1c17473df0f2e2c157e404b5d0` |
| 0012 | `0012_notifications.sql` | `8c4b0dd53344cb84da4d9f2361a6d8cbfbf1407cfb936601f09a000f4e22cb30` |
| 0013 | `0013_announcements_calendar.sql` | `d5b5edbb977722099e211cb871bb2c2094701df39b7aacb0adfb98522b7696e2` |
| 0014 | `0014_lifecycle.sql` | `0284a031967c01005de5bba675b6afcdda0e110b42e8785a8daa243edaed6503` |
| 0015 | `0015_recognition.sql` | `a0a398d23072b52879497fcbd6fbc7479154edfb44ffb127ef00e35f2697a559` |
| 0016 | `0016_goals_reviews.sql` | `a124d261f81655bfeb9fad77c6c2e92bab5b62b36d43186b31a80f3335acb442` |
| 0017 | `0017_dashboard_layouts.sql` | `a86a44d4297426c29bd48ebdb718abfa5e664bf6bffb218a2944e1618d2c3c63` — **not applied to the application database** (see below) |

Every V3 migration only adds tables, columns, constraints, indexes and triggers. None
drops, rewrites or reconciles anything.

**0017 (15 September 2026)** adds one table, `user_dashboard_layouts`, for opt-in Home
personalization (architecture §13).
- **Where it has been applied:** only to laboratory clones and the isolated V3 demo database. The
  pass that introduced it forbids changing the protected source database, so `hr_nexus` still ends
  at 0016.
- **Until it is applied there:** the layout API reports personalization as unavailable, every
  account keeps the approved default Home, and nothing else is affected.
- **Applying it:** a separate, approved step through the migration procedure.
- **Rollback:** `docs/sql/rollback_0017_dashboard_layouts.sql`, SHA-256
  `42b724fb6365f47902980eec553306b94af31a5b7a94c8dad121e543373afe08`.

## 3b. Presentation environment (16 September 2026)

The presentation company, Meridian Digital Solutions Sdn. Bhd., is a **second isolated
environment**, separate from the demo the browser gates assert against:

| | |
| --- | --- |
| Database | `hr_nexus_v3_presentation` on `hr-nexus-v2-migration-lab` |
| API | `hr-nexus-v3-presentation-api`, host port 5019 |
| Bundle | host port 5191, built against `http://localhost:5019/api` |
| Migrations | `0001`-`0017`, including `0017_dashboard_layouts` |
| Rebuild | `PRESENTATION_PASSWORD=… scripts/presentation-reset.sh` |
| Integrity | `scripts/presentation-integrity.sql`, 20 cross-module assertions |

It is described in `HR_NEXUS_V3_PRESENTATION.md`. The application database is not involved: it
still ends at 0016 and has no `user_dashboard_layouts` table.

## 4. Demo stack

Browser verification uses an isolated demo company, never the application database:
see [HR_NEXUS_V3_DEMO.md](HR_NEXUS_V3_DEMO.md).

## 5. Browser gates

Run against a production build (`vite build`) served locally and pointed at the demo API.
The browser tooling (playwright-core and axe-core) is used from outside the repository, so
the project gains no dependency for it.

| Gate | What it checks |
| --- | --- |
| Milestone smokes M1–M8 | each module's real workflows by role, on a freshly rebuilt demo each time |
| Workflow gate (master §39) | the twenty end-to-end workflows, including verified attendance |
| Visual gate (master §38) | every relevant route per role at 1280, 390 and 375 in light, dark and System: overflow, duplicate headings, bottom-navigation overlap, stuck loading, error states, menus, the More sheet, dialogs and permission redirects, with screenshots reviewed by eye |
| Accessibility | axe WCAG 2.2 AA across routes, dialogs and panels in both themes, plus keyboard, focus and focus-return checks |
| V2 navigation gate | V2 destinations, themes and system preference still behave |

## 6. Source integrity (master §40)

Read-only against the application database:

1. The migration ledger and checksums match section 3.
2. Base table count (34: V2's 18 and V3's 16), employee, account and attendance counts,
   the orphan fingerprint, the September 2026 payroll state and the number of accounts
   flagged for a password change.
3. A business-data fingerprint compared with the last recorded one. Any difference is
   explained from the audit log before release.
4. A fresh `pg_dump -Fc` with its SHA-256, restored into an isolated laboratory database
   and fingerprinted to prove the restore. A backup is reported only once restored.
5. Isolation: the laboratory and the demo API are on the laboratory network, and the
   application database only on the compose network.

## 7. Tagging

Only when every gate passes and the release report says `READY FOR v3.0.0`, a person with
authority to release reviews the report and tags:

```bash
git switch feat/hr-nexus-v3
git tag -a v3.0.0 -m "HR Nexus V3"
git push origin v3.0.0
```

Never force-push, and never tag from a working tree with unexplained changes.

## Intentionally unsupported

See [HR_NEXUS_V3_ARCHITECTURE.md §11](HR_NEXUS_V3_ARCHITECTURE.md): automated Malaysian
statutory payroll, transitive manager scope, holidays excluded from leave counts,
employee self-service attendance corrections, multi-company tenancy, document storage,
external identity providers, self sign-up, email password reset and real-time sockets.
