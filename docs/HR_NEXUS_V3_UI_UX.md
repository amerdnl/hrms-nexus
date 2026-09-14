# HR Nexus V3 — final UI/UX implementation record

The authenticated-product design pass run against `HR_NEXUS_V3_DEFINITIVE_FINAL_UI_UX_MASTER.md`,
with the owner's approved mountain dashboard (`HR_Nexus_Approved_Mountain_Dashboard_Reference.png`,
1536 × 1024, SHA-256 `497f16fb…20eb`) as the immutable visual reference. Functional behaviour,
authorization and source data are the V3 release baseline recorded in
[HR_NEXUS_V3_PLAN.md](HR_NEXUS_V3_PLAN.md) and [HR_NEXUS_V3_RELEASE.md](HR_NEXUS_V3_RELEASE.md).

## U0 — Baseline and design audit (14 September 2026)

Repository: `feat/hr-nexus-v3` at `e15bfdc`, clean apart from the protected untracked
`HR_NEXUS_V2_MASTER.md` and `docs/schema.dbml`; only tag `v2.0.0-rc1`, locally and on `origin`;
no `v3.0.0`.

Frontend baseline, unchanged since `e99fd5a`:

| Check | Result |
| --- | --- |
| `tsc -b` | pass |
| `oxlint` | pass, 0 warnings |
| `vite build` | pass |
| `check:bundle` | 50 lazy pages, 152 JS chunks, initial JS 347.25 kB (gzip 112.99 kB) against a 380 / 125 kB budget |
| Current UI captured | the M10 visual gate's 411 screenshots (every route per role at 1280, 390 and 375 in light, dark and System) were taken on this exact frontend and are the "before" record |

### What the current product is

A permanent 288 px sidebar (sections Company or Me, My team when a manager, Workplace), a sticky
top bar with breadcrumbs, search, notifications and the account menu, and a five-slot phone bottom
bar with a More sheet. Admin Home is a stat grid over lists; Employee Home is a Today card over a
long side column. The master replaces the sidebar shell and both Homes.

### The reference, measured

Sampled from the reference image rather than estimated:

| Element | Measurement |
| --- | --- |
| Header | 72 px, near-white cool surface `#f4f9fb` |
| Hero | full bleed, y 72–368 (297 px at 1536) |
| KPI cards | 96 px tall, overlapping the hero by 32 px; four across with ~14 px gaps |
| Content | 36 px side gutters at 1536; rows of three cards (475 / 484 / 475 px) with 14–15 px gaps |
| Canvas | `#f3f6f7`; cards white with a near-invisible edge and very soft shadow, ~12 px radius |
| Text | navy `#081a30` titles, `#183245` figures |
| Accent | deep teal: brand mark `#064140`, active nav pill `#ddeceb`, icon discs `#e5f5f3`, timeline dots `#145450` |
| Quick-access tiles | eight pale tints (teal, blue, violet, green, amber, rose, sky, grey) |
| Activity dots | green, blue, violet, grey |

### Hero asset

No separate hero photograph exists in the repository or was supplied; the approved reference is
the only copy. The hero is therefore derived from the reference itself, not substituted:

1. The band y 72–368 was cropped at the reference's own resolution.
2. The baked-in text (greeting, "People today" and "HR Nexus" ornaments) was removed. The sky
   areas were filled from their surroundings; the forest area under "HR Nexus" was given a
   harmonic fill with fine grain, because copied texture repeated visibly.
3. The 33 px strip the KPI cards covered was rebuilt as a softened mirror of the rows above it.
4. The result is `frontend/src/assets/home-hero.webp` (1536 × 297, 63 KB, SHA-256 `b18af8dd…841e`).
   The live greeting and ornaments are rendered as real text in the same positions.

Known limits: the source is 1536 px wide, so the image is upscaled on wider screens and on
high-density phones. Replacing that one file with the original high-resolution photograph changes
nothing else.

### Real data behind the reference's composition

Nothing is fabricated. Checked against the demo API for each role:

