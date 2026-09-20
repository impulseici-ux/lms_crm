# Funds Tracker

A separate web app for tracking money received and spent by each employee,
with manager oversight. Lives in this repo under `funds-app/` but runs on
its **own, separate Firebase project** — it shares no Auth users or
Firestore data with the admissions CRM in the rest of this repo.

## What it does

- **Employees** sign in and log day-to-day "Received" / "Spent" entries
  (amount, date, note). Each employee only ever sees their own entries.
- **Managers** see every employee's balance and transactions, filterable
  by employee, month, or a custom date range, and can export a
  consolidated CSV for any month across all employees.
- **Monthly export reminder**: the first time an employee opens the app
  in a new month (within the first 10 days), a popup offers to
  download/share last month's entries as CSV, and remembers once it's
  been exported.
- **Reminders tab**: employees can schedule a one-time or recurring
  monthly "pay"/"receive" reminder; it pops up automatically when the
  app is opened on or after its due date.
- **Dark/light mode** toggle (Profile page), persisted per device.
- **Manager → Employees**: add new employees (creates their login in one
  step) and see active/inactive status.

## Stack

Firebase Auth (email/password, `role` custom claim: `manager` /
`employee`) + Firestore (Native mode) + Cloud Functions (`createEmployee`,
`setUserRole`, `setEmployeeActive` — Blaze plan only) for the backend.
The frontend (React + Vite + TypeScript + Tailwind) is deployed
separately to **Netlify** — Firebase Hosting isn't used.

## Repo layout

```
funds-app/
  firebase.json / firestore.rules / firestore.indexes.json   Firebase project config
  functions/           Cloud Functions (TypeScript) — manager-only user management
  web/                 React frontend (Vite)
  scripts/
    create-admin.mjs   Bootstraps the very first manager (Auth user + role)
    set-role.mjs       Grants a role to an EXISTING user — the Spark-plan fallback
    seed.mjs           Seeds demo manager/employees/transactions into the LOCAL EMULATORS only
```

## Local development

```bash
cd funds-app
npm install                       # firebase-tools + firebase-admin (for scripts)
npm --prefix functions install
npm --prefix web install

npm run emulators                 # Auth + Firestore + Functions emulators + UI on :4001
```

In a second terminal, once the emulators are running:

```bash
npm run seed                      # demo manager + 2 employees + sample transactions
npm run dev                       # Vite dev server
```

Copy `web/.env.example` to `web/.env.local` first (defaults already point
at the emulators). Demo accounts (password `password123`):

| Email | Role |
|---|---|
| `manager@company.test` | manager |
| `employee@company.test` | employee |
| `employee2@company.test` | employee |

## Deploying: Firebase (backend) + Netlify (frontend)

This needs its **own** Firebase project — do not reuse the admissions CRM's
project or any other Firebase project.

### Firebase (Auth + Firestore only — no Hosting)

1. [console.firebase.google.com](https://console.firebase.google.com) →
   **Add project**. Enable **Authentication → Email/Password** and
   **Firestore Database (Native mode)**.
2. Update `.firebaserc` in this folder with the real project id.
3. Firebase Console → Project settings → **Your apps** → add a web app,
   copy the config into `web/.env.local` (copy from `web/.env.example`;
   set `VITE_USE_EMULATORS=false`) — these are the same values you'll
   paste into Netlify's environment variables below.
4. Deploy the security rules/indexes: `npm run deploy:rules`.
5. **Cloud Functions require the Blaze plan.** If staying on Spark, skip
   `functions` and use `scripts/set-role.mjs` / `scripts/create-admin.mjs`
   for all employee/role management instead of the in-app "Add employee"
   flow. On Blaze, run `npm --prefix functions install` once, then
   `firebase deploy --only functions`.
6. **Bootstrap the first manager** (works on Spark too):
   ```bash
   # Console → Project settings → Service accounts → Generate new private key
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
     node scripts/create-admin.mjs manager@yourcompany.com 'a-strong-password' 'Manager Name'
   ```

### Netlify (frontend hosting)

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import
   an existing project** → connect this GitHub repo.
2. Build settings: **base directory** `funds-app/web`, **build command**
   `npm run build`, **publish directory** `funds-app/web/dist`
   (`web/netlify.toml` already sets these plus the SPA redirect).
3. Site settings → **Environment variables** → add the same 6
   `VITE_FIREBASE_*` values from `web/.env.local` above, plus
   `VITE_USE_EMULATORS=false`.
4. Deploy. Then in Firebase Console → **Authentication → Settings →
   Authorized domains**, add the Netlify URL — sign-in is blocked from
   unauthorized domains.
5. Sign in as the manager you bootstrapped, go to **Employees**, and add
   the team (Blaze), or run `scripts/set-role.mjs` per employee (Spark).

## Data model

- `users/{uid}` — `{ name, email, role, active }`, mirrors the Auth custom claim.
- `transactions/{id}` — `{ employeeId, employeeName, type: 'received'|'spent', amount, date, month, note, createdBy }`.
  Firestore rules restrict read/write to the owning employee, except managers get read-only access to all.
- `reminders/{id}` — `{ employeeId, title, kind: 'pay'|'receive', amount, dueDate, repeat: 'once'|'monthly', note, completed, lastCompletedFor }`, private to the employee.
- `monthlyExports/{employeeId}_{YYYY-MM}` — tracks whether that month's export reminder has been actioned.
