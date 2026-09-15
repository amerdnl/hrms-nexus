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
| Mountain | misty range beside the greeting, fading into the canvas (the reference's small vertical "Better People Brighter Tomorrow" copy was later removed at the owner's direction) |
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

## U4 — Employee Home

The same design system arranged around one person's day, not a restricted Admin Home. It has no
company figures, no audit activity and no brand card.

| Area | Real source |
| --- | --- |
| Greeting | the employee's given name (the patronymic rule: "Aiman Zulkifli bin Harun" is greeted "Aiman Zulkifli"); split action Request leave, with Recognise someone, My goals, My payslips and Find a colleague |
| KPI row | Checked in (time, or "Not yet", with status and verification); Annual leave left; Needs you (the Action Center count and its first item); Latest payslip (period and net pay, the employee's own) |
| Today | the same deep green card; its corner carries the employee's own attendance and a real Check in or Check out that opens the verified QR and location panel below the grid. Working day and company clock move beside the date. |
| For you | the Action Center's items for this account: announcements to read, reviews to write, goals past due, onboarding tasks |
| Your leave (right column) | annual balance with a bar, the other balances, the next approved leave, and the pending count; an unreadable balance says so rather than showing zero |
| Bottom row | Your goals (progress, due or past due), Company updates (unread and important marked), Recognition received |
| Manager layer | a manager's bottom row starts with Your team today: in, on leave, not clocked in, the decisions waiting, and each report's day-status badge. There is no pay and no location, as the team layer never carries either. Recognition stays one launcher tap away. |

Differences from Admin Home, on purpose:

| Admin Home | Employee Home | Reason |
| --- | --- | --- |
| Brand card | the employee's leave | what a person checks daily |
| Tasks for today | For you | an employee's work arrives through the Action Center |
| Recent activity and Insights | goals, updates and recognition | an employee has no company-wide activity or reporting to read |

Verification (`u4-home.mjs`, real sign-ins as an employee and a manager): **46/46**, no page
errors. It checks:
- one h1 and the greeting;
- personal KPIs;
- no company figures, admin actions or brand card;
- the employee's cards, and no team card for a non-manager;
- no weather;
- Check in opens the verified panel and records nothing;
- the manager's team card with the waiting decision, and no other person's pay;
- no overflow, stuck loading or failed card at 1280, 1024, 834, 390 and 375 in light and dark, and for the manager at 390;
- System following the OS.

The review by eye found:
- a truncated KPI label;
- the check-in panel stretching the leave column;
- a centred attendance corner on phones.

All three were fixed and re-verified.

## U5–U7 — People, Team, workplace and HR operational pages

Every page was captured at 1280 and 390 for each role and reviewed by eye (`u5-audit.mjs`,
**86/86**, no overflow). The shared primitives already carry the reference's tokens, cards,
tables, tabs and forms, so the work that remained was systemic rather than page by page:

| Finding | Fix |
| --- | --- |
| Pages centred themselves at seven widths (2xl to 7xl), so the left edge jumped between 40 and 256 px under a fixed header | every page sits inside one 89rem frame that matches the header, keeping its own readable maximum width but sharing the header's left edge (72 page roots) |
| Card-header navigation ("Attendance", "Team leave", "See all", "Show in org chart") rendered as grey ghost buttons that did not read as links | a `link` button variant in the reference's teal, applied to all 15 |
| Two-across StatCards on phones broke labels ("Not clocked / in") | the icon stacks above the text in a card narrower than 11.5rem |
| The profile page's trail overlapped its identity card | Tailwind v4 `space-y` is a bottom margin; the trail now sets its own |
| Dates read "09 Sept 2026" in tables and "14 Sep" on Home | one form everywhere: "9 Sep 2026", "21–22 Sep 2026" |

Unchanged on purpose:
- the People directory, profile and org chart flow (directory, profile, manager, team, org chart, profile);
- the team layer's pages;
- the attendance verification panel;
- the payroll stepper;
- the report tabs;
- the settings forms.

All of these already follow the system after the primitive changes, and redesigning working
workflows was outside this phase's brief.

## Source integrity during the pass

A read-only fingerprint at the end of the pass differs from the authorised baseline read at
02:51:37 UTC on 14 September. The audit log explains every difference, and none was caused by
this pass:

| Difference | Explanation |
| --- | --- |
| Audit events 33 → 43 | entries 34–43 are sign-ins and sign-outs through the source application between 02:55 and 07:18 UTC: administrator (user 1) and an employee account (user 4), with four failed attempts |
| Leave entitlements 0 → 4 (sequence 0 → 40) | employee 3's 2026 entitlements (annual 12, medical 10, emergency 2, unpaid 0), created at 03:05:26.44 UTC, 0.36 s after that employee signed in, by the existing V2 default-policy code (`leaveBalanceService`, commit `9f0a17a`, insert-if-absent), noted "Applied from the company default policy" |

Every other digest is unchanged: employees, accounts, attendance, the five historical orphans,
payroll (September 2026 still `calculated`), the ledger (16) and 34 base tables. Every UI-pass
script targets only the isolated demo stack (:5190 and :5018); none references a source port or
container. The source frontend container mounts this working tree and hot-reloaded the new UI,
which writes no data. Nothing was reverted.

## U9 — Exact comparison with the final reference

Admin Home was compared with the reference at the reference's own viewport (1536 × 1024, light,
real HR sign-in on the demo stack) by measuring every region's box and by reviewing side-by-side,
50 % blend and difference composites (`u9-compare.mjs`).

