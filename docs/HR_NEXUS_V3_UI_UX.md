# HR Nexus V3 — final UI/UX implementation record

The authenticated-product design pass run against `HR_NEXUS_V3_DEFINITIVE_FINAL_UI_UX_MASTER.md`.
Functional behaviour, authorization and source data are the V3 release baseline recorded in
[HR_NEXUS_V3_PLAN.md](HR_NEXUS_V3_PLAN.md) and [HR_NEXUS_V3_RELEASE.md](HR_NEXUS_V3_RELEASE.md).

## The approved reference

`HR_Nexus_FINAL_Approved_Dashboard_Reference.png` (1536 × 1024, SHA-256 `4be0d215…4790`) is the
single, immutable visual reference.

An earlier image, `HR_Nexus_Approved_Mountain_Dashboard_Reference.png`, was withdrawn by the owner
on 14 September 2026 while this pass was under way. Work derived from it was revised, not
propagated:

| Item | Status |
| --- | --- |
| Full-width photographic banner | removed |
| Hero asset derived from the withdrawn image | removed |
| Mountain brand glyph | removed; the header uses the established network mark |
| Pill navigation | replaced |
| Colour tokens | re-sampled from the final reference |
| Home composition | never implemented from the withdrawn image |
| Kept, because the final reference and the master still require them | the sidebar removal, the navigation registry, the launcher's permission model and keyboard behaviour, theme in the account menu, the phone bar, Home-rooted breadcrumbs |

## U0 — Baseline and design audit (14 September 2026)

Repository at the start: `feat/hr-nexus-v3` at `e15bfdc`, clean apart from the protected untracked
`HR_NEXUS_V2_MASTER.md` and `docs/schema.dbml`; only tag `v2.0.0-rc1`, locally and on `origin`;
no `v3.0.0`.

Frontend baseline (unchanged since `e99fd5a`):

| Check | Result |
| --- | --- |
| `tsc -b` | pass |
| `oxlint` | 0 warnings |
| `vite build` | pass |
| `check:bundle` | 50 lazy pages, 152 JS chunks, initial JS 347.25 kB (gzip 112.99 kB), against a 380 / 125 kB budget |

The M10 visual gate's 411 screenshots of that exact frontend are the "before" record. They cover
every route per role at 1280, 390 and 375, in light, dark and System.

**What the product was.** A permanent 288 px sidebar, a sticky top bar with breadcrumbs, and a
five-slot phone bar with a More sheet. Admin Home was a stat grid over lists; Employee Home was a
Today card beside a long side column.

### The final reference, measured

Sampled from the image, not estimated:

| Element | Measurement |
| --- | --- |
| Canvas | cool soft grey `#f1f4f6`; the header sits on it with no bar |
| Header | about 84 px |
| Header left | network mark and letterspaced `HR NEXUS` |
| Navigation | text links; the current one semibold, with a teal rule and a centre dot |
| Header right | search icon, rounded launcher button, bell with a red dot, avatar with name, role and chevron |
| Greeting | letterspaced time of day; 48 px semibold "Welcome back, {name}."; two muted lines |
| Primary action | a near-black split button (`#15262d`) |
| Mountain | misty range beside the greeting, fading into the canvas; small vertical "Better People Brighter Tomorrow" |
| Content | 56 px gutters at 1536; card gaps 16–17 px |
| KPI row | four cards (304 / 256 / 241 / 255 px), 124 px tall; tinted icon tiles (teal, blue, amber, rose); label over figure over fact; arrows on two; a sparkline on the first |
| Right column | an architectural brand card, 295 px wide, bottom-aligned with the Today row |
| Today | deep green feature card (`#10302c` → `#0b1e1d`, 748 px): date, a timeline, "Now" and schedule slots, "View calendar" |
| Tasks for Today | checklist with a completed count and "View all tasks" |
| Bottom row | Who's Out (blue "All day" chips), Recent Activity (icon discs, one red alert), Insights (daily bars, a period menu, three figures with deltas) |
| Launcher | 350 px panel under the header's right edge; "Search pages…" field; six teal tiles in a 3 × 2 grid with hairlines; "View all pages →" |
| Footer | `HR NEXUS` version at left, "— Built for people, not just records." at right |

