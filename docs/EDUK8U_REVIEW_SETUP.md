# EDUK8U review environment

A copy of HR Nexus that holds the EDUK8U Group org chart and nothing else, so
Dr. Roy Prasad can look at his own structure in the product and correct it.

It runs beside the Meridian presentation environment without touching it. The
two have separate databases, separate containers, separate volumes, separate
ports and separate secrets, so starting, rebuilding or destroying this one
cannot affect the presentation company.

| | Presentation (Meridian) | Review (EDUK8U) |
| --- | --- | --- |
| Compose file | `docker-compose.yml` | `docker-compose.eduk8u.yml` |
| Compose project | `hr-nexus` | `hr-nexus-eduk8u` |
| Database | `hr_nexus_v3_presentation` | `hr_nexus_eduk8u` |
| Volume | `hr-nexus_postgres_data` | `hr-nexus-eduk8u_eduk8u_postgres_data` |
| Settings file | `.env` | `.env.eduk8u` |
| Frontend | http://localhost:5173 | http://localhost:5174 |
| API | http://localhost:5001 | http://localhost:5002 |
| Postgres | `localhost:5433` | `127.0.0.1:5435` |
| Loaded by | `seedPresentation.ts` | `bootstrapEduk8u.ts` |
| Contents | a synthetic company with a year of activity | 29 positions and their reporting lines |

`seedPresentation.ts` is never run against the EDUK8U database, and
`bootstrapEduk8u.ts` refuses outright to run against any database that holds the
Meridian company.

## What is in it

- **29 entries**: 21 unfilled positions from the chart, and 8 external or
  advisory parties from below its dividing line.
- **No people.** The source names nobody, so every entry is marked as a position
  or as external, and the interface says so in words on each card.
- **No personal data and no history.** No emails, phone numbers, addresses,
  dates of birth, start dates or salaries; no attendance, leave, payroll, goals
  or reviews. The source has none of it, so neither does this.
- **One administrator account**, which exists to open the environment and is not
  one of the positions on the chart.

## Starting it

You need Docker Desktop running. From the repository root:

```bash
cp .env.eduk8u.example .env.eduk8u
```

Open `.env.eduk8u` and set `POSTGRES_PASSWORD` and `JWT_SECRET` to fresh random
values. `openssl rand -base64 48` will produce one. Then:

```bash
docker compose -f docker-compose.eduk8u.yml --env-file .env.eduk8u up -d --build
```

Open **http://localhost:5174**.

`.env.eduk8u` is ignored by Git and must never be committed.

### Signing in the first time

The account is the `EDUK8U_ADMIN_EMAIL` from your settings file, which defaults
to `hr.review@eduk8u.invalid`. (`.invalid` is reserved by RFC 2606 and can never
be a real mailbox, which is what you want until you decide to use a real one.)

If you did not set `EDUK8U_ADMIN_PASSWORD`, the bootstrap generated one and
printed it once:

```bash
docker compose -f docker-compose.eduk8u.yml --env-file .env.eduk8u logs eduk8u-setup
```

Either way the account **must choose a new password on first sign-in** before it
can reach anything, so the password the bootstrap knew stops working the moment
you use it. The password is never stored anywhere in plain text, and it is not
written in this file or in any other tracked file.

### Stopping and starting again

```bash
docker compose -f docker-compose.eduk8u.yml --env-file .env.eduk8u down     # keeps the data
docker compose -f docker-compose.eduk8u.yml --env-file .env.eduk8u up -d    # brings it back
```

`down` without `-v` keeps the volume, so your corrections survive. Bringing it
up again re-runs the bootstrap, which **rebuilds the chart from the source file
and discards edits made through the interface** — see the next section.

## Looking at the org chart

**People → Org chart** in the navigation, or http://localhost:5174/org.

The two branches at the top are the Group CEO & CHRO and the Group Chief
Marketing Officer & Co-Founder; the source draws no line between them, which is
question 1 in [EDUK8U_ORG_MAPPING.md](EDUK8U_ORG_MAPPING.md). The external and
advisory parties are listed under **Not connected to the chart**, because the
source gives them no reporting line.