The first measurement showed:
- the upper half within 5 px;
- 17 px gaps where the reference uses 12–14 px, pushing the KPI cards right by up to 16 px;
- the brand card 12 px low, because its height was a percentage;
- the bottom row 313 px tall against 232 px.

Corrected:

| Area | Change |
| --- | --- |
| Header | 84 px |
| Greeting | spacing to the reference |
| Gaps | row gaps 12–16 px and column gaps 12–14 px |
| Brand column | 300 px; the brand card a fixed 328 px, bottom-aligned with Today |
| KPI row | stops 16 px short of the brand column, as drawn |
| Bottom-row cards | tighter padding; compact Who's out and Recent activity rows |
| Insights | bars 64 px tall; the comparison period moved from a visible footnote into each delta's name and title at this width |

Final measurement (reference → implementation, left, top, width, height in px):

| Region | Reference | Implementation | Largest delta |
| --- | --- | --- | --- |
| Header | 0, 0, 1536 × 84 | 0, 0, 1536 × 84 | 0 |
| Greeting h1 top | 150 | 150 | 0 |
| Primary action | 56, 283 | 56, 283 | 0 (width +35: "Add employee" is longer than "New Request") |
| KPI 1–4 | 58/374/642/895, 351; 304/256/241/255 × 125 | 56/372/640/894, 351; 304/256/242/256 × 124 | 2 |
| Today | 56, 492, 748 × 232 | 56, 491, 751 × 233 | 3 |
| Tasks for today | 818, 492, 348 × 232 | 821, 491, 345 × 233 | 3 |
| Brand card | 1180, 396, 300 × 328 | 1180, 396, 300 × 328 | 0 |
| Who's out, Recent activity, Insights | 56/537/999, 736; 469/450/481 × 232 | 56/537/999, 736; 469/450/481 × 235 | 3 |

Every region is within 3 px. What still differs is content, not layout, and each difference is
deliberate:

| Reference | Implementation | Reason |
| --- | --- | --- |
| "28°C · Shah Alam, MY" | "Working day · Kuala Lumpur time" | no weather or location source exists; fabricating one is forbidden |
| "Welcome back, Ameer." | "Welcome back." for an administrator account with no employee record; employees are greeted by given name | the demo HR account has no person's name to use |
| "New Request" | "Add employee" (HR), "Request leave" (employee) | the button names a real action for the role |
| Photographed avatars | initials | no invented faces; real photos appear where uploaded |
| "↑ 2%", "↓ 20%" deltas coloured by direction | coloured by what is better, "pts" for a percentage difference | direction alone misreports late check-ins |
| "Morning" chip, four checked tasks, 48 employees | "All day" or "Pending", real tasks, real counts | real V3 data only |
| "⌘ K" in the launcher field | no shortcut hint | the launcher filter has no shortcut; ⌘K opens global search |
| Footer "v2.0" | "V3" | the actual version |