### Imagery

No separate photographs were supplied. Both images are derived from the approved reference
itself, not substituted:

| Asset | How | Result |
| --- | --- | --- |
| `assets/home-mountain.webp` | crop of the mountain; the greeting's tail and the vertical words removed with a harmonic fill; the haze keyed to transparency against the canvas (darker-than-canvas pixels only); edges feathered | 668 × 296, 112 kB, SHA-256 `647ca12a…8392` |
| `assets/brand-building.webp` | crop of the brand card photograph; its text removed with a harmonic fill | 283 × 302, 6.5 kB, SHA-256 `06a36032…a6a6` |

The live copy is rendered as real text in the same places. In the light theme the keyed mountain
sits on the canvas as in the reference, with the low sun restored as a CSS glow. In the dark theme
the same image is a mask for a pale silhouette on navy. Replacing either file with the original
photograph changes nothing else.

## U1 — Design system

Tokens are re-sampled from the final reference and re-measured with the WCAG formula.

| Area | Measured |
| --- | --- |
| Body text | 4.84:1 lowest in light, 4.86:1 lowest in dark |
| Control borders | 3.21:1 lowest |
| Icon glyphs on tiles | every one ≥ 3:1 |
| Today feature card | text 13.97:1, accent 9.14:1, muted 6.04:1 on a highlighted slot |

New tokens:
- `ink` for the one primary action (light in dark mode, so it never vanishes on navy);
- `feature` for the Today surface;
- eight tint pairs;
- a shell `--gutter` of 16 / 24 / 32 / 40 / 56 px, shared by header, pages and footer.

Primitives:
- cards lose the rule under their header;
- radii are 14 px;
- table headers are sentence case;
- StatCard takes the KPI layout;
- buttons gain an `inverse` variant, and DropdownMenu an `unstyled` trigger for triggers on their own surfaces.

## U2 — Authenticated shell

The permanent sidebar is removed, not hidden: `Sidebar.tsx` and its tokens are deleted.

| Area | Now |
| --- | --- |
| Header | the network mark and letterspaced wordmark; four text destinations with the reference's teal rule and dot; icon search; the launcher; the bell's unread dot; avatar, name and role. It sits on the canvas and takes a surface and hairline only once content scrolls under it. |
| App Launcher | opens on six role shortcuts in the reference's divided 3 × 2 grid; "Search pages…" filters every destination the session may open; "View all pages" shows the complete grouped directory. It is a panel under the header's right edge from md, a bottom sheet on phones, with arrow-key grid navigation, Escape, outside close and focus return. |
| Account menu | profile (employees), a labelled Theme group (Light, Dark, System), Sign out |
| Search | icon at every width; ⌘K / Ctrl+K unchanged; palette still loaded on demand |
| Breadcrumbs | rooted at Home, inside each page's own content width from md |
| Footer | the reference's quiet line, from md |
| Phone | compact header with every utility, and a bottom bar with the same four destinations |

The four destinations are honest per role rather than uniform:

| Role | Home | People | Third | Workflows |
| --- | --- | --- | --- | --- |
| HR administrator | Admin Home | directory (lit on employee and department records) | **Insights** → Reports | Action Center (lit on onboarding, offboarding, performance) |
| Manager | Employee Home | directory | **Team** → team overview, which carries the team insights | Action Center |
| Employee | Employee Home | directory | **Growth** → goals and reviews | Action Center |

An employee has no reporting destination, and a page invented to keep the label would be fake UI.

Launcher shortcuts and directory:

| Role | Shortcuts | Directory groups |
| --- | --- | --- |
| HR | Employees, Attendance, Leave, Payroll, Departments, Reports | People, Time & leave, Workflows, Pay & insights, Workplace, Administration (20 destinations) |
| Manager | Team overview, Team leave, Attendance, Leave, Payslips, People | Me, My team, Workplace (18) |
| Employee | Attendance, Leave, Payslips, Goals, People, Calendar | Me, Workplace (13) |

