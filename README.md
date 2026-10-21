# Zenvora Loop: launch on GitHub Pages, then move to zenvoraloop.abbisdentalcare.com

**How it fits together**

- **GitHub Pages** serves the website (free, HTTPS, redeploys on every `git push`).
- **Firebase Authentication** handles the invite-only login page (logins are created by the Super Admin and each organization's Account Manager).
- **Cloud Firestore** is the database: private per user, on the free Spark plan, no card needed.

```
repo/
├── .github/workflows/pages.yml   publishes public/ to GitHub Pages on every push to main
├── public/                       the website
│   ├── index.html                the app
│   ├── firebase-config.js        ← paste your Firebase settings here (Phase 2)
│   ├── manifest.webmanifest      lets Chrome/Safari install it as an app
│   └── favicon.svg, icon-*.png
├── firestore.rules               database security: organizations, roles, support access, private planners
├── firebase.json, firestore.indexes.json   (only used if you ever switch to Firebase Hosting)
└── README.md
```

---

## Phase 1: go live on GitHub (5 minutes)

1. Push this folder to your repo so that `.github/` and `public/` sit at the **top level** of the repo.
   (If they're inside a subfolder, move `.github/` to the repo root and change `path: public` in `pages.yml`.)
2. GitHub repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Go to the **Actions** tab. The *Deploy to GitHub Pages* run starts on your next push, or open it and click **Run workflow** now.
4. When it's green, your app is live at **`https://<your-github-username>.github.io/<repo-name>/`**.

At this stage it runs in **Local mode** (there's a badge top-right): no login yet, and data is saved in that browser only.

> On a free GitHub account, Pages requires the repo to be **public**. That's fine here: the code holds no secrets.

## Phase 2: turn on the invite-only login and the database (10 minutes, Firebase console)

Nobody can sign themselves up: the **Super Admin** (`mohanmd.official@gmail.com`) onboards organizations, and each organization's Account Manager adds their own people.

1. **https://console.firebase.google.com** → **Create a project** (e.g. `zenvora-loop`). Analytics is optional.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.** (Leave Google off.)
3. **Authentication → Users → Add user**: email `mohanmd.official@gmail.com`, plus a password you choose. This is the Super Admin login.
4. **Authentication → Settings → Authorized domains → Add domain** → `<your-github-username>.github.io`
5. **Build → Firestore Database → Create database**: **Standard** edition, location **asia-south1 (Mumbai)** (permanent), **production mode**.
6. Firestore → **Rules** tab → delete everything, paste the whole of **`firestore.rules`**, and click **Publish**.
7. ⚙ **Project settings → General → Your apps → Web (</>)** → nickname `zenvora-web` → **Register app** (leave Hosting unticked). Copy `apiKey`, `authDomain`, `projectId` and `appId` into **`public/firebase-config.js`**.
8. Commit and push. About a minute later the site shows the sign-in page.

### Who's who

| | Can do | Can't do |
|---|---|---|
| **Super Admin** (`mohanmd.official@gmail.com`) | Onboard / suspend / offboard organizations · pick each org's features (Agenda Handler, Attendance, Payroll), theme colour, plan and monthly fee · create invoices and mark them paid · assign a new Account Manager · use their own personal planner | See any organization's people or attendance, **unless that org's Account Manager approves a time-limited, read-only support request** · see anyone's planner, ever |
| **Account Manager** (one or more per org) | Add / disable / remove their own people · decide each person's Clinic access · job titles, "reports to" and roles (Employee / Manager / Account Manager) · org chart · approve or deny support requests and revoke them · view their billing | Anything in another organization · change their own plan or features |
| **Manager** (e.g. the Chief Doctor) | See and correct everyone's attendance in their org, set shifts (and salary when Payroll is on) | Add people |
| **Employee** | Check in / out, see their own attendance, use their private planner (if Agenda is on) | See other people's data |

Every organization's data lives under `orgs/<org-id>/…` in Firestore, so organizations can never see each other. The rules in `firestore.rules` enforce all of this on Google's servers, not just in the app.

### Onboarding an organization (Super Admin)

1. Sign in as `mohanmd.official@gmail.com` → **Organizations** tab → **+ Onboard organization**.
2. Enter the name (the ID is generated, e.g. `abbis-dental-care`, and can't change later), choose a theme colour, tick the features, set the plan and monthly fee, and enter the **Account Manager's** name and email.
3. **Onboard** → **Copy login details** → send them to the Account Manager. They set their own password at first sign-in and see the app in their organization's colours and name.
4. Click any organization later to change features / colour / fee (applies live), **Suspend** (nobody there can sign in; data kept), **Reactivate**, **Offboard**, assign a new Account Manager, or manage **Billing** (create an invoice per month → **Mark paid**).

### Running an organization (Account Manager)

- **Organization → People:** add someone (name, email, job title, reports to, role) → **Create login** → copy the login details to them. **Edit** changes title / reports-to / role; **Disable** signs them out within seconds; **Remove** takes them off the team (adding the same email again restores them and their attendance).
- **Organization → Org chart:** the reporting tree, built from "Reports to".
- **Organization → Support access:** when Zenvora Loop support asks to look at something, a **🛟 Support request** button and a pop-up appear. **Approve** for 1 hour, 24 hours or 7 days (read-only), or **Deny**. **Revoke now** closes it at any time.
- **Organization → Billing:** plan, monthly fee, invoices and what's outstanding.

### Support access (Super Admin)

Organizations → click the org → **Support access** → write the reason → **Request access**. Once the Account Manager approves, **Open support view** shows their People, Org chart and Attendance read-only, with an orange banner. It closes by itself when the time runs out or they revoke it.

### Moving logins from before organizations

People created in the earlier single-admin version show up in **Organizations → Logins from before organizations**. Pick their organization → **Move**. That organization's Account Manager then sees them under **People → Waiting to join** → **Add to team**. (Attendance recorded in the earlier version isn't carried over.)

### Everyone

- **Menu order:** drag the tabs at the top (Home, Planning Board, Clinic, Attendance, Organization) into the order you like; it is remembered.
- **Planning Board:** a small menu at the top switches between **Board** (Daily kanban, Weekly and Monthly calendar), **All tasks** and **Insights**.
- **Light / dark mode:** the 🌙 / ☀️ button in the top bar. Avatar → **Follow system light / dark** goes back to the computer's setting. Remembered per device.
- **Numbered lists:** every table has a **No.** column, so you can say "row 12" on a call.
- **Sub-menus are movable too:** drag the Clinic menu items, the Accounts tabs, the Report tabs and the patient tabs into your own order; it is remembered.
- Avatar → **Change password**, or **Forgot password?** on the sign-in page. Planner backup / restore is in the avatar menu too.
- The Super Admin email is set in **both** `public/firebase-config.js` and `firestore.rules`. If you change it, change both and publish the rules again.

## Staff attendance (when the org has Attendance)

Where: the **Attendance** tab, or **Clinic → Attendance** when the organization has the Clinic (there is no separate Attendance tab then). Everyone can also check in and out from **Home**.

- **Account Managers don't check in:** attendance, payroll and the team lists are for staff only.
- **Proxy attendance:** Account Manager → Organization → People → **Edit** → tick **Proxy attendance** (below Clinic access). That person, e.g. reception, gets **Mark attendance** (on Home and in Attendance) to check other staff in and out. The time is the server's clock and each entry records who marked it.
- **Regularization (forgot to check in or out):** in **My attendance**, click **Regularize** next to a missed day (or use the **Regularize attendance** box), enter only the missed time and a reason, and **Send for approval**. A Proxy attendance person can do the same for anyone from **Mark attendance**. The request goes to the person's **immediate reporting manager** (the Account Manager if they report to no one), who sees it on **Home → Attendance approvals** and in **Attendance → Approvals**. On **Approve**, the time is added to their attendance; **Reject** changes nothing. People can't approve their own requests, and requests go back up to 31 days.


- **Staff:** **Attendance** tab → **Check in** when arriving and **Check out** when leaving. They can check in and out again as often as needed in a day (e.g. lunch, errands). They see a live "worked today" timer, days present, offs used (out of 4), hours, overtime hours and overtime days, and a day-by-day list grouped by week.
- **Account Managers & Managers:** **Attendance → Team** shows who's in right now and each person's monthly totals. Click a person to:
  - set **shift timing** (plus **monthly salary** and **overtime rate** when the org has **Payroll**)
  - **add or fix entries** (forgotten check-in or check-out) and delete wrong ones
  - see the **pay breakdown** for the month (Payroll)
  - **Export CSV** (Team view) gives the whole month.

**How the numbers work**
- **Hours worked** = the sum of all check-in → check-out pairs for the day.
- **Overtime hours** = hours beyond the person's shift length that day.
- **4 paid offs per month:** any day with no check-in counts as an off. More than 4 offs → each extra day is **loss of pay**. Working on offs (present more than *days in month − 4* days) → **overtime days**.
- **Pay** (Payroll) = salary ÷ days in month × days (from the joining date), − loss-of-pay days, + overtime days × day rate, + overtime hours × hourly rate × overtime multiplier.
- A day with a check-in but no check-out shows **Missed check-out** and counts as present with 0 hours until a manager adds the check-out.
- Check-in times come from Google's server clock, so staff can't type in or change times. Only managers can add or correct entries.

## Home page (everyone in an organization)

Everyone lands on **Home** when they sign in, including the Super Admin and the personal planner. Home is a set of widgets: Check in / out, My team, Reminders, Today's appointments, Clinic today, My tasks today, Overdue, This week, Coming up, Quick actions, Notes, and for the Super Admin: Organizations and Unpaid invoices.

- **Customize (✎ on Home):** tick the widgets you want, move them up / down, choose **Half** or **Full width**, **Save**. Each person's layout is their own and follows them to any device. **Reset to default** goes back.
- **Organization default (Account Manager):** in Customize, **Save as default for my organization** sets the starting layout for everyone in the org who hasn't customized theirs.

## Clinic (patient management, when the org has the Clinic feature)

Turn it on per organization: Super Admin → Organizations → the org → tick **Clinic** → Save. Every new organization needs a **logo** at onboarding; it's shown in their header, on Home, and on receipts. (Existing organizations: Super Admin can add it in the org's settings, or the Account Manager in Clinic setup.)

**First-time setup (Account Manager): Clinic → Clinic setup**
1. **Doctors:** add each one as **Chief doctor**, **Clinic doctor** or **Consultant**. Link the Chief doctor to their Zenvora Loop login (Login column), so they receive the daily-tally reminders.
2. **Treatment list & prices:** **Add common dental treatments**, then edit prices. **Medicine price list:** **Add common dental medicines** (or your own), with the price per tablet / capsule / bottle.
   - Link the Chief doctor's login: they automatically get **Approve patient assists**. **Needs document** marks treatments whose document must be uploaded once billed (OPG → OPG, IOPA → X-ray, Crown → Intraoral scan by default).
3. **Clinic details:** address, phone, GSTIN, patient ID prefix, opening hours, logo.

**Who can do what: Organization → People → Edit → Clinic access**

| Preset | Gets |
|---|---|
| Receptionist | Patients, Appointments, Petty cash spends |
| Front desk + billing | + Billing (payments, receipts) and Daily cash tally |
| Doctor | Patients, Appointments, Treatments & photos |
| Accountant | Billing, Accounts, Petty cash, Daily tally, all reports |
| Full clinic access | everything |
| (extra tick) Approve patient assists | for the Chief doctor: approves the assists staff log each day |

Account Managers always have full access, and only Accounts (the owner) can top up petty cash.

**The patient workflow**
1. **Add patient** (Patients → + New patient, or straight from the booking form). Age is worked out from the date of birth.
2. **Book appointment** → the day grid / queue: **Scheduled → Check in (Waiting) → In chair → Done**. Each step has **↩ Back** to undo one step (e.g. At billing → In chair).
3. **Done** opens **"What happened in this appointment?"**:
   - **Treatment done (required):** each treatment with its doctor and **cost** (filled from the price list), discount, and a consultant fee for consultants.
   - **Medicines / tablets:** pick the medicine, tick **Morning / Afternoon / Evening / Night** and enter the **days**; the number of tablets (ticks × days) and the cost are worked out and added to the bill.
   - **Treatment plan description:** write it, or tick **Skip the description for now**: everyone in the clinic then gets a reminder "Treatment plan description needs to be updated for <patient>" until it's written (Patient → Visits & summaries).
   - Optionally book the next visit. **← Back** returns to the queue (the patient stays In chair).
4. **Save & go to bill →** opens the **Bill** in the same window: this visit's treatments, earlier balance, **Save payment** (amount, mode), then **Print bill** and **Print receipt**. **Complete visit** is enabled once a payment is saved, or tick **No payment now** (the balance stays due). Only then does the patient move to **Completed**. **← Back** on the bill reopens the treatments and medicines to correct them.
5. If the person doing the summary has no Billing access, the patient waits in the queue as **At billing** (and a **Billing pending** task appears on the Planning Board) until the front desk opens **Bill & print**.

**Patient record tabs:** Profile · Treatments · **Tablets / prescriptions** (add medicines outside a visit, **Print prescription** per visit) · Billing · **Visits & summaries** · **Documents** (OPG, X-ray, intraoral scans, CBCT, blood tests, prescriptions, consent forms, lab reports; photos or PDFs up to 700 KB) · Pre/post-op photos · History (one timeline of everything).

**Clinic ↔ Planning Board (automatic, every sign-in and every 10 minutes)**

| Epic on the Planning Board | When | For |
|---|---|---|
| Treatment plan description | the description was skipped | **everyone in the clinic** |
| Patient documents backlog | a billed treatment needs a document (e.g. OPG) that isn't uploaded yet | **everyone in the clinic** |
| Patient follow-ups | a patient was seen today → appears on **tomorrow's** board | **everyone in the clinic** |
| Missed / skipped patients | marked Missed, or still Scheduled/Waiting at the end of the day → **next morning, 9 AM reminder** | **everyone in the clinic** |
| Accounts | a monthly commitment (e.g. Rent) not entered by the **15th** | Accounts access |
| Daily tally | a day with cash payments has no tally, or a tally didn't match | Account Manager and the Chief doctor |
| Billing pending | a patient is waiting **At billing** | Billing access |

These tasks tick themselves off when the work is done in the clinic (follow-ups stay until you tick them). They also appear on Home → Reminders, and each task has **Open in Clinic →**.

**Accounts (Clinic → Accounts)**
- **Overview:** income (patient payments **automatically** + any past/other income), clinic expenses, petty cash spent, net and margin, a 6-month chart, commitments, and where the money went.
- **Daily tally:** opening cash (yesterday's count) + cash from patients + change/float put in − cash expenses − cash taken out = **expected**; then count the drawer by **₹500 / 200 / 100 / 50 / 20 / 10 / 5 / 2 / 1**. It must match, or a note is required, and the person ticks "I counted this cash myself". **GPay / UPI, card & bank:** every online payment of the day is listed; the person opens the app, finds each one and ticks it, enters the total the app shows (0 if nothing), and ticks "I checked every GPay / UPI, card and bank payment myself". Any difference needs a note. Missing tallies (any day with payments) and cash or online differences go to the Account Manager's and Chief doctor's Planning Board.
- **Clinic expenses:** every expense with category, vendor, bill number, GST and an attached bill copy (photo/PDF). Consultant fees from treatments are added automatically.
- **Petty cash:** a separate cash box. The owner tops it up (note required); front desk records each spend (note required). **Count the box / opening balance:** the owner enters the cash actually in the box and the balance is set to it (the difference is recorded as an opening balance or a correction). A warning shows if spends are more than top-ups.
- **Lab / Materials:** as many vendors as you like (with GSTIN). Add bills (paid or **not paid yet**), filter by vendor, see what's unpaid, **Mark paid**.
- **Consultants:** every consultant doctor in one table: fees this month, fees to date, paid to date and **to pay now**, with **+ Fee** and **Pay**, and the patient-wise list of their fees.
- **Commitments & categories:** monthly commitments (Rent + your own, e.g. Electricity, Salary) with expected amounts, and your own expense categories.
- **Past data & audit:** add past months' income; **paste many rows** from Excel (`date, income|expense, category, amount, note`); and **Download audit pack**: one ZIP per financial year (April–March) with income, expenses (bill no., vendor GSTIN, GST), consultant fees and payments, petty cash, daily tallies, a month-by-month summary, and every attached bill copy, ready to hand to your auditor.

**Reports:** Collection (every payment with date, receipt, **patient**, doctor and mode), Treatment-wise earnings (summary + every treatment with the patient; medicines as one line), Doctors & consultants, Outstanding balances, Appointments, New patients.
- Toolbar: **Type** Daily / Monthly / Yearly · **Today** or **From / To** then **View** · **Tabular / Chart** · **Mode** (Cash, UPI / GPay, Card, Cheque, NEFT, RTGS, Bank transfer) · **Doctor**. Click a month or year row to open it day by day. CSV and Print.

**Patient assists (Clinic → Patient assists)**
- **My assists (assistants, reception, anyone):** each day, add the patients you assisted (patient, treatment, doctor, what you did). You see only your own entries and whether they're **Pending / Approved / Not approved**, never the amounts.
- **Approve (Chief doctor):** pending entries by day: **Approve**, **Reject** or **Approve all for this day**.
- **Incentives (Account Manager only):** set the **₹ per assist** for each treatment; see each person's approved assists and incentive for the month and **earned so far**; open a person to change the amount for a single entry.

**Good to know**
- Photos, documents and bill copies are stored in Firestore after compression (no paid storage plan needed). The free plan's 1 GiB holds a few thousand files; PDFs must be under 700 KB.
- A normal clinic day uses a small part of the free plan's 50,000 reads/day.

## Phase 3: move to zenvoraloop.abbisdentalcare.com (Wix DNS)

1. **Wix**: https://manage.wix.com/account/domains → **⋯** next to `abbisdentalcare.com` → **Manage DNS Records** → **CNAME (Aliases) → + Add Record**
   - Host Name: `zenvoraloop`
   - Value: `<your-github-username>.github.io` (no repo name, no https://)
   - Save → Save Changes
2. **GitHub** repo → **Settings → Pages → Custom domain** → `zenvoraloop.abbisdentalcare.com` → **Save**. Wait for the DNS check to pass (minutes to a few hours), then tick **Enforce HTTPS**.
3. **Firebase** → Authentication → Settings → **Authorized domains → Add domain** → `zenvoraloop.abbisdentalcare.com`
4. Done: **https://zenvoraloop.abbisdentalcare.com**. The old github.io address redirects there automatically, and your data doesn't move (it lives in Firestore).

Your main Wix site at `abbisdentalcare.com` isn't affected. Only the `zenvoraloop` subdomain points to GitHub.

Optional hardening: GitHub → your profile **Settings → Pages → Add a verified domain** → `abbisdentalcare.com`. This stops anyone else's repo from claiming your subdomains.

---

## Updating the app

Edit files → `git push` → live in about a minute (watch the Actions tab).

## Good to know

- **Privacy:** each organization's people, attendance and invoices live under `orgs/{org-id}`; each person's planner lives under `users/{their-id}` and only they can read it.
- **Temporary passwords:** whoever creates a login (you for Account Managers, Account Managers for their staff) knows the temporary password until the person signs in and replaces it, which the app forces on first sign-in.
- **Sync:** changes save automatically and appear live on your other devices. The dot on your avatar shows the status: green means saved, amber means saving, grey means offline (it syncs later), and red means there's a problem.
- **Free limits (Firebase Spark):** 1 GiB of data, 50K reads and 20K writes per day. GitHub Pages has a soft limit of 100 GB of bandwidth per month. Both are plenty for personal and team use.
- **`firebase-config.js` is public by design.** Every Firebase website exposes these values. Security comes from sign-in plus `firestore.rules`.
- **Offline desktop copy:** double-clicking `public/index.html` on your Mac still works as the local, no-login version.
- **Prefer Firebase Hosting instead of GitHub Pages?** `firebase.json` is ready. Run `firebase deploy` and connect the domain under Hosting → Add custom domain.
