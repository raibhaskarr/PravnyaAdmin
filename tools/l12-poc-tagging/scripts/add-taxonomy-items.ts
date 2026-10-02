// One-off: writes the reviewed set of new Canonical Skill Items to the real PravnyaAdmin
// taxonomy, derived from "no real item fit" (ai_no_match) evidence hints that turned out to be
// genuine item-bank gaps rather than extraction noise or mismatched-axis hints. See chat for the
// full review (what was skipped and why).
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

// Shared item banks: the three receptive/expressive object skills and the four sound-production
// skills each reuse the exact same bank, so one addition is written three/four times.
const SHARED_OBJECT_BANK_SKILLS = [
  "06ff791a-ff31-41c4-ba0a-064224c3b886", // Identifies objects/pictures when named
  "f97d61e7-3655-40fb-996c-8c59aef4343c", // Identifies common items by auditory cue alone
  "8877bc05-ab54-4a45-80fa-f704532b9ab7" // Labels/names familiar objects (tact)
];
const SHARED_PHONEME_BANK_SKILLS = [
  "58406d86-0812-4e29-a7bd-f41cfd051778", // Produces target sound in isolation
  "ebbe87df-24d7-45b0-9169-a142f09f6639", // Produces target sound in phrases and sentences
  "dc32667a-85ea-4ebf-8375-57c0039392a2", // Produces target sound in syllables (CV/VC)
  "d781481d-a17a-4f43-8a76-5bfd3572840c" // Produces target sound in words (initial/medial/final)
];

const items: NewItem[] = [
  ...SHARED_OBJECT_BANK_SKILLS.flatMap((skillId) => [
    { skillId, semanticGroup: "BODY_PARTS", displayName: "Mouth" },
    { skillId, semanticGroup: "BODY_PARTS", displayName: "Nose" },
    { skillId, semanticGroup: "BODY_PARTS", displayName: "Ear" },
    { skillId, semanticGroup: "BODY_PARTS", displayName: "Eye" },
    { skillId, semanticGroup: "SCHOOL_OBJECTS", displayName: "Sharpener" },
    { skillId, semanticGroup: "FOOD_AND_DRINK", displayName: "Roti" },
    { skillId, semanticGroup: "FOOD_AND_DRINK", displayName: "Omelette" },
    { skillId, semanticGroup: "ANIMALS", displayName: "Crocodile" },
    { skillId, semanticGroup: "PEOPLE", displayName: "Boy" },
    { skillId, semanticGroup: "TOYS", displayName: "Clay" }
  ]),
  ...SHARED_PHONEME_BANK_SKILLS.map((skillId) => ({ skillId, semanticGroup: "CONSONANTS", displayName: "/kh/" })),

  // Identifies actions when named
  { skillId: "0cf8334d-9a17-4cf3-b5ed-9cfa2722083f", semanticGroup: "OTHER", displayName: "Cycling" },
  { skillId: "0cf8334d-9a17-4cf3-b5ed-9cfa2722083f", semanticGroup: "OTHER", displayName: "Bathing" },

  // Produces spontaneous functional verbs
  { skillId: "bebdab97-4ac1-45a7-8993-69fa5f96c836", semanticGroup: "OTHER", displayName: "Drink" },
  { skillId: "bebdab97-4ac1-45a7-8993-69fa5f96c836", semanticGroup: "OTHER", displayName: "Write" },
  { skillId: "bebdab97-4ac1-45a7-8993-69fa5f96c836", semanticGroup: "OTHER", displayName: "Cycle" },
  { skillId: "bebdab97-4ac1-45a7-8993-69fa5f96c836", semanticGroup: "OTHER", displayName: "Catch" },

  // Requests desired items/actions/locations (mand)
  { skillId: "d14d8038-6ba7-4225-b660-b1d1e6341c3b", semanticGroup: "OTHER", displayName: "Give" },
  { skillId: "d14d8038-6ba7-4225-b660-b1d1e6341c3b", semanticGroup: "OTHER", displayName: "Come" },
  { skillId: "d14d8038-6ba7-4225-b660-b1d1e6341c3b", semanticGroup: "OTHER", displayName: "Food" },
  { skillId: "d14d8038-6ba7-4225-b660-b1d1e6341c3b", semanticGroup: "OTHER", displayName: "Walk" },
  { skillId: "d14d8038-6ba7-4225-b660-b1d1e6341c3b", semanticGroup: "OTHER", displayName: "Hug" },
  { skillId: "d14d8038-6ba7-4225-b660-b1d1e6341c3b", semanticGroup: "OTHER", displayName: "Cup" },
  { skillId: "d14d8038-6ba7-4225-b660-b1d1e6341c3b", semanticGroup: "OTHER", displayName: "Car" },
  { skillId: "d14d8038-6ba7-4225-b660-b1d1e6341c3b", semanticGroup: "OTHER", displayName: "Bus" },
  { skillId: "d14d8038-6ba7-4225-b660-b1d1e6341c3b", semanticGroup: "OTHER", displayName: "Bike" },
  { skillId: "d14d8038-6ba7-4225-b660-b1d1e6341c3b", semanticGroup: "OTHER", displayName: "Ball" },
  { skillId: "d14d8038-6ba7-4225-b660-b1d1e6341c3b", semanticGroup: "OTHER", displayName: "Auto" },

  // Responds to / initiates greetings
  { skillId: "40d05ba9-468e-483b-a5ab-a0ad78808fce", semanticGroup: "OTHER", displayName: "Hey" },

  // Answers personal/social questions
  { skillId: "f43f7b8c-2bf3-4cd7-b206-2ded645f30f1", semanticGroup: "OTHER", displayName: "Date of birth" },

  // Asks questions to gain information
  { skillId: "1218fc48-dfe2-4330-9934-c3d56a91e218", semanticGroup: "OTHER", displayName: "What does ___ do?" },

  // Uses grammatically correct past tense
  { skillId: "c03e0c20-361c-4110-b78c-923d117522bc", semanticGroup: "IRREGULAR", displayName: "Made" },
  { skillId: "c03e0c20-361c-4110-b78c-923d117522bc", semanticGroup: "IRREGULAR", displayName: "Got" },
  { skillId: "c03e0c20-361c-4110-b78c-923d117522bc", semanticGroup: "IRREGULAR", displayName: "Bought" },

  // Spells simple words from dictation/independently
  { skillId: "331b3956-c39f-465f-8836-75963bd033c8", semanticGroup: "SIGHT_WORDS", displayName: "Ball" },
  { skillId: "331b3956-c39f-465f-8836-75963bd033c8", semanticGroup: "SIGHT_WORDS", displayName: "Apple" },

  // Balances
  { skillId: "1ba1a088-bd1e-432e-bd64-fe6b9ac2ffea", semanticGroup: "OTHER", displayName: "Balancing board" },
  { skillId: "1ba1a088-bd1e-432e-bd64-fe6b9ac2ffea", semanticGroup: "OTHER", displayName: "Vestibular board" },
  { skillId: "1ba1a088-bd1e-432e-bd64-fe6b9ac2ffea", semanticGroup: "OTHER", displayName: "Skating" },
  { skillId: "1ba1a088-bd1e-432e-bd64-fe6b9ac2ffea", semanticGroup: "OTHER", displayName: "Rollerblading" }
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
