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
scripts/seed.mjs      Seeds demo staff/leads into the local emulators
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

1. Create a new, separate Firebase project (Blaze plan, needed for Cloud Functions).
2. `firebase login`, then set `.firebaserc`'s `default` project to your real project ID (replace the `lms-crm-dev` placeholder).
3. In the Firebase Console, enable **Authentication** (email/password) and **Firestore** (Native mode).
4. Copy your web app's SDK config into `web/.env.local` (see `web/.env.example`) and set `VITE_USE_EMULATORS=false`.
5. Bootstrap the first admin: create their user in Firebase Auth, then temporarily call the `setUserRole` callable for that UID (e.g. from the Functions shell or a one-off script) since the app itself requires an existing admin to grant roles.
6. `firebase deploy --only firestore:rules,firestore:indexes,functions,hosting` (after `npm --prefix web run build`).

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
