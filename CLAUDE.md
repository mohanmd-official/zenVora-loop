# Zenvora Loop — notes for Claude

Multi-organization planner + clinic management app (Abbi's Dental Care is the main org). Plain HTML/CSS/JS, no framework,
Firebase Auth + Firestore (Spark plan). Deployed to GitHub Pages from `public/` by `.github/workflows/pages.yml`.

## Golden rules (read these first)
1. **Edit the modules in `src/`, never `public/index.html`.** It is generated: run `python3 build.py` after every change.
   `python3 build.py --check` tells you if `public/index.html` is out of date. Commit the rebuilt file with the module (the deploy publishes `public/` as is).
2. The build joins `src/css/*.css` into one `<style>` and `src/js/*.js` into one `<script>` **in file-name order**.
   Everything shares one global scope, exactly like a single file: a module can call a function from any other module.
   Only *top-level code that runs immediately* depends on order (e.g. `const` used at load time must be in an earlier file).
3. Only open the module you need. Find a function with `grep -n "function name\|const name" src/js/*.js`.
4. Keep the house style: compact one-line handlers, template strings for HTML, `esc()` on every user value, `inr()` for money.
5. Firestore rules live in `firestore.rules`; if a change needs new access, update the rules **and** tell the user to publish them
   (`pbcopy < firestore.rules`, then Firebase console → Firestore → Rules → Publish).
6. After a change, the user deploys with `git add -A && git commit -m "…" && git push`.

## Module map — `src/js/`
| File | What's inside |
|---|---|
| 01-core-utils-state | constants, `$`, `esc`, dates (`dayKey`, `shiftDay`, `parseDay`, `todayKey`), app state, task logic |
| 02-render-routing-menus | `render`, `setView`, `renderSoon`, URL routing (`#/clinic/...`), drag-to-reorder top tabs |
| 03-planner-board | Planning Board: kanban, calendar, all tasks, insights + charts, add form, task modal, reminders/notifications, tooltip |
| 04-toolbar-navigation | top toolbar buttons, keyboard shortcuts, export/import |
| 05-cloud-auth-login | Firebase start-up (`boot`, `startUser`), `refreshTabs` (which tabs show), theme, sync, sign-in & password pages, creating logins |
| 06-organization | Organization page: People (add/edit, work timing), org chart, support access, billing |
| 07-super-admin | Super Admin: onboarding organizations, features (agenda/attendance/payroll/clinic), plans |
| 08-clinic-core-patient-list | clinic data (`cl`, doctors, treatment list), `nextNumber`, **left feature menu `renderSideNav`** (Attendance + Clinic ▾; Home/Org/Board stay in the top bar), `renderClinic`, Patients list & search |
| 09-clinic-patient-record | patient profile, treatments, medicines/Rx, billing tab, receipts (`printDoc`, `printReceipt`), visits, photos |
| 10-clinic-appointments | Appointments day/week grid, doctor colours, status filters, booking (new/existing patient), auto-missed |
| 11-clinic-shared-ui | reorderable sub-menus (`ordered`), report date range bar, charts (`stackChart`, `hbarChart`) |
| 12-accounts-core-overview | Accounts tabs + data loader `clAccLoad`, payment-due helpers (`dueFor`, `svcMonth`, `payState`), audit (`withHist`, `auditDelete`), expense sources (`expensesOf`), Overview |
| 13-accounts-expenses-petty-vendors | expense form `expForm`, **Clinic expenses overview**, Petty cash, Lab / Materials vendors & bills |
| 14-accounts-consultants-salary | Consultants (visits, cost per patient, statements), Staff salary (`loadStaffPay`) |
| 15-accounts-setup-import | Commitments & categories (due day), past data, audit log view, year-end audit pack |
| 16-accounts-daily-tally | Daily tally (opening, denominations, reconciliation, digital modes, month table) |
| 17-accounts-forms-save | `accSubmit`: saving every Accounts form (expenses, petty, vendors, commitments, imports) |
| 18-reports | Reports (collection, treatments, doctors, outstanding, appointments, new patients), CSV/print |
| 19-clinic-setup | Clinic setup page (doctors + colours, treatment & medicine price lists, receipt details) |
| 20-clinic-events | **event handlers for all clinic pages** (clicks, changes, inputs), appointment drag-to-reschedule, tooth chart, type-to-search dropdowns, visit totals |
| 21-visit-summary-docs | "What happened in this appointment?" (treatments, medicines, no-treatment/no-medicine), patient documents |
| 22-planning-board-sync | `clinicSync` → Planning Board reminders (org + owner), payment reminders `payReminders`, `otMerge`, `openLink` |
| 23-home-widgets | Home page widgets |
| 24-visit-billing | bill after a visit: payment with bill date, No bill, complete visit, print |
| 25-patient-assists | Patient assists + incentives (`incentivesByUid`) |
| 26-attendance-regularization | regularization requests & approvals |
| 27-dentee-import | importing the Dentee Excel export |
| 28-attendance | Attendance (check-in/out, team, month editor, pay, Sundays, incentives) |
| 29-boot | starts the app (`boot()`), test hook `window.__zl` |

`src/css/` follows the same areas (base/planner, auth, attendance, organizations, clinic layout & appointments, home,
visits/tally/accounts, toasts, theme refresh). `src/shell.html` is the page markup (header, views, dialogs).

## Data (Firestore) in one glance
- `orgs/{orgId}`: org settings & features; `members/{uid}` (role orgadmin/manager/employee, `perms`, `att` work timing & salary, `isChief`).
- Clinic: `patients` (+ docs/photos), `appointments`, `treatments` (`kind:'medicine'` for medicines), `payments`, `doctors`,
  `treatmentTypes`, `medicines`, `assists`, `assistPay`.
- Accounts: `ledger` (kind `expense` | `income` | `petty` (top-up, a transfer) | `pettyspend` | `cpayout`; expenses carry
  `serviceMonth`, `dueDate`, `paid`, `paidDate`, `history`), `ledgerDocs` (bill copies), `tallies/{date}`, `vendors`, `auditLog` (write-once).
- `clinicMeta`: `counter`, `settings`, `accounts` (commitments, categories, `dueDay`, closed months), `orgTasks` / `ownerTasks` (shared reminders).
- `attendance/{uid}/events`, `attRegs`.
- Permissions in the app: `can(p)` / `canW(p)` with p in patients, appointments, treatments, billing, accounts, petty, tally, reports,
  doctorReports, setup; `isOwnerLike()` = Account Manager or Chief doctor.

## Accounting rules (keep these true)
- Each expense is recorded once, on its own page; Clinic expenses only adds them up. Petty cash counts as an expense when the box is topped up (`pettyTopups`, openings excluded); petty spends are NOT added to Clinic expenses. Consultant payouts are not expenses (the fees are).
- A month's obligations are due on day `dueDayOf()` (default 15) of the next month; reminders come from `payReminders`.
- Never delete money records without `auditDelete`; changes append to `history`.