| Reference element | Real V3 source |
| --- | --- |
| KPI row (Admin) | `/dashboard/admin`: employees, present today, on leave today, pending leave decisions |
| Today's priorities | Action Center `requiresAction` (leave decisions, lifecycle tasks, payroll steps, reviews, overdue goals, attendance exceptions, important announcements) |
| Today (date block and timeline) | company calendar: today's holidays and events, then the next ones coming up |
| Who's out today | calendar absences covering the company's today (leave type only where the viewer may see it) |
| Recent activity (Admin) | the audit log, business actions only (sign-ins and exports left out) |
| Recent activity (Employee) | the Action Center's recent notifications |
| Quick access | the permission-aware destination registry that also drives the App Launcher |
| Editorial card | brand copy with one real destination (People) |

The reference's trend chips ("↑ 6%", "+8 from last month") have no source: V3 records no
historical snapshots, and the analytics design already reports counts, never trends. Those
positions carry real facts about the same figure instead.

## U1 — Design system (14 September 2026)

- **Tokens.** Light palette sampled from the reference; a designed deep-navy dark palette; eight
  tint pairs for tiles and markers; a `--header` surface; a shell `--gutter` custom property
  (16 / 24 / 32 / 36 px) that full-bleed elements can cancel exactly. Every text, control and tint
  pair re-measured (lowest: body text 4.55:1, control borders 3.26:1, tint glyphs 4.73:1).
- **Primitives.** Cards lose the rule under their header (it returns only over full-bleed tables),
  titles are navy with a navy icon, radii soften to 12 px, table headers are sentence case, page
  titles are semibold, StatCard takes the reference KPI layout, and buttons gain an `inverse`
  variant for controls on photography.

## U2 — Authenticated shell (14 September 2026)

The permanent sidebar is removed, not hidden: `Sidebar.tsx` and its tokens are deleted.

| Area | Now |
| --- | --- |
| Header | mountain mark and wordmark (tagline from 1440 px), four persistent destinations, then Search, App Launcher, Notifications and the account |
| Persistent destinations | built from one registry in `routes/navigation.ts` for the session's capabilities |
| App Launcher | the complete, grouped, permission-aware directory; a popover from md, a bottom sheet on phones; filter field, arrow-key grid navigation, Escape and outside-pointer close with focus return |
| Account menu | profile (employees), a labelled Theme group (Light, Dark, System) and Sign out; the theme control therefore lives in one place at every width |
| Notifications | the reference's unread dot; the count stays in the button's name and the panel |
| Search | the reference's white pill from 1280 px, an icon below; ⌘K / Ctrl+K unchanged, palette still loaded on demand |
| Breadcrumbs | rooted at Home, rendered inside each page's own content width (PageHeader, and the profile page) from md up |
| Phone | compact header with every utility, and a bottom bar with the same four destinations; no More slot, because the launcher opens from the header at every width |

The four destinations are honest per role rather than uniform:

| Role | Home | People | Third | Workflows |
| --- | --- | --- | --- | --- |
| HR administrator | Admin Home | directory (also lit on employee and department records) | **Insights** → Reports | Action Center (also lit on onboarding, offboarding, performance) |
| Manager | Employee Home | directory | **Team** → team overview, which carries the team insights | Action Center |
| Employee | Employee Home | directory | **Growth** → goals and reviews | Action Center |

An employee has no reporting destination, and inventing one to keep the label would be fake UI;
a manager's insight destination is their team overview, so it is named for what it is.

Launcher groups: HR — People, Time & leave, Workflows, Pay & insights, Workplace, Administration
(20 destinations, plus My team if the account manages people); employee — Me, Workplace
(13), with My team between them for a manager (18).

Verification (`u2-shell.mjs`, real sign-ins on the demo stack): **129/129**. Header destinations
and launcher contents per role, with nothing an account may not open; launcher focus, arrow keys,
filter, Enter, Escape and outside close; theme group applies Dark; no overflow or clipped header
control at 1536, 1280, 1024, 834, 390 and 375 in light and dark; one primary navigation visible
at each width; the phone sheet fits and returns focus; the manager's Team slot stays lit on team
pages. The first run found the 1280 header 34–36 px too wide; the account name and role now
appear from 1440 px.
