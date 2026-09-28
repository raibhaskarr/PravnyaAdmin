import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";

// Docs live in backend/docs/manual/ and ship with every deploy the same way any other source
// file does (git checkout + dist rebuild) -- no separate "docs generation" step, no risk of a
// hand-copied doc drifting from what's actually deployed. Sorted by filename, so prefix files
// with a number (01-, 02-, ...) to control order.
const DOCS_DIR = path.join(process.cwd(), "docs", "manual");

export type DocSection = { slug: string; title: string; content: string };

function titleFromContent(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

export const manualService = {
  listDocs(): DocSection[] {
    if (!fs.existsSync(DOCS_DIR)) return [];
    return fs
      .readdirSync(DOCS_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((filename) => {
        const content = fs.readFileSync(path.join(DOCS_DIR, filename), "utf-8");
        const slug = filename.replace(/\.md$/, "");
        return { slug, title: titleFromContent(content, slug), content };
      });
  },

  // Generated live from the actual deployed Prisma schema (via its DMMF metadata) every time
  // this is called -- never a hand-maintained copy of the schema that could go stale. Any schema
  // change ships here automatically on the next deploy, no extra step required.
  dbStructure() {
    return Prisma.dmmf.datamodel.models.map((model) => ({
      name: model.name,
      documentation: model.documentation ?? null,
      fields: model.fields
        .filter((f) => f.kind !== "object" || f.relationName)
        .map((f) => ({
          name: f.name,
          type: f.isList ? `${f.type}[]` : f.type,
          kind: f.kind,
          isRequired: f.isRequired,
          isId: f.isId,
          isUnique: f.isUnique,
          isRelation: f.kind === "object",
          relationFromFields: f.relationFromFields?.length ? f.relationFromFields : undefined,
          documentation: f.documentation ?? null
        }))
    }));
  }
};
