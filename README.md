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
scripts/seed.mjs            Seeds demo staff/leads into the local emulators
scripts/create-admin.mjs    Creates a brand-new Auth user and grants them admin, in one step
scripts/set-role.mjs        Grants an EXISTING staff member's role (see "Staying on Spark" below)
scripts/deploy-rules.mjs    Fallback: deploys firestore.rules directly via the Rules API
scripts/deploy-indexes.mjs  Fallback: creates composite indexes directly via the Firestore Admin API
```

The two `deploy-*` fallback scripts exist because `firebase deploy` runs a
preflight check (via `serviceusage.googleapis.com`) that some restricted
service-account keys — e.g. the default "firebase-adminsdk" key you download
from Project settings → Service accounts — aren't authorized to answer, even
though the underlying Firestore/Rules APIs work fine for them. If
`firebase deploy --only firestore:rules` fails with a `serviceusage`/403
error, use `node scripts/deploy-rules.mjs <projectId>` instead (same
`GOOGLE_APPLICATION_CREDENTIALS` env var as the other scripts). Composite
index *creation* needs a different permission (`datastore.indexes.create`)
that key doesn't have either — `deploy-indexes.mjs` will report a clear 403
per index rather than silently doing nothing; if you hit that, create them
via the Firebase Console (Firestore → Indexes) or through a Google account
with Owner/Editor on the project instead.

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

## Dev vs. prod environments

Beyond the emulator (for local development) and needing its own separate
Firebase project from anything else the school runs, this repo also expects
**two live Firebase projects of its own**: one for **dev/staging** (safe to
break, used for testing changes and training staff) and one for **prod**
(what real admissions staff use day-to-day). They are two completely
separate Firebase projects — separate Firestore, separate Auth users,
separate everything — not two "modes" of one project.

`.firebaserc` already has aliases set up for this:

```json
{
  "projects": {
    "default": "littlemillennium-crm",
    "dev": "littlemillennium-crm",
    "prod": "REPLACE_WITH_YOUR_PROD_PROJECT_ID"
  }
}
```

`littlemillennium-crm` (the project created first) is wired up as **dev**.
When you're ready for prod: create a second, brand-new Firebase project the
same way (Section "Create the project" below), then replace
`REPLACE_WITH_YOUR_PROD_PROJECT_ID` with its real project id.

Each environment needs its **own** web app config, so instead of one
`web/.env.local`, keep two files (both git-ignored, both copied from
`web/.env.example`):

- `web/.env.dev.local` — dev project's config
- `web/.env.prod.local` — prod project's config

And two deploy commands, which switch the CLI's active project, build with
the matching env file, then deploy:

```bash
npm run deploy:dev     # → littlemillennium-crm (dev)
npm run deploy:prod    # → your prod project, once .firebaserc is filled in
```

Everything else below (creating a project, enabling Auth/Firestore,
bootstrapping the first admin) is per-project — you'll do it once for dev
and, separately, once for prod when you're ready to go live.

## Deploying to a real Firebase project

There's no separate "database" to provision or link with a connection
string — Firestore lives *inside* your Firebase project and is created the
moment you enable it in the console. The app "connects" to it purely
through the config values in `web/.env.dev.local` /
`web/.env.prod.local` (`VITE_FIREBASE_PROJECT_ID` etc.) — those tell
the Firebase SDK which project's Auth/Firestore to talk to. Once that config
is right, every read/write in the app goes straight to that project's
Firestore automatically.

### 0. Spark (free) plan vs. Blaze

**Cloud Functions require the Blaze (pay-as-you-go) plan** — even a single
function. If you're staying on **Spark** for now (no billing account), skip
deploying `functions` entirely and use `scripts/set-role.mjs` for all role
management instead of the in-app Admin → Staff screen (which calls a Cloud
Function and will fail on Spark). Firestore, Auth and Hosting all work fully
on Spark. You can upgrade to Blaze later — nothing about the data or rules
needs to change, you'd just start deploying `functions` too.

### 1. Create the project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**. Give it its own name — do **not** reuse an existing project. *(Already done if you're following along with an existing project.)*
2. **Only if going Blaze:** Project settings → **Usage and billing** → upgrade. Firestore/Auth/Hosting usage at this scale (a few hundred leads a season) costs close to nothing either way.
3. In the left sidebar → **Build → Authentication → Get started → Sign-in method**, enable **Email/Password**.
4. In **Build → Firestore Database → Create database**, choose **Native mode** and a region close to you (e.g. `asia-south1` for India).

### 2. Point this repo at it

1. Install the CLI if you haven't: `npm install -g firebase-tools`, then `firebase login` (opens a browser to sign in with the same Google account).
2. In `.firebaserc`, set the alias for whichever environment this is — `dev` is already filled in; for `prod`, replace `REPLACE_WITH_YOUR_PROD_PROJECT_ID` with the new project's real id (Project settings → General).
3. In the Firebase Console → Project settings → General → **Your apps**, click **Add app** → the `</>` (web) icon to register a web app (no Hosting setup needed in that wizard — skip/ignore the "Add Firebase Hosting" checkbox, we deploy that via CLI below). It'll show you a `firebaseConfig` object — copy those values into `web/.env.dev.local` (for the dev project) or `web/.env.prod.local` (for the prod project), whichever applies — copy from `web/.env.example` first:
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_USE_EMULATORS=false
   ```
   (The exact **Project ID** — not the display name shown at the top of the console — is in Project settings → General; it's what `firebaseConfig.projectId` will already show you.)

### 3. Deploy rules and the built frontend

```bash
npm install                            # once, for firebase-tools
npm --prefix web install               # once

npm run deploy:dev                     # or: npm run deploy:prod
```

That one command switches the CLI to the right project (`firebase use dev`
or `prod`), builds `web/` with the matching `.env.*.local` file, and deploys
Firestore rules/indexes + Hosting together. **On Blaze**, also run
`npm --prefix functions install` once and add `functions` to the deploy —
either edit the `deploy:dev`/`deploy:prod` scripts in `package.json` to
include `,functions` in the `--only` list, or run it as a separate command:
`firebase deploy --only functions` (after `firebase use dev` or `prod`).

Either way, Firebase prints your live URL (`https://<project-id>.web.app`)
when it finishes.

### 4. Grant your first admin (one-time, per project)

The app can only grant roles through an existing admin (Admin → Staff, which
needs Blaze), so the very first one on **each** project — dev and prod both
need this done separately — goes through `scripts/set-role.mjs` instead:

1. In that project's Firebase Console → Authentication → **Add user** — create their login (email + password), and copy their **User UID**.
2. That same project's Console → Project settings → **Service accounts** → **Generate new private key** → save the downloaded file as `service-account.json` in the repo root (it's git-ignored, never commit it, and each project needs its own key — don't reuse dev's key against prod or vice versa).
3. Run:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
     node scripts/set-role.mjs <their-UID> <their-email> admin "Their Name"
   ```
4. Repeat step 3 for each other staff member on that project, swapping `admin` for `counsellor` or `management` — **on Spark, this script is how you manage roles going forward**, not the Admin → Staff screen. Delete `service-account.json` when done for now (or keep it somewhere safe outside the repo).

A sensible pattern: use fake/test staff logins on **dev** to try things out
freely, then create real staff accounts only on **prod** once you're
confident.

### 5. Test it

Do this against **dev** first, always — never use prod as your first test
of a new change.

1. Open the dev Hosting URL, sign in as the admin you just granted there.
2. Go to **Admin** and add at least one program (e.g. "Nursery") and a lead source or two — `leadSources`/`programs` start empty on a fresh project (the seed script only populates the *emulator*, not a real project).
3. Go to **New Lead**, log a walk-in, and confirm it appears on **Leads** and moves through the pipeline on its **Lead Profile** page.
4. Check the **Dashboard**'s Attention panel and **Reports** reflect what you just created.
5. Only once that all looks right, repeat the relevant steps above against **prod** (its own project, its own admin, its own programs/sources) before putting it in front of real admissions staff.

If anything 403s in the browser console, it's almost always one of: Firestore
rules not deployed yet (`firebase deploy --only firestore:rules`), the
signed-in user has no role set yet (Admin → Staff), or `web/.env.local` still
has `VITE_USE_EMULATORS=true` while no emulator is running.

## Google Sheets lead sync (Meta Ads)

New rows in a Google Sheet fed by a Meta Lead Ads integration are imported
automatically into the `leads` collection (sourced as `"Meta Ads"`), on a
schedule, at no extra cost — no Blaze plan needed. It's a plain Node script
(`scripts/sync-google-sheets-leads.mjs`) using the Firebase Admin SDK
directly, same pattern as `scripts/set-role.mjs`/`scripts/seed.mjs`, run on a
cron by `.github/workflows/sync-leads.yml`. Every row is deduped by an
"external lead id" (the Meta Lead ID if the sheet has one, else a hash of
phone+email+created-time) recorded in the `metaLeadSyncLedger` collection, so
re-running the sync — or two runs overlapping — can never create a duplicate
lead. A failed row (bad phone, transient API error, etc.) is logged with a
reason and retried automatically on the next run without blocking the rest
of the batch.

**One-time setup:**

1. **Google Cloud**: in a Google Cloud project, enable the **Google Sheets
   API**, create a **Service Account**, and generate a JSON key for it.
2. **Share the Sheet**: open your Meta Ads lead sheet → Share → add the
   service account's email (`...@...iam.gserviceaccount.com`) as **Viewer**.
3. **GitHub repo secrets** (Settings → Secrets and variables → Actions):
   - `GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY` — the full JSON key from step 1, as one string
   - `GOOGLE_SHEETS_SPREADSHEET_ID` — from the sheet's URL
   - `GOOGLE_SHEETS_SHEET_NAME` — the tab name, e.g. `Sheet1`
   - `FIREBASE_SERVICE_ACCOUNT_KEY` — a Firebase Admin SDK service-account JSON key for the target project (dev or prod), as one string
4. The workflow runs automatically every ~15 minutes. To run it immediately
   (including the first, historical-backfill run — it processes every
   existing row the first time, then only new ones after that), go to the
   repo's **Actions** tab → **Sync Google Sheets Leads** → **Run workflow**.
5. Check progress in the app under **Admin → Integrations** (last sync time/status,
   totals, and the last 10 runs with any per-row failures) — that panel is
   read-only; it never sees your credentials.

**Column mapping**: the script maps common Meta Lead Ads column names
(`Lead ID`, `Created Time`, `Full Name`, `Phone Number`, `Email`, `Campaign
Name`, `Ad Set Name`, `Ad Name`, `Form Name`, `Platform`, `Location`) to CRM
fields automatically — see `scripts/lib/sheetFieldMapping.mjs`. If your
sheet uses different headers, either rename them to match one of the
recognized aliases, or add `columnMapping: { "<your header, lowercase>":
"<field>" }` to the `integrations/googleSheetsSync` Firestore document to
override/extend the defaults without touching code.

**Want a live in-app "Sync Now" button instead of the Actions tab?** That
needs a callable Cloud Function, which requires the Blaze plan (see the
Spark vs. Blaze section above) — happy to add it if/when you upgrade.

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
- ✅ Automatic Google Sheets → CRM sync for Meta Ads leads (see "Google Sheets lead sync" above)
- 🚧 **Deferred to Phase 2/3** (per the blueprint, not built here): live website-form webhook, WhatsApp Business API, telephony/IVR, ad-platform lead sync, automated duplicate detection, push/email overdue digests. The Cloud Functions layer (`websiteWebhook`) is scaffolded to the target shape but stays disabled until you're ready for Phase 2.

## Known open questions

Section 21 of the blueprint lists decisions the admissions team should confirm
(branch count, final program list, a possible fourth "Front Desk" role, the
"Not Reachable" attempt threshold, data retention, etc.). This build makes
the blueprint's own recommended defaults where a decision was needed —
adjust `leadSources`/`programs`/`branches` via Admin settings, and revisit
`src/utils/attention.ts`'s thresholds, once those questions are answered.