Each card says what it is: a dashed outline and "Position · not filled", or
"External · not employed here". Neither gets an avatar, because a face or a set
of initials asserts a person.

### Sending a copy to Dr. Roy

**Print or save as PDF** on the org chart page opens the browser's own print
dialogue. It expands every branch first, so nothing is missing from the copy,
and the printed page drops the navigation, forces the light palette and prints
A4 landscape. In Chrome, choose "Save as PDF" as the destination.

The printed copy was checked in a real headless Chromium, not by reading the
stylesheet: **one A3 landscape sheet** (1191 x 842pt), all 29 cards, the whole
composition, the External / Advisory area below its dividing rule, navigation
gone, the legend present, and the sheet headed "EDUK8U Group — org chart".

A3 rather than A4 because the chart on A4 is either unreadable or cut into
pieces, and a chart in pieces is not a chart. The drawing is scaled once, to
about 46%, to fit that sheet - the one place where scaling to fit is the right
answer, because paper cannot scroll.

Send that PDF together with `docs/EDUK8U_ORG_MAPPING.md`, which is where the six
open questions are written down.

## Correcting the chart

Dr. Roy is expected to correct this. There are two ways, and they behave
differently.

**For a quick change while he is watching**, edit the reporting line in the
product. Open the position from **People** (or from its card on the org chart),
then **Edit**, and change the **Reports to** field — it is in the employment
section, and "No manager" clears the line. The change is live and the org chart
redraws. The list of possible managers already excludes anyone below the
position, and the database refuses a reporting line that would loop back on
itself, so neither you nor Dr. Roy can break the chart from here.

Changes made this way are **lost the next time the bootstrap runs**, which
includes every `up` that starts the `eduk8u-setup` container.

**For a change that should stick**, edit `backend/src/database/eduk8uData.ts` —
it is the source of truth, and each entry carries its own `confidence` and
`note` — then re-run the bootstrap:

```bash
docker compose -f docker-compose.eduk8u.yml --env-file .env.eduk8u up -d --build eduk8u-setup
```

Then update the table in [EDUK8U_ORG_MAPPING.md](EDUK8U_ORG_MAPPING.md) and the
expected structure in `backend/tests/eduk8u-org.test.ts`, which holds the chart's
connector list so that an accidental change to a reporting line fails a test
instead of reaching Dr. Roy.

## Backup and restore

The review environment can always be rebuilt from source, so the thing worth
backing up is any correction made through the interface.

```bash
# Back up
docker exec hr-nexus-eduk8u-postgres pg_dump -U postgres -d hr_nexus_eduk8u \
  --no-owner --no-privileges > .local-backups/eduk8u-$(date +%Y%m%d-%H%M%S).sql

# Restore into an empty database
docker exec -i hr-nexus-eduk8u-postgres psql -U postgres -d hr_nexus_eduk8u \
  < .local-backups/eduk8u-YYYYMMDD-HHMMSS.sql
```

`.local-backups/` is ignored by Git. A dump contains password hashes, so keep it
off shared drives and out of commits.

The Meridian presentation environment is backed up the same way, against
`hr-nexus-postgres` and `hr_nexus_v3_presentation`.

## Deploying this somewhere Dr. Roy can reach

**This is not currently deployed anywhere, and what is described above is not a
deployment.** It runs on one machine, on `localhost`, behind Docker's dev
servers. Do not treat the URLs above as something to send to anyone.

What is already true and can be carried over:

- The API and database ports bind to `127.0.0.1`, so nothing is exposed to the
  network by accident.
- The API base URL, the frontend URL and the JWT secret are all configuration,
  not constants in the source.
- No password is committed anywhere, and the administrator account is forced to
  change its password on first use.
- There is a production build (`npm run build` in `frontend/`) and a production
  start (`npm run build && npm start` in `backend/`).

What is still required, and what only you can decide:

1. **A host and a domain.** No provider, server or DNS name has been chosen, and
   nothing here assumes one.
2. **HTTPS**, terminated by a reverse proxy in front of both services. Sign-in
   tokens must never cross plain HTTP.
