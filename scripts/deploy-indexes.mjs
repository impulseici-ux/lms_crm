// Creates the composite indexes from firestore.indexes.json directly via
// the Firestore Admin API, for the same reason as deploy-rules.mjs:
// firebase-tools' own preflight check isn't authorized for some restricted
// service-account keys, even though the underlying API calls work fine.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//     node scripts/deploy-indexes.mjs <projectId>
import { readFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";

const [, , projectId] = process.argv;
if (!projectId) {
  console.error("Usage: node scripts/deploy-indexes.mjs <projectId>");
  process.exit(1);
}

const { indexes } = JSON.parse(readFileSync(new URL("../firestore.indexes.json", import.meta.url), "utf8"));

async function main() {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups`;

  for (const idx of indexes) {
    const url = `${base}/${idx.collectionGroup}/indexes`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ queryScope: idx.queryScope, fields: idx.fields }),
    });
    const body = await res.json();
    if (res.ok) {
      console.log(`Creating index on ${idx.collectionGroup} (${idx.fields.map((f) => f.fieldPath).join(", ")}) — building in background.`);
    } else if (body.error?.status === "ALREADY_EXISTS") {
      console.log(`Index on ${idx.collectionGroup} (${idx.fields.map((f) => f.fieldPath).join(", ")}) already exists.`);
    } else {
      console.error(`Failed for ${idx.collectionGroup}:`, JSON.stringify(body, null, 2));
    }
  }
  console.log("Done. Indexes build asynchronously — check Firestore → Indexes tab for progress.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
