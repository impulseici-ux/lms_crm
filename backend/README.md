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
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Yes, for `api/whatsapp-webhook.ts` | Any string you choose. Enter the same value as the "Verify token" when configuring the webhook in Meta's App Dashboard (WhatsApp → Configuration) — Meta's one-time GET handshake must echo this back to prove the endpoint is yours. |
| `WHATSAPP_APP_SECRET` | Recommended, for `api/whatsapp-webhook.ts` | The Meta App's "App Secret" (App Dashboard → Settings → Basic). Used to verify the `X-Hub-Signature-256` header on every webhook POST, so a third party can't forge delivery-status updates. If unset, the endpoint still works but logs a warning and skips verification — fine for initial setup, not for production. |

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

## WhatsApp Cloud API webhook (`api/whatsapp-webhook.ts`)

Receives delivery-status updates (sent/delivered/read/failed) and inbound
messages from Meta's WhatsApp Business Platform, once a Meta app is
configured to point its webhook at this deployment.

- **Callback URL** to enter in Meta's App Dashboard (WhatsApp → Configuration →
  Webhooks): `https://<this-vercel-deployment>/api/whatsapp-webhook`.
- **Verify token**: whatever you set `WHATSAPP_WEBHOOK_VERIFY_TOKEN` to —
  must match exactly on both sides.
- On a status update, it looks up the `whatsappMessages` doc whose
  `providerMessageId` matches the status's message id and updates its
  `status`/`error`, plus appends an `events` subcollection entry — the same
  shape `web/src/lib/data/whatsapp.ts`'s `setWhatsAppMessageStatus` writes
  from the client, kept in sync here since `MetaWhatsAppProvider` isn't
  implemented yet and will be the thing that first populates
  `providerMessageId` with real values.
- Inbound messages (parent replies) are only logged today — this CRM has no
  two-way chat inbox yet, so there's nothing in Firestore to write them to.
