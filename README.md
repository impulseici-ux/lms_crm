# Little Millennium Singanallur — Admissions CRM

A Firebase-based CRM that gives every prospective-parent enquiry — walk-in,
phone, WhatsApp, website, social, referral — one lead record, one owner and
one follow-up date, from first contact through to an admission decision.
This implements **Phase 1 (MVP)** of the product blueprint: manual capture
across all ten enquiry sources, the guardrailed follow-up system, the
Attention/Leakage panel, the unified lead timeline, role-based access, and
all eight core reports.

## Stack

- **Firestore** (Native mode) — data model in [`firestore.rules`](./firestore.rules) / `src/types`
- **Firebase Auth** (email/password) with role carried as a custom claim (`admin` / `counsellor` / `management`)
- **Cloud Functions** (`functions/`) — `setUserRole` (admin-only role management); `websiteWebhook` is scaffolded for **Phase 2** and is disabled unless a secret is configured — it is not part of Phase 1
- **Firebase Hosting** serving the built `web/` app
- **React + Vite + TypeScript + Tailwind v4** for the frontend

This CRM is meant to live in its **own, separate Firebase project** — never
share it with another system's Auth tenant or Firestore database.

## Repo layout

```
firebase.json / firestore.rules / firestore.indexes.json   Firebase project config
functions/           Cloud Functions (TypeScript)
web/                 React frontend (Vite)
scripts/seed.mjs                Seeds demo staff/leads into the local emulators
scripts/bootstrap-admin.mjs     One-time first-admin grant on a real Firebase project
```

## Local development

Everything below runs against the **Firebase Local Emulator Suite** — no
real Firebase project or billing is needed for development.

```bash
npm install                       # root deps: firebase-tools, firebase-admin
npm --prefix functions install
npm --prefix web install

npm run emulators                 # starts Auth + Firestore + Functions emulators + UI on :4000
```

In a second terminal, once the emulators are running:

```bash
npm run seed                      # creates demo staff, lookups, and sample leads
npm run dev                       # starts the Vite dev server (web/.env.local, see below)
```

Copy `web/.env.example` to `web/.env.local`; the defaults already point the
app at the emulators (`VITE_USE_EMULATORS=true`), so no real Firebase config
is required for local dev.

Demo accounts created by the seed script (password `password123`):

| Email | Role |
|---|---|
| `admin@school.test` | admin |
| `counsellor@school.test` | counsellor |
| `management@school.test` | management |

> **Note on this environment:** the emulator binaries are fetched from
> `firebase-public.firebaseio.com` on first run, which this sandboxed
> session's network policy blocks — so the emulator suite and seed script
> could not be executed and smoke-tested here. Both `functions/` and `web/`
> do type-check and build cleanly (`npm run build` in each), but you should
> run `npm run emulators` + `npm run seed` yourself on a machine without
> that restriction before treating this as fully verified.

## Deploying to a real Firebase project

There's no separate "database" to provision or link with a connection
string — Firestore lives *inside* your Firebase project and is created the
moment you enable it in the console. The app "connects" to it purely
through the config values in `web/.env.local` (`VITE_FIREBASE_PROJECT_ID`
etc.) — those tell the Firebase SDK which project's Auth/Firestore to talk
to. Once that config is right, every read/write in the app goes straight to
that project's Firestore automatically.

### 1. Create the project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**. Give it its own name (e.g. `little-millennium-crm`) — do **not** reuse an existing project.
2. In **Project settings → Usage and billing**, upgrade to the **Blaze (pay-as-you-go)** plan. This is required for Cloud Functions; Firestore/Auth/Hosting usage at this scale (a few hundred leads a season) costs close to nothing.
3. In the left sidebar → **Build → Authentication → Get started → Sign-in method**, enable **Email/Password**.
4. In **Build → Firestore Database → Create database**, choose **Native mode** and a region close to you (e.g. `asia-south1` for India).

### 2. Point this repo at it

