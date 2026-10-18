# Zenvora Loop: launch on GitHub Pages, then move to zenvoraloop.abbisdentalcare.com

**How it fits together**

- **GitHub Pages** serves the website (free, HTTPS, redeploys on every `git push`).
- **Firebase Authentication** handles the login page (email/password and Google).
- **Cloud Firestore** is the database: private per user, on the free Spark plan, no card needed.

```
repo/
├── .github/workflows/pages.yml   publishes public/ to GitHub Pages on every push to main
├── public/                       the website
│   ├── index.html                the app
│   ├── firebase-config.js        ← paste your Firebase settings here (Phase 2)
│   ├── manifest.webmanifest      lets Chrome/Safari install it as an app
│   └── favicon.svg, icon-*.png
├── firestore.rules               database security: each user only sees their own data
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

## Phase 2: turn on login and the database (10 minutes, Firebase console)

1. **https://console.firebase.google.com** → **Create a project** (e.g. `zenvora-loop`). Analytics is optional.
2. **Build → Authentication → Get started → Sign-in method**: enable **Email/Password**, and enable **Google** (pick your support email).
3. **Build → Firestore Database → Create database**: **Standard** edition, location **asia-south1 (Mumbai)** (permanent), **production mode**.
4. Firestore → **Rules** tab → delete what's there, paste the contents of `firestore.rules`, and click **Publish**.
5. ⚙ **Project settings → General → Your apps → Web (</>)** → nickname `zenvora-web` → **Register app** (leave "Firebase Hosting" unticked). Copy `apiKey`, `authDomain`, `projectId` and `appId` from the config shown into **`public/firebase-config.js`**.
6. **Authentication → Settings → Authorized domains → Add domain** → `<your-github-username>.github.io`
7. Commit and push. About a minute later the site shows the **sign-in page**: create your account and you're on the cloud.
8. Move your old tasks over: in the desktop copy click **Export**, then on the website click **Import**.

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

- **Privacy:** each person's data lives under `users/{their-id}` in Firestore, and the rules only let that signed-in user read or write it.
- **Sync:** changes save automatically and appear live on your other devices. The dot on your avatar shows the status: green means saved, amber means saving, grey means offline (it syncs later), and red means there's a problem.
- **Free limits (Firebase Spark):** 1 GiB of data, 50K reads and 20K writes per day. GitHub Pages has a soft limit of 100 GB of bandwidth per month. Both are plenty for personal and team use.
- **`firebase-config.js` is public by design.** Every Firebase website exposes these values. Security comes from sign-in plus `firestore.rules`.
- **Offline desktop copy:** double-clicking `public/index.html` on your Mac still works as the local, no-login version.
- **Prefer Firebase Hosting instead of GitHub Pages?** `firebase.json` is ready. Run `firebase deploy` and connect the domain under Hosting → Add custom domain.
