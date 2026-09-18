# LM Singanallur CRM — activation backend

Small set of Vercel serverless functions that do the parts of the user
activation flow that can never run in the browser: generating/hashing
activation codes, verifying them, setting a user's password (via the
Firebase Admin SDK), and granting the `role` custom claim. See
`web/../README.md`'s "User activation flow" section for the full picture.

This exists because the CRM's Firebase project is on the free Spark plan,
which can't run Cloud Functions — this is the same problem the Google
Sheets sync solved with a GitHub Action, except this one has to respond to
a live button click (invite/verify/set password), not a schedule, so it
needs an actual server. Vercel's free tier does that.

## Environment variables (set in the Vercel project's dashboard — never commit these)

| Variable | Required | Purpose |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Yes | Full JSON contents of a Firebase Admin SDK service-account key (Firebase Console → Project settings → Service accounts → Generate new private key), as one string. Same kind of key already used by `scripts/*.mjs`. |
| `ACTIVATION_CODE_PEPPER` | Recommended | Any long random string. Folded into the activation-code hash so a Firestore-only read can't be used to brute-force codes offline without also having this. |
| `WHATSAPP_API_URL` / `WHATSAPP_API_TOKEN` | Not yet used | Once a WhatsApp Business API provider (Meta Cloud API, Twilio, Gupshup, ...) is chosen, its credentials go here and `lib/whatsapp.ts`'s `sendActivationCodeWhatsApp` gets its real implementation. Until then, every activation code send reports `failed` and the API response includes a one-time `fallbackCode` for the admin to relay manually. |

## Deploying

This is a Vercel Git-linked project with **Root Directory = `backend`**,
already connected to this GitHub repo — pushing to `main` redeploys it
automatically, the same as Firebase Hosting redeploys on `firebase deploy`.

## Wiring a real WhatsApp provider later

Replace the body of `sendActivationCodeWhatsApp` in `lib/whatsapp.ts` with
the provider's send call, reading credentials from `process.env`. Nothing
else in this backend, the Firestore schema, or the Admin UI needs to
change — they already consume exactly the `{ ok, status, error }` shape
that function returns.
