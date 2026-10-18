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
| **Account Manager** (one or more per org) | Add / disable / remove their own people · job titles, "reports to" and roles (Employee / Manager / Account Manager) · org chart · approve or deny support requests and revoke them · view their billing | Anything in another organization · change their own plan or features |
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

- Avatar → **Change password**, or **Forgot password?** on the sign-in page. Planner backup / restore is in the avatar menu too.
- The Super Admin email is set in **both** `public/firebase-config.js` and `firestore.rules`. If you change it, change both and publish the rules again.

## Staff attendance (Attendance tab, when the org has Attendance)

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
