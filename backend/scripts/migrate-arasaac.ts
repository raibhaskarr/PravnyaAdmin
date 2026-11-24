// One-off: rewrite every "kind:symbol" id in prod tables (VisualSchedule, VisualScheduleTemplate,
// AacBoard, AacBoardTemplate) from Mulberry to its ARASAAC equivalent. Idempotent -- running it
// twice leaves the data unchanged (ARASAAC ids are not in the map's keys).
//
// Dry run first:  node --import tsx scripts/migrate-arasaac.mjs
// Apply:          node --import tsx scripts/migrate-arasaac.mjs --write

import fs from "node:fs";
import { prisma } from "../src/config/prisma";
import { TEMPLATES } from "../src/modules/visual-schedules/visualSchedules.templates";
import { BUILT_IN_BOARDS } from "../src/modules/aac/aac.templates";
import { arasaac } from "../src/modules/symbols/arasaac";
import { mulberry } from "../src/modules/symbols/mulberry";

// Rebuild the same map the code update used, in-process (no external file).
const OVERRIDES = {
  "happy_man": "arasaac:35533", "sad_man": "arasaac:35545", "angry_man": "arasaac:35539",
  "afraid_man": "arasaac:35535", "excited_man": "arasaac:39090", "confused_man": "arasaac:2352",
  "bed_time": "arasaac:25900", "sleep_male_,_to": "arasaac:6479",
  "mum_parent": "arasaac:2458", "dad_parent": "arasaac:2497",
  "teacher_1a": "arasaac:2457", "doctor_1a": "arasaac:2467", "occupational_therapist_1b": "arasaac:2395",
  "school_bag": "arasaac:2475",
  "wash_hands_,_to": "arasaac:8977", "dry_hands_,_to": "arasaac:2566", "clean_hands": "arasaac:3351",
  "toilet_,_go_to_the": "arasaac:5921", "toilet_roll": "arasaac:2862", "flush_toilet_,_to": "arasaac:10184",
  "potty_chair": "arasaac:5921", "read_book_,_to": "arasaac:7141", "talk_1_,_to": "arasaac:6517",
  "cut_with_scissors_,_to": "arasaac:2591", "pack_suitcase_,_to": "arasaac:2931",
  "break_time_1": "arasaac:6604", "breakfast_1": "arasaac:4626", "bubbles_blow": "arasaac:6945",
  "timer_2": "arasaac:35127", "turn_off_light_switch_,_to": "arasaac:8619",
  "body_outline": "arasaac:6473", "under_1": null
};
function cleanLabel(id) {
  const m = mulberry.get(id);
  if (!m) return null;
  return m.label.toLowerCase().replace(/, to$/, "").replace(/, go to the$/, "").replace(/\s+male$/, "").replace(/\s+1[ab]$/, "").replace(/\s+parent$/, "").replace(/\s+man$/, "").replace(/\s+1$/, "").replace(/\s+2$/, "").trim();
}
const codeIds = new Set();
for (const t of TEMPLATES) for (const s of t.steps) if (s.symbolId) codeIds.add(s.symbolId);
for (const b of BUILT_IN_BOARDS) for (const p of b.pages) for (const c of p.cells) { if (!c) continue; const sym = Array.isArray(c) ? c[2] : null; if (sym) codeIds.add(sym); }
const MAP = {};
for (const id of codeIds) {
  if (id in OVERRIDES) { MAP[id] = OVERRIDES[id]; continue; }
  const label = cleanLabel(id);
  const hit = label ? arasaac.search(label, 1)[0] : null;
  MAP[id] = hit ? hit.id : null;
}

const APPLY = process.argv.includes("--write");

/** Rewrite a steps[] (visual schedules) in place. Returns how many picture ids changed. */
function walkSteps(steps) {
  let changed = 0;
  for (const s of steps ?? []) {
    const p = s?.picture;
    if (p?.kind === "symbol" && typeof p.symbolId === "string" && p.symbolId in MAP) {
      const next = MAP[p.symbolId];
      if (next && next !== p.symbolId) { p.symbolId = next; changed++; }
    }
  }
  return changed;
}

/** Rewrite pages[].cells[].picture in place (AAC). */
function walkPages(pages) {
  let changed = 0;
  for (const p of pages ?? []) for (const c of p?.cells ?? []) {
    const pic = c?.picture;
    if (pic?.kind === "symbol" && typeof pic.symbolId === "string" && pic.symbolId in MAP) {
      const next = MAP[pic.symbolId];
      if (next && next !== pic.symbolId) { pic.symbolId = next; changed++; }
    }
  }
  return changed;
}

async function migrate() {
  const report = [];
  // Visual schedules (kid's own) and templates (centre + built-in)
  const schedules = await prisma.visualSchedule.findMany({ select: { id: true, title: true, steps: true } });
  for (const s of schedules) {
    const steps = structuredClone(s.steps);
    const n = walkSteps(steps);
    if (!n) continue;
    report.push({ table: "VisualSchedule", id: s.id, title: s.title, changed: n });
    if (APPLY) await prisma.visualSchedule.update({ where: { id: s.id }, data: { steps } });
  }
  const scheduleTemplates = await prisma.visualScheduleTemplate.findMany({ select: { id: true, title: true, steps: true } });
  for (const s of scheduleTemplates) {
    const steps = structuredClone(s.steps);
    const n = walkSteps(steps);
    if (!n) continue;
    report.push({ table: "VisualScheduleTemplate", id: s.id, title: s.title, changed: n });
    if (APPLY) await prisma.visualScheduleTemplate.update({ where: { id: s.id }, data: { steps } });
  }
  // AAC boards (kid's own) and templates (centre + built-in)
  const boards = await prisma.aacBoard.findMany({ select: { id: true, name: true, pages: true } });
  for (const b of boards) {
    const pages = structuredClone(b.pages);
    const n = walkPages(pages);
    if (!n) continue;
    report.push({ table: "AacBoard", id: b.id, title: b.name, changed: n });
    if (APPLY) await prisma.aacBoard.update({ where: { id: b.id }, data: { pages } });
  }
  const boardTemplates = await prisma.aacBoardTemplate.findMany({ select: { id: true, name: true, pages: true } });
  for (const b of boardTemplates) {
    const pages = structuredClone(b.pages);
    const n = walkPages(pages);
    if (!n) continue;
    report.push({ table: "AacBoardTemplate", id: b.id, title: b.name, changed: n });
    if (APPLY) await prisma.aacBoardTemplate.update({ where: { id: b.id }, data: { pages } });
  }

  const total = report.reduce((n, r) => n + r.changed, 0);
  console.log(`\n${APPLY ? "Applied" : "Dry run"}: ${report.length} rows touched, ${total} picture ids changed.`);
  for (const r of report.slice(0, 40)) console.log(" -", r.table.padEnd(24), r.title.padEnd(32), "+" + r.changed);
  if (report.length > 40) console.log(`   ...and ${report.length - 40} more rows`);
  fs.writeFileSync("/tmp/arasaac-migration-report.json", JSON.stringify(report, null, 2));
  console.log("\nFull report: /tmp/arasaac-migration-report.json");
  if (!APPLY) console.log("\n(dry run -- pass --write to actually update the database)");
}

migrate().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
