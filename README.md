# Zenvora Loop: go live on zenvoraloop.abbisdentalcare.com

Stack: **Firebase Hosting** (website + free SSL) · **Firebase Authentication** (email/password + Google sign-in) · **Cloud Firestore** (database, private per user).
Everything below stays on Firebase's free **Spark** plan. No credit card is needed.

```
zenvora-loop/
├── firebase.json            hosting + database config
├── firestore.rules          security: each user can only read/write their own data
├── firestore.indexes.json
└── public/                  the website
    ├── index.html           the app (also still works offline if you double-click it)
    ├── manifest.webmanifest  lets Chrome/Safari install it as an app with the Z icon
    └── favicon.svg, icon-*.png
```

---

## 1. Create the Firebase project (about 5 minutes, in the browser)

1. Go to **https://console.firebase.google.com** → **Create a project** → name it `zenvora-loop` → Google Analytics is optional (you can turn it off) → **Create project**.
2. **Build → Authentication → Get started → Sign-in method**
   - **Email/Password** → Enable → Save
   - **Google** → Enable → choose your support email → Save
3. **Build → Firestore Database → Create database**
   - Edition: **Standard**
   - Location: **asia-south1 (Mumbai)**. This is permanent, so pick the one closest to your users.
   - Start in **production mode** (our `firestore.rules` file replaces the defaults on deploy).

## 2. Deploy from your Mac (about 5 minutes, in Terminal)

You need Node.js. Check with `node -v`. If it's missing, install the **LTS** version from https://nodejs.org.

```bash
npm install -g firebase-tools        # one time
firebase login                       # opens the browser: sign in with the same Google account
cd ~/Downloads/zenvora-loop          # wherever you unzipped this folder
firebase use --add                   # pick your project, then type the alias: default
firebase deploy                      # uploads the site + the security rules
```

When it finishes, it prints a **Hosting URL** like `https://zenvora-loop.web.app`. The app is live there now, so you can try it before the custom domain is ready.

## 3. Connect zenvoraloop.abbisdentalcare.com (Wix DNS)

1. Firebase console → **Build → Hosting → Add custom domain** → enter `zenvoraloop.abbisdentalcare.com` → Continue.
   Firebase shows you DNS records, usually **one TXT** and **one A record** (an IP address). Keep that page open.
2. In Wix: **https://manage.wix.com/account/domains** → click **⋯ (Domain Actions)** next to `abbisdentalcare.com` → **Manage DNS Records**.
   - **TXT** section → **+ Add Record**
     - Host Name: the part *before* `.abbisdentalcare.com` that Firebase shows (e.g. `zenvoraloop`). If Firebase shows just the bare domain or `@`, leave Host Name **blank**.
     - Value: paste the TXT value from Firebase.
   - **A (Host)** section → **+ Add Record**
     - Host Name: `zenvoraloop`
     - Points to: the IP address from Firebase. If Firebase lists two IPs, add one A record for each.
   - Click **Save** → **Save Changes**.
   - If an older A or CNAME record for `zenvoraloop` already exists, delete it.
3. Back in Firebase, click **Verify**. Status moves to **Connected** once DNS spreads and the SSL certificate is issued. That's usually within an hour, and at most 24 hours.
4. Firebase console → **Authentication → Settings → Authorized domains → Add domain** → `zenvoraloop.abbisdentalcare.com`
   (Google sign-in won't work on the custom domain without this step.)

Your main Wix website at `abbisdentalcare.com` is not affected. Only the `zenvoraloop` subdomain points to Firebase.

## 4. Bring over your existing tasks

1. Open your current desktop copy (`agenda-board.html`) → **Export** → saves `zenvora-loop-backup-….json`.
2. Open **https://zenvoraloop.abbisdentalcare.com** → create your account → **Import** → pick that file.

## 5. Install it like an app (optional)

- **Chrome (Mac):** open the site → ⋮ → **Cast, save and share → Install page as app**. You get a Dock icon with the Z logo.
- **iPhone (Safari):** Share → **Add to Home Screen**.

## Updating the app later

Replace `public/index.html` with the new version, then run:

```bash
firebase deploy --only hosting
```

## Good to know

- **Privacy:** data lives at `users/{your-user-id}/…` in Firestore. The rules only allow the signed-in owner to read or write it, so other users can't see your tasks.
- **Sync:** changes save automatically and show up live on your other devices. The dot on your avatar shows the status: green means saved, amber means saving, grey means offline (it syncs when you reconnect), and red means there's a problem.
- **Free limits (Spark plan):** 1 GiB of data, 50K reads and 20K writes per day, and 10 GB hosting storage with 360 MB of transfer per day. That's plenty for personal use and a small group of users. You can see usage in the console.
- **Emails:** password-reset and verification emails come from Firebase. You can change their wording in **Authentication → Templates**.
- **Testing locally:** `firebase emulators:start` serves the site at http://localhost:5000 using local test auth and database (needs Java).
