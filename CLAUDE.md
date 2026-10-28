# Zenvora Loop — notes for Claude

Multi-organization planner + feature platform (Abbi's Dental Care is the main org). Plain HTML/CSS/JS, no framework,
Firebase Auth + Firestore (Spark plan). Deployed to GitHub Pages from `public/` by `.github/workflows/pages.yml`.

## Layout: core + one folder per feature
```
core/                 the platform: sign-in, Super Admin (onboard / offboard organizations), Organization page,
                      Planning Board (tasks, team tasks), Home frame, the left "Features" menu, the feature registry
features/payroll/     Attendance & payroll: check-in/out, team attendance, regularization, work timing, pay
features/dental-clinic/  Dental clinic: patients, appointments, billing, accounts, reports, clinic reminders
features/_template/   copy this to start a new feature (README inside)
build.py              joins everything → public/index.html + firestore.rules (both GENERATED: never edit them)
```
Each feature folder: `feature.json` (name, order, enabled) · `tab.html` · `view.html` · `css/*.css` · `js/*.js`
(ending with `99-register.js`) · `rules.part` (its Firestore rules, placed inside `match /orgs/{o}`).

## Golden rules (read these first)
1. **Edit `core/` or `features/<name>/`, then run `python3 build.py`.** `python3 build.py --check` says if the
   generated files are out of date. Commit the rebuilt `public/index.html` and `firestore.rules` with your change.
2. **Core never calls a feature's functions by name.** It asks the registry (`core/js/03-feature-registry.js`):
   views, menu, route, home widgets, person fields, board panel, task links, reset/start hooks. A feature plugs in
   with `ZL.add({...})` in its `js/99-register.js`. Features may use anything in core (helpers, `cloud`, `state` …).
3. **One feature talks to another only through `api`:** `ZL.api('payroll')` / `ZL.api('dental-clinic')` (null when
   that feature isn't built). Example: Clinic → Accounts → Staff salary uses `PAY().attSummary(...)`.
4. **Prove a feature is removable** after changing links between parts:
   `python3 build.py --only payroll` / `--only dental-clinic` / `--only ""` (core only) write to `build/`.
   Lint each for undefined names (eslint `no-undef`): there must be none.
5. Everything is still ONE page and ONE script (one global scope). Order: core/js (file-name order) → each feature's
   js (feature `order`, then file name) → core/boot.js. CSS: core/css `NN < 50` → features' css → core/css `NN >= 50`.
   Only *top-level code that runs immediately* depends on this order.
6. Keep the house style: compact one-line handlers, template strings for HTML, `esc()` on every user value, `inr()` for money.
7. Rules: edit `core/firestore.rules` or `features/<name>/rules.part`, rebuild, and tell the user to publish
   (`pbcopy < firestore.rules`, then Firebase console → Firestore → Rules → Publish).
8. The user deploys with `git add -A && git commit -m "…" && git push`.

## Core — `core/js/`
| File | What's inside |
|---|---|
| 01-core-utils-state | constants, `$`, `esc`, dates (`dayKey`, `shiftDay`, `parseDay`, `todayKey`), planner state, task logic |
| 02-shared-helpers | `inr`, `fullName`, `firstName`, `numberTables`, `kpi`, `tbl`, `docsOf`, `paidSum`, `hm`, `hm12`, `hms`, `tsMs`, `monthBounds`, `monthLabel`, `mShift`, `days`, `greet` |
| 03-feature-registry | `ZL` (add / api / each / part / views / linkOwner), `openLink`, `resetFeatures`; the list of hooks |
| 04-render-routing-menus | `render`, `setView`, `renderSoon`, URL routing (features add theirs via `route`), drag-to-reorder top tabs |
| 05-feature-menu | reorderable sub-menus (`ordered`, `saveOrd`), the left **Features** menu `renderSideNav` (built from `views` + `menu`) |
| 06-planner-board | Planning Board: kanban, calendar, all tasks, insights + charts, add form, task panel, reminders/notifications |
| 07-toolbar-navigation | toolbar buttons, keyboard shortcuts (features add `key`), export/import |
| 08-cloud-auth-login | Firebase start-up (`boot`, `startUser`), `refreshTabs`, `plannerCfg`/`remOn`/`agendaOn`, sync (`pushChanges`), sign-in & passwords, `FEATURES` (Super Admin switches; features add `flags`) |
| 09-team-tasks | Jira-style assignment: `setAssignee`, shared tasks (`orgs/{id}/tasks`), people directory, avatars, assignee bar, Team dialog, `isMine` |
| 10-organization | Organization page: People (features add fields via `person`), org chart, Planning Board switches, support access, billing |
| 11-super-admin | Super Admin: onboarding / offboarding organizations, features, plans, support view |
| 12-home | Home frame: layout, Customize, core widgets (tasks, team, quick actions, notes, Super Admin widgets); features add `home.widgets` |
| boot.js | starts the app, test hook `window.__zl` (features add via `expose`) |

## Payroll — `features/payroll/js/`
| File | What's inside |
|---|---|
| 01-attendance-regularization | regularization requests & approvals (`regLoad`, `wRegs`) |
| 02-attendance | Attendance (`att`, check-in/out `punch`, team, month editor, work timing `wtFields`/`wtRead`, `attSummary`, pay, Sundays, incentives) |
| 03-home-widgets | Home: Check in / out, Mark attendance (`attHome`) |
| 99-register | flags attendance + payroll, view `attendance` (key 5), Home widgets, person fields, `api` for other features |

## Dental Clinic — `features/dental-clinic/js/`
| File | What's inside |
|---|---|
| 01-core-patient-list | clinic data (`cl`, `can`/`canW`, `CSECS` pages, `CI` icons, `PAY()`), `renderClinic`, Patients list & search |
| 02-patient-record | patient profile, treatments, medicines/Rx, billing tab, receipts (`printDoc`, `printReceipt`), visits, photos |
| 03-appointments | Appointments day/week grid, doctor colours, status filters, booking, auto-missed |
| 04-shared-ui | report date range bar, charts (`stackChart`, `hbarChart`) |
| 05-accounts-core-overview | Accounts tabs + `clAccLoad`, payment-due helpers (`dueFor`, `svcMonth`, `payState`), audit (`withHist`, `auditDelete`), `expensesOf`, Overview |
| 06-accounts-expenses-petty-vendors | expense form, Clinic expenses overview, Petty cash, Lab / Materials vendors |
| 07-accounts-consultants-salary | Consultants, Staff salary (`loadStaffPay`, needs Payroll) |
| 08-accounts-setup-import | Commitments & categories (due day), past data, audit log view, year-end pack |
| 09-accounts-daily-tally | Daily tally |
| 10-accounts-forms-save | `accSubmit`: saving every Accounts form |
| 11-reports | Reports (collection, treatments, doctors, outstanding, appointments, new patients) |
| 12-setup | Clinic setup (doctors + colours, price lists, receipt details) |
| 13-events | event handlers for all clinic pages, `clGoSec`, drag-to-reschedule, tooth chart, type-to-search, `clinicAccessHtml` |
| 14-visit-summary-docs | "What happened in this appointment?", patient documents |
| 15-planning-board-sync | `clinicSync` → Planning Board reminders, `payReminders`, `otMerge`, `renderOrgRem`, `clOpenLink` |
| 16-visit-billing | bill after a visit |
| 17-patient-assists | Patient assists + incentives (`loadIncentives`, shared with Payroll via `api`) |
| 18-dentee-import | importing the Dentee Excel export |
| 19-home-widgets | Home: Reminders, Today's appointments, Clinic today, quick actions (`clHome`) |
| 20-cash-denominations | notes received / change given at billing (`cashPanel`, `cashCalc`, `cashRead`), `savePaymentDoc` / `deletePaymentDoc` (payment + petty `chg-<id>`), `cashLine` |
| 99-register | flag clinic, view + left menu with pages, routes `#/clinic/...`, board panel, task links, Home, person fields |

## Adding a feature
`cp -r features/_template features/<name>` → edit `feature.json` (`enabled: true`, `order`), ids in `tab.html`/`view.html`,
code in `js/`, hooks in `js/99-register.js`, rules in `rules.part` → `python3 build.py`. The Super Admin turns its flag on per organization.

## Data (Firestore) in one glance
- `orgs/{orgId}`: org settings & features, `planner` {board, rem, assign:'all'|'mgr'|'off'} (Account Manager); `tasks/{id}` (a task given to a colleague: `createdBy`, `assigneeUid`, `assignee`{uid,name}, `shared:true`); `dir/{uid}` (name, title only, for picking assignees); `members/{uid}` (role orgadmin/manager/employee, `perms`, `att` work timing & salary, `isChief`).
- Payroll: `attendance/{uid}/events`, `attRegs`.
- Clinic: `patients` (+ docs/photos), `appointments`, `treatments` (`kind:'medicine'` for medicines), `payments`, `doctors`,
  `treatmentTypes`, `medicines`, `assists`, `assistPay`; Accounts: `ledger` (kind `expense` | `income` | `petty` (top-up) | `pettyspend` | `cpayout`; expenses carry
  `serviceMonth`, `dueDate`, `paid`, `paidDate`, `history`), `ledgerDocs`, `tallies/{date}`, `vendors`, `auditLog` (write-once);
  `clinicMeta`: `counter`, `settings`, `accounts`, `orgTasks` / `ownerTasks` (shared reminders).
- Clinic permissions: `can(p)` / `canW(p)` with p in patients, appointments, treatments, billing, accounts, petty, tally, reports,
  doctorReports, setup; `isOwnerLike()` = Account Manager or Chief doctor.

## Accounting rules (keep these true)
- Each expense is recorded once, on its own page; Clinic expenses only adds them up. Petty cash counts as an expense when the box is topped up (`pettyTopups`, openings excluded); petty spends are NOT added to Clinic expenses. Consultant payouts are not expenses (the fees are).
- A month's obligations are due on day `dueDayOf()` (default 15) of the next month; reminders come from `payReminders`.
- Never delete money records without `auditDelete`; changes append to `history`.
- Cash payments carry `cash` {in, out, inTotal, outTotal, change, xs, petty, other}. The daily tally pre-fills the purse count from them and adds
  `chPetty` / `chOther` (change paid from petty cash / elsewhere: those notes stayed in the purse) to the expected cash. Change from petty cash is a
  `pettyspend` ledger entry `chg-<paymentId>` with `change:true` (written/deleted together with the payment, not an expense).

## Planning Board rules (keep these true)
- A task with a colleague (another login) as assignee has `shared:true` and lives only in `orgs/{id}/tasks`; everything else stays in `users/{uid}/tasks`. `setAssignee` moves it; `pushChanges` writes each kind to its own place in separate batches.
- Only the reporter (or the Account Manager) deletes a shared task; carried-over notes use a fixed id (`co-<day>`) so two boards never duplicate them.
- `isMine(it)` decides reminders, the overdue count and Home "My tasks": a task you gave to someone else doesn't nag you.
- New org-wide switches go in `orgs/{id}.planner` (the Account Manager may only change the fields listed in the `orgs/{o}` update rule).