Verification (`u2-shell.mjs`, real sign-ins on the demo stack): **132/132**. It checks:
- destinations and launcher contents per role, with nothing an account may not open;
- six shortcuts, then the full directory;
- focus, arrow keys, filter, Enter, Escape and outside close;
- the theme group;
- no overflow or clipped header control at 1536, 1280, 1024, 834, 390 and 375, in light and dark;
- one primary navigation at each width;
- the phone sheet fits and returns focus;
- the manager's Team slot stays lit on team pages.

## U3 — Admin Home

The reference's composition with HR's real data. Each card loads and fails on its own.

| Reference element | Real source |
| --- | --- |
| Greeting | time of day from the viewer's clock; the account's given name (an administrator account without an employee record is greeted "Welcome back.") |
| Primary action | split button: Add employee; behind the chevron New announcement, Start onboarding, Start offboarding, Review cycles, Company calendar |
| Total employees | `/dashboard/admin` total; "+n this month" and the sparkline from employment dates (running total of joiners over six months); otherwise the active count |
| On leave today / Late today | `/dashboard/admin`, with their share of the total |
| Pending requests | pending leave decisions |
| Today | the company calendar: its date, whether today is a working day or a holiday, the company clock as "Now", and today's then upcoming holidays and events |
| Tasks for today | the lifecycle tasks assigned to the account, due today or overdue or done today, then those due soon, with dates. The checkboxes record the task through the same request as My tasks. |
| Brand card | brand voice only, no control |
| Who's out today | calendar absences covering today (pending labelled as awaiting approval), then who is away next |
| Recent activity | the audit log's newest 100 entries, sign-ins, exports and reads left out |
| Insights | attendance records per working day (future days faint); attendance rate, leave requests and late check-ins against the same days last month, or the month before for "Last month" |

Intentional differences from the reference:

| Reference | Here | Reason |
| --- | --- | --- |
| "28°C · Shah Alam, MY" | working day, holiday or day off, and "{city} time" | HR Nexus has no weather or location source; fabricating one is forbidden |
| "New Request" | "Add employee" for HR | an administrator does not file requests; the button names what it does |
| "Morning" chip | "All day" or "Pending" | leave is recorded in whole days |
| Downward deltas always red | coloured by what is good: fewer late check-ins are green; leave requests are neutral | direction alone misreports late check-ins |
| Attendance delta "2%" | "2 pts" | it is a difference of percentages |
| Title Case card titles | sentence case | the product's consistent label style |
| Photographed avatars | initials where no photo is on record | no invented faces |
| Footer "v2.0" | "V3" | the product's actual version |

Responsive:

| Width | Layout |
| --- | --- |
| From 1280 | the reference grid |
| md to 1280 | mountain beside the greeting, KPI 2×2 then 4 across, Today and Tasks side by side from lg, bottom row two-up with Insights spanning, no brand card |
| Phones | a mountain band above the greeting, stacked cards; KPI tiles move above their text |

Verification (`u3-home.mjs`, demo stack, real HR sign-in): **45/45**, no page errors. It checks:
- one h1;
- no weather or invented place;
- the four KPI figures, the Now slot, and every card present;
- the launcher's six shortcuts and full directory;
- a task checkbox recorded through the API and undone;
- the Insights period switch;
- no overflow, stuck loading or failed card at 1280, 1024, 834, 390 and 375 in light and dark;
- System following the OS.

Screenshots at 1536 × 1024 (with and without the launcher), in both themes and at every width,
were reviewed against the reference by eye. That review found:
- KPI cards stacking at 1536;
- clipped timeline nodes;
- the launcher mis-anchored;
- three-column truncation at 1024;
- an empty activity card, because test sign-ins filled the first page;
- "Sept" chips;
- "1 pts".

All were fixed and re-verified.