1. Install the CLI if you haven't: `npm install -g firebase-tools`, then `firebase login` (opens a browser to sign in with the same Google account).
2. In `.firebaserc`, replace the placeholder project id:
   ```json
   { "projects": { "default": "little-millennium-crm" } }
   ```
   (use your actual project id, shown in Project settings → General).
3. In the Firebase Console → Project settings → General → **Your apps**, click the `</>` (web) icon to register a web app, then copy the `firebaseConfig` values it gives you into `web/.env.local` (copy `web/.env.example` first):
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=little-millennium-crm
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_USE_EMULATORS=false
   ```

### 3. Deploy rules, functions and the built frontend

```bash
npm --prefix functions install
npm --prefix web install
npm --prefix web run build              # builds web/dist, which Hosting serves

firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

Firebase will print your live URL (`https://little-millennium-crm.web.app`).
Cloud Functions deploy will ask to enable a couple of Google Cloud APIs the
first time — accept those prompts.

### 4. Bootstrap your first admin (one-time)

The app can only grant roles through an existing admin (Admin → Staff), so
the very first one has to be created outside the app:

1. Firebase Console → Authentication → **Add user** — create the admin's login (email + password), and copy their **User UID**.
2. Firebase Console → Project settings → **Service accounts** → **Generate new private key** → save the downloaded file as `service-account.json` in the repo root (it's git-ignored, never commit it).
3. Run:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
     node scripts/bootstrap-admin.mjs <their-UID> <their-email> "Their Name"
   ```
4. Delete `service-account.json` once you're done (or keep it somewhere safe outside the repo) — it grants full admin access to your Firebase project.

### 5. Test it

1. Open the Hosting URL, sign in as the admin you just bootstrapped.
2. Go to **Admin** and add at least one program (e.g. "Nursery") and a lead source or two — `leadSources`/`programs` start empty on a fresh project (the seed script only populates the *emulator*, not a real project).
3. Create your other staff accounts the same way as step 1 above (Console → Authentication → Add user), then use **Admin → Staff** in the app itself to grant them `counsellor` or `management` roles (paste their UID) — from here on you no longer need the bootstrap script.
4. Go to **New Lead**, log a walk-in, and confirm it appears on **Leads** and moves through the pipeline on its **Lead Profile** page.
5. Check the **Dashboard**'s Attention panel and **Reports** reflect what you just created.

If anything 403s in the browser console, it's almost always one of: Firestore
rules not deployed yet (`firebase deploy --only firestore:rules`), the
signed-in user has no role set yet (Admin → Staff), or `web/.env.local` still
has `VITE_USE_EMULATORS=true` while no emulator is running.

## What's implemented (Phase 1) vs. deferred

See the full blueprint for the complete rationale. In short:

- ✅ Manual lead creation for all ten Section 4 sources via one fast form
- ✅ Full 7-stage open pipeline + 6 closed statuses (Section 5)
- ✅ Follow-up state (Overdue / Due Today / Upcoming / None Set) derived, never stored; guardrail blocks saving an open lead with no next follow-up
- ✅ Attention/Leakage panel (Section 8's seven rules) on the dashboard and leads list
- ✅ Unified, append-only activity timeline per lead (Section 9)
- ✅ Three roles with Firestore-rules-enforced permissions, admin-only reassignment with audit trail
- ✅ Campaigns as a tag on a lead, with a funnel-style report
- ✅ All eight Section 15 reports behind one shared filter bar, with CSV export
- 🚧 **Deferred to Phase 2/3** (per the blueprint, not built here): live website-form webhook, WhatsApp Business API, telephony/IVR, ad-platform lead sync, automated duplicate detection, push/email overdue digests. The Cloud Functions layer (`websiteWebhook`) is scaffolded to the target shape but stays disabled until you're ready for Phase 2.

## Known open questions

Section 21 of the blueprint lists decisions the admissions team should confirm
(branch count, final program list, a possible fourth "Front Desk" role, the
"Not Reachable" attempt threshold, data retention, etc.). This build makes
the blueprint's own recommended defaults where a decision was needed —
adjust `leadSources`/`programs`/`branches` via Admin settings, and revisit
`src/utils/attention.ts`'s thresholds, once those questions are answered.