3. **A production Compose file** without the `./backend:/app` and
   `./frontend:/app` bind mounts, running `npm start` against the built output
   rather than the dev servers, and serving the built frontend as static files
   rather than through Vite.
4. **`VITE_API_BASE_URL` set to the public API URL** at build time, and
   `FRONTEND_URL` set to the public site URL so CORS matches it.
5. **A fresh `JWT_SECRET` and Postgres password** for that environment. Do not
   reuse the local ones.
6. **The Postgres port not published at all** — the API reaches it over the
   Compose network.
7. **A backup schedule** for the volume, using the `pg_dump` above.
8. **A decision about who may sign in**, since anything reachable on the
   internet will be found. At minimum, keep it to the one review account and
   remove it when the review is over.

Until items 1–6 are done, the honest description of this environment is
"deployment-ready configuration, running locally".


## What a position is not

The 21 positions are stored as employee records because that is how HR Nexus
draws an org chart. They are marked `position_kind = 'vacant'` (and the 8
advisers `'external'`), and everything that measures or operates on the
workforce excludes them. In this environment every one of these reads **zero**,
while the org chart still shows all 29:

| Where | Vacant and external records |
| --- | --- |
| Admin dashboard, total and active employees | excluded |
| Workforce report: totals, by department, by status | excluded |
| Department headcount in the data export | excluded |
| Payroll: who appears in a run | excluded |
| Performance: who is added to a review cycle | excluded |
| Onboarding / offboarding: who a plan can be started for | refused outright |
| People directory | shown, labelled "Position · not filled" / "External · not employed here" |
| **Org chart** | **shown — this is what they exist for** |

The rule is one line in `backend/src/auth/policy.ts`: anything that counts or
pays people filters on it, anything that draws the shape of the organisation
does not. `backend/tests/position-kind-scope.test.ts` fails if a query drops the
filter, or if the org chart ever gains one.

## How the chart is laid out

EDUK8U's chart is **placed where its source places it**. Each box carries the
coordinates the original PowerPoint gives it, stored in `org_chart_source_layout`
and loaded by the bootstrap, and the renderer puts the cards there and derives
the connectors from those positions. The result is meant to be recognisable as
Dr. Roy's own chart rather than correct-but-rearranged.

It is drawn at **one fixed, readable scale**, with the ordinary HR Nexus card.
There is no zoom, no pan and no fit-to-view: the chart is wider than a screen,
and the honest answer to that is a scrollbar. Scroll sideways within the chart
and up and down with the page.

A company with no imported chart - Meridian, or any real customer - has no rows
in that table, and its org chart lays itself out automatically exactly as before.
Nothing about EDUK8U's geometry reaches it.

Two boxes on the chart are **not positions**: the source's "SALES / BD Function"
reference box and its approval footer. They are stored as labelled notes in
`org_chart_source_notes`, drawn as plain notes rather than cards, and can never
become employee records.

An unconfirmed reporting line is drawn with a dashed amber connector **and**
labelled "Reporting line unconfirmed" on the card, because a dashed line is easy
to miss, says nothing to a screen reader, and does not survive a photocopy.

## Known limitations

- **One manager per position.** Two entries on the source chart are drawn with
  two reporting lines each. HR Nexus records one, so the second line is written
  down in the mapping document instead of being shown on the chart.
- **Boxes standing for two people** ("Marketing: GD Intern KL X 2", "2 X Tech
  Intern") are one entry each, as drawn.
- **Positions carry the employment status `active`** because that is what makes
  a position visible on the chart. What each entry actually is comes from its
  position kind, which the chart shows on every card, and no workforce figure
  counts it — see "What a position is not" below.
- **External parties are listed, not placed.** The source draws them no
  reporting line, so they appear under "Not connected to the chart".
- **Six reporting lines are unconfirmed.** They are listed in
  [EDUK8U_ORG_MAPPING.md](EDUK8U_ORG_MAPPING.md) and need Dr. Roy's answer.
- **Interface edits are overwritten by the bootstrap.** See "Correcting the
  chart" above.
