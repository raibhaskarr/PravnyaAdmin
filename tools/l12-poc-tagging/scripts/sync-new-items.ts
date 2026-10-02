// One-off: pulls the just-created real taxonomy items back into the local poc.sqlite snapshot
// (poc_taxonomy_skill_items) so tag-items.ts has them as match candidates on its re-run.
import "dotenv/config";
import { openDb } from "../lib/db";

const API_BASE = "https://admin.pravnya.com/api";

const AFFECTED_SKILL_IDS = [
  "06ff791a-ff31-41c4-ba0a-064224c3b886",
  "f97d61e7-3655-40fb-996c-8c59aef4343c",
  "8877bc05-ab54-4a45-80fa-f704532b9ab7",
  "58406d86-0812-4e29-a7bd-f41cfd051778",
  "ebbe87df-24d7-45b0-9169-a142f09f6639",
  "dc32667a-85ea-4ebf-8375-57c0039392a2",
  "d781481d-a17a-4f43-8a76-5bfd3572840c",
  "0cf8334d-9a17-4cf3-b5ed-9cfa2722083f",
  "bebdab97-4ac1-45a7-8993-69fa5f96c836",
  "d14d8038-6ba7-4225-b660-b1d1e6341c3b",
  "40d05ba9-468e-483b-a5ab-a0ad78808fce",
  "f43f7b8c-2bf3-4cd7-b206-2ded645f30f1",
  "1218fc48-dfe2-4330-9934-c3d56a91e218",
  "c03e0c20-361c-4110-b78c-923d117522bc",
  "331b3956-c39f-465f-8836-75963bd033c8",
  "1ba1a088-bd1e-432e-bd64-fe6b9ac2ffea",
  "ed590a50-c000-4af7-b133-55c71658c819"
];

async function login(): Promise<string> {
  const email = process.env.PRAVNYAADMIN_EMAIL;
  const password = process.env.PRAVNYAADMIN_PASSWORD;
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = (await res.json()) as { token: string };
  return data.token;
}

async function main() {
  const token = await login();
  const db = openDb();
  const upsert = db.prepare(
    `INSERT INTO poc_taxonomy_skill_items (id, skill_id, key, display_name, semantic_group)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET key = excluded.key, display_name = excluded.display_name, semantic_group = excluded.semantic_group`
  );

  let synced = 0;
  for (const skillId of AFFECTED_SKILL_IDS) {
    const res = await fetch(`${API_BASE}/taxonomy/skills/${skillId}`, { headers: { authorization: `Bearer ${token}` } });
    const skill = (await res.json()) as { items: { id: string; skillId: string; key: string; displayName: string; semanticGroup: string }[] };
    for (const item of skill.items) {
      upsert.run(item.id, item.skillId, item.key, item.displayName, item.semanticGroup);
      synced += 1;
    }
  }
  console.log(`Synced ${synced} items across ${AFFECTED_SKILL_IDS.length} skills.`);
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
