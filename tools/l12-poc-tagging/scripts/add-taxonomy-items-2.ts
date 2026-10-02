// Second round: new item-bank gaps surfaced by the Claude pass's "no real item fit" evidence,
// reviewed the same way as the first round (see scripts/add-taxonomy-items.ts) -- same shared-bank
// skills, same convention-matching bar, skip anything mismatched-axis or too noisy to trust.
import "dotenv/config";

const API_BASE = "https://admin.pravnya.com/api";

interface NewItem {
  skillId: string;
  semanticGroup: string;
  displayName: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const SHARED_OBJECT_BANK_SKILLS = [
  "06ff791a-ff31-41c4-ba0a-064224c3b886", // Identifies objects/pictures when named
  "f97d61e7-3655-40fb-996c-8c59aef4343c", // Identifies common items by auditory cue alone
  "8877bc05-ab54-4a45-80fa-f704532b9ab7" // Labels/names familiar objects (tact)
];

const items: NewItem[] = [
  ...SHARED_OBJECT_BANK_SKILLS.flatMap((skillId) => [
    { skillId, semanticGroup: "COLORS", displayName: "Blue" },
    { skillId, semanticGroup: "COLORS", displayName: "Yellow" },
    { skillId, semanticGroup: "COLORS", displayName: "Brown" },
    { skillId, semanticGroup: "TOYS", displayName: "Lego" },
    { skillId, semanticGroup: "FOOD_AND_DRINK", displayName: "Tea" },
    { skillId, semanticGroup: "CLOTHING", displayName: "T-shirt" },
    { skillId, semanticGroup: "CLOTHING", displayName: "Coat" }
  ]),

  // Imitates vowel and early consonant sounds (echoic) -- same bare-letter convention as the
  // existing a/e/i/o/u, b/d/m/n/p
  { skillId: "ed590a50-c000-4af7-b133-55c71658c819", semanticGroup: "CONSONANTS", displayName: "k" },
  { skillId: "ed590a50-c000-4af7-b133-55c71658c819", semanticGroup: "CONSONANTS", displayName: "g" },
  { skillId: "ed590a50-c000-4af7-b133-55c71658c819", semanticGroup: "CONSONANTS", displayName: "s" },

  // Balances
  { skillId: "1ba1a088-bd1e-432e-bd64-fe6b9ac2ffea", semanticGroup: "OTHER", displayName: "Cone stacking" },
  { skillId: "1ba1a088-bd1e-432e-bd64-fe6b9ac2ffea", semanticGroup: "OTHER", displayName: "Hurdle jumping" },
  { skillId: "1ba1a088-bd1e-432e-bd64-fe6b9ac2ffea", semanticGroup: "OTHER", displayName: "Squats" },
  { skillId: "1ba1a088-bd1e-432e-bd64-fe6b9ac2ffea", semanticGroup: "OTHER", displayName: "Stepping up on chair" }
];

async function login(): Promise<string> {
  const email = process.env.PRAVNYAADMIN_EMAIL;
  const password = process.env.PRAVNYAADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set PRAVNYAADMIN_EMAIL and PRAVNYAADMIN_PASSWORD in .env");
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { token: string };
  return data.token;
}

async function main() {
  const token = await login();
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    const key = `${item.semanticGroup.toLowerCase()}_${slugify(item.displayName)}`;
    const res = await fetch(`${API_BASE}/taxonomy/skills/${item.skillId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ key, displayName: item.displayName, semanticGroup: item.semanticGroup })
    });
    if (res.status === 201) {
      created += 1;
      console.log(`created  ${item.skillId} ${item.semanticGroup}/${item.displayName}`);
    } else if (res.status === 409 || res.status === 400) {
      skipped += 1;
      console.log(`skip     ${item.skillId} ${item.semanticGroup}/${item.displayName} -> ${res.status} ${await res.text()}`);
    } else {
      failed += 1;
      console.log(`FAILED   ${item.skillId} ${item.semanticGroup}/${item.displayName} -> ${res.status} ${await res.text()}`);
    }
  }

  console.log(`\nDone. created=${created} skipped=${skipped} failed=${failed} (of ${items.length})`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