Employee Home uses the same grid, measurements and card language, with its own content: a
personal KPI row, attendance in Today's corner, For you, and the leave column where HR has the
brand card. The Admin Home and Employee Home checks were re-run after the changes: **45/45** and
**46/46**, plus the shell **132/132**.

## U8 — Responsive, theme and accessibility polish

Found by reviewing screenshots at every required width and fixed:

| Width | Finding | Fix |
| --- | --- | --- |
| 1280 | one narrower KPI card stacked its icon while its neighbours did not; a payslip period wrapped | one KPI layout from 9.5rem; figures never wrap |
| 1280 | the third Today slot slid under "View calendar" | slots are flexible tiles sized by the card's own width |
| 1280 | the brand tagline wrapped; Insights labels were cut mid-word | tighter tagline tracking below 1440; labels wrap between words ("check‑ins" kept whole) |
| every width | date-times read "14 Sept 2026" | "14 Sep 2026, 07:02 pm", matching plain dates |

## U10 — Final regression (14 September 2026)

Everything ran on the final bundle against the isolated demo stack. Each workflow smoke ran on a
freshly rebuilt demo database.

| Gate | Result |
| --- | --- |
| Frontend typecheck, Oxlint, production build | pass, 0 lint findings |
| `check:bundle` | 50 lazy pages; initial JS 352.82 kB (gzip 114.98 kB) against the 380 / 125 kB budget; V3 release was 347.25 kB |
| Backend laboratory suite, security matrix included | 564 / 564, none skipped; the backend is unchanged since the release baseline `e15bfdc` |
| Navigation gate | 64 / 64: header destinations, launcher reaching all 14 admin areas, Home-rooted breadcrumbs, role redirects, sign-out, theme persistence, Apps sheet semantics, System theme at 1280, 390 and 375 |
| Visual gate (master §15, §38) | 676 rendered pages per role at 1280, 1024, 834, 390 and 375 in light, dark and System, plus the account menu with its Theme group, the Apps sheet and dialogs, and permission redirects. It found no overflow, duplicate headings, bottom-bar overlap, stuck loading or error states. Screenshots were reviewed by eye. |
| Accessibility gate | 236 axe scans, 0 WCAG 2.2 AA violations (App Launcher, all-pages view and account menu included); keyboard 17 / 17, including launcher focus, arrow keys and Escape, and Skip to content |
| Shell | 132 / 132 |
| Admin Home | 45 / 45 |
| Employee and manager Home | 46 / 46 |
| Exact comparison (U9) | every region within 3 px of the reference at 1536 × 1024 |
| Workflow gate (master §39) | M1 51/51, M2 40/40, M3 59/59, M4 41/41, M5 28/28, M6 40/40, M7 19/19, M8 30/30, attendance verification 15/15 |
| Dates | 7 / 7, no "Sept" on the pages that show dates and times |

The first workflow run failed two checks. Both were expectations written for the old shell and
were corrected, not the product:
- M2 expected the retired five-slot phone bar.
- M3's `main ol` also matched the breadcrumb list, which now sits inside the page.

Both smokes then passed on fresh demos.

Five earlier gates were updated to the new shell rather than weakened: M1, M2, the visual gate,
accessibility and navigation. They assert the header destinations, launcher groups, the Apps
sheet and the account menu's Theme group in place of the sidebar and the More sheet.

### Source integrity at the end of the pass

Read-only.

Unchanged against the authorised baseline:
- employees, accounts and attendance;
- the five historical orphans;
- payroll (September 2026 still `calculated`, no records);
- the ledger (16) and 34 base tables.

Isolation is unchanged: source on the compose network only, the lab and demo API on the lab
network. The Docker volume (created 7 August 2026) is untouched. Tags: only `v2.0.0-rc1`,
locally and on `origin`.

Differences, all from the owner's use of the source application, none from this pass:

| Difference | Explanation |
| --- | --- |
| audit events 33 → 46 | entries 34–46 are sign-ins and sign-outs through the source application by user 1 (administrator) and user 4 (employee), 02:55–11:38 UTC, including four failed attempts |
| leave entitlements 0 → 4 | employee 3's 2026 default-policy entitlements, created by existing V2 code when that employee signed in at 03:05 |
| entitlement sequence 0 → 68 | the same insert-if-absent code runs on later reads; a conflicting insert consumes a sequence value without writing a row (still 4 rows, last written 03:05) |

