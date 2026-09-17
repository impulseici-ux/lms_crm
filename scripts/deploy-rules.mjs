// Deploys firestore.rules directly via the Firebase Rules API
// (firebaserules.googleapis.com), bypassing firebase-tools' own preflight
// "is the Firestore API enabled" check via serviceusage.googleapis.com —
// a check some restricted service-account keys aren't authorized to make,
// even though the underlying Firestore/Rules APIs work fine for them.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//     node scripts/deploy-rules.mjs <projectId>
import { readFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";

const [, , projectId] = process.argv;
if (!projectId) {
  console.error("Usage: node scripts/deploy-rules.mjs <projectId>");
  process.exit(1);
}

const rulesSource = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

async function main() {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const rulesetRes = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      source: { files: [{ name: "firestore.rules", content: rulesSource }] },
    }),
  });
  const ruleset = await rulesetRes.json();
  if (!rulesetRes.ok) {
    console.error("Failed to create ruleset:", JSON.stringify(ruleset, null, 2));
    process.exit(1);
  }
  console.log("Created ruleset:", ruleset.name);

  const releaseName = `projects/${projectId}/releases/cloud.firestore`;
  let releaseRes = await fetch(`https://firebaserules.googleapis.com/v1/${releaseName}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ release: { name: releaseName, rulesetName: ruleset.name } }),
  });
  if (releaseRes.status === 404) {
    releaseRes = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: releaseName, rulesetName: ruleset.name }),
    });
  }
  const release = await releaseRes.json();
  if (!releaseRes.ok) {
    console.error("Failed to update release:", JSON.stringify(release, null, 2));
    process.exit(1);
  }
  console.log("Released firestore.rules to", releaseName);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