## Refinement pass (14 September 2026)

After the layout matched the reference, both Homes and the pages sharing their components were
reviewed again at 2× close-ups against the reference. The review covered Admin, Employee and
Manager, light and dark, at 1536, 1280, 1024, 834, 390 and 375. Nothing in this pass changes data,
permissions or behaviour.

| Area | Finding | Refinement |
| --- | --- | --- |
| Today card | the timeline's nodes floated 5 px above the line | nodes sit on the line |
| KPI row | Lucide's default stroke looked thin against the reference's heavier glyphs | 2.2 px stroke on KPI and launcher glyphs |
| KPI sparkline | a joiners series with an empty early run drew as a flat line then a cliff | a smoothed curve through the real points, clamped to the card, flat series drawn mid-height |
| Insights | days to come and days with no records were full-height empty bars, reading like a chart of zeros | a small mark on the baseline; recorded days keep their bars |
| Insights at 834–1280 | a card spanning two columns stretched 22 bars across the width with the figures below | bars and figures side by side when the card is wide |
| Greeting | eyebrow too large for its letterspacing | 12 px; spacing to the heading and action retuned; header height unchanged |
| Mountain | a hard edge where the photograph's right side ended | a wider edge feather in the image, and a soft haze past the ridge in the wide layout only (`home-mountain.webp` regenerated, SHA-256 `2f7f5cc6…f8d2`); the haze is skipped at narrower widths, where it would spill past the frame |
| Launcher | the search field showed a heavy teal outline on open; grouped view tiles were loose and a row was cut mid-tile | a soft grey pill with a quiet focus edge, compact tiles in the full directory, and a fade at the list's foot |
| Employee Home below 1280 | "Your leave" stretched into a full-width strip, or sat beside a short card with a large gap | leave spans two rows beside the next two cards, and the last card takes the full width |
| Your leave, nothing booked | the column ended in empty space | the latest request and its status (real data), or "No leave booked yet." |
| StatCards on operational pages | in five-across rows labels wrapped ("Awaiting your / decision"), so figures sat at different heights | tile stacked above the text below 14rem, so every figure in a row aligns; same card language as Home's KPIs |
| Footer | too much space above it at 1536 | 24 px, as in the reference |
| Mountain copy | the vertical "Better People Brighter Tomorrow" words were still drawn beside the ridge from 1280 px, on both Homes | removed as the owner required; the mountain carries no copy. The widened edge feather and the wide-layout haze stay |
| Employee Home right column | at 1536 and 1280 "Your leave" ran 27–48 px below the Today/For you row, leaving a gap under Today, where HR's brand card ends flush | the latest-request note became one quiet line and the card's internal spacing tightened, so it ends with the row beside it. HR's brand card was verified unchanged: 300 × 328 at 1536, bottom-aligned with Today and Tasks, as in the reference |

The reference comparison still holds within 3 px for every region at 1536 × 1024.

Verification of the refinement pass, on the rebuilt bundle and a freshly rebuilt demo:

| Check | Result |
| --- | --- |
| Typecheck, Oxlint, production build | pass, 0 lint findings |
| `check:bundle` | initial JS 352.97 kB (gzip 115.11 kB), within the 380 / 125 kB budget |
| Shell | 132 / 132 |
| Admin Home | 45 / 45 |
| Employee and manager Home | 46 / 46 |
| Exact comparison | every region within 3 px of the reference |
| Visual gate and accessibility gate | **not yet re-run to completion** (see below) |

Both gates were started three times after the refinements. Each run stopped on a browser timeout
(page navigation or screenshot) at a different page, never on a check. The macOS power log shows
the host on battery at 17 % with the lid closed, repeatedly entering Maintenance Sleep and
DarkWake throughout the runs. That suspends the headless browser, and `caffeinate` cannot prevent
it with the lid closed on battery. A direct probe while the host was awake loaded Home and
Recognition in under a second. The last complete runs of both gates passed (676 pages; 236 axe
scans, keyboard 17 / 17) on the bundle before these refinements. The refinements change only
spacing, layout and presentation of existing components.

**To finish:** with the Mac on power and the lid open, run `m10-visual.mjs` and `m9-a11y.mjs`
against the served bundle.
