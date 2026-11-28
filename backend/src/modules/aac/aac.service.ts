import type { AacBoard, AacBoardTemplate, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid } from "../../common/access/kidAccess";
import { assertOwnsKid } from "../../common/access/parentKidAccess";
import { AppError, badRequest, conflict, forbidden, notFound } from "../../common/errors/AppError";
import { draftBoardWithAi } from "./aac.ai";
import { mediaPath, type Viewer } from "../media/media.service";
import { SYMBOL_CREDIT } from "../symbols/symbols";
import { assertPhotosFitKid, assertPhotosFitTemplate, present } from "../visual-schedules/visualSchedules.present";
import type { Step } from "../visual-schedules/visualSchedules.schemas";
import type { BoardFields, Cell, Page } from "./aac.schemas";
import { BUILT_IN_BOARDS } from "./aac.templates";

// AAC boards (one per child, changed by the child's therapists and parent) and AAC templates
// (Pravnya's and each centre's). Pictures follow the same rules as visual schedules: a child's
// board may use that child's photos or its centre's template photos; links are made per viewer.

type Language = "en" | "hi";

const staffViewer = (user: AuthUser): Viewer => ({ kind: "staff", id: user.id });
const parentViewer = (parentId: string): Viewer => ({ kind: "parent", id: parentId });
const allCells = (pages: Page[]) => pages.flatMap((p) => p.cells);
const allCellsWithCore = (pages: Page[], coreCells: Cell[]) => [...allCells(pages), ...coreCells];
// The picture checks take anything with a `picture`; cells have the same picture shape as steps.
const asSteps = (pages: Page[]) => allCells(pages) as unknown as Step[];

/** Pages as the apps show them: pictures and recordings with links made for this viewer. */
function presentPages(pages: Page[], viewer: Viewer) {
  return pages.map((p) => ({
    ...p,
    cells: (present(p.cells as unknown as Step[], viewer) as unknown as Cell[]).map((c) => ({ ...c, audio: c.audio ? { ...c.audio, url: mediaPath(c.audio.mediaId, viewer) } : null }))
  }));
}

const audioIds = (pages: Page[]) => [...new Set(allCells(pages).flatMap((c) => (c.audio ? [c.audio.mediaId] : [])))];

/** Recordings on a child's board must be recordings made for that child. */
async function assertAudioFitsKid(kidId: string, pages: Page[]) {
  const ids = audioIds(pages);
  if (!ids.length) return;
  const found = await prisma.mediaAsset.count({ where: { id: { in: ids }, kidId, mimeType: { startsWith: "audio/" } } });
  if (found !== ids.length) throw badRequest("A recording on this board wasn't made for this child");
}

/** Templates are shared with other families: never someone's voice. */
function assertNoAudio(pages: Page[]) {
  if (audioIds(pages).length) throw badRequest("Templates can't include voice recordings (they belong to one child). Remove them first.");
}

function presentBoard(b: AacBoard, viewer: Viewer) {
  return {
    id: b.id,
    kidId: b.kidId,
    name: b.name,
    language: b.language as Language,
    rows: b.rows,
    cols: b.cols,
    homePageId: b.homePageId,
    pages: presentPages(b.pages as unknown as Page[], viewer),
    coreCells: (present(((b as unknown as { coreCells: Cell[] }).coreCells ?? []) as unknown as Step[], viewer) as unknown as Cell[]).map((c) => ({ ...c, audio: c.audio ? { ...c.audio, url: mediaPath(c.audio.mediaId, viewer) } : null })),
    version: b.version,
    updatedByName: b.updatedByName,
    updatedAt: b.updatedAt,
    credit: SYMBOL_CREDIT
  };
}

async function staffName(user: AuthUser) {
  const [u, t] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true } }),
    prisma.therapist.findUnique({ where: { userId: user.id }, select: { name: true } })
  ]);
  return user.role === "SUPERADMIN" ? "Pravnya" : (t?.name ?? u.name);
}

async function parentName(parentId: string) {
  const p = await prisma.parent.findUniqueOrThrow({ where: { id: parentId }, select: { displayName: true, motherName: true, fatherName: true } });
  return p.displayName ?? p.motherName ?? p.fatherName ?? "Parent";
}

const json = (value: unknown) => value as unknown as Prisma.InputJsonValue;
/** The full set of cells on a board: every page + the core strip. Used for photo/audio ownership checks. */
const allSteps = (input: BoardFields) => allCellsWithCore(input.pages, input.coreCells) as unknown as Step[];
const allAudio = (input: BoardFields) => ({ pages: [...input.pages, { id: "core", name: "core", cells: input.coreCells }] });

async function createFor(kid: { id: string; tenantId: string }, input: BoardFields, by: string) {
  if (await prisma.aacBoard.findUnique({ where: { kidId: kid.id }, select: { id: true } })) {
    throw conflict("This child already has a board. Open it to change it, or delete it to start again.", "BOARD_EXISTS");
  }
  await assertPhotosFitKid(kid, allSteps(input));
  await assertAudioFitsKid(kid.id, allAudio(input).pages);
  return prisma.aacBoard.create({ data: { tenantId: kid.tenantId, kidId: kid.id, ...input, pages: json(input.pages), coreCells: json(input.coreCells), updatedByName: by } });
}

/** Saves only if nobody else saved since `version` was loaded. */
async function saveFor(board: AacBoard, input: BoardFields & { version: number }, by: string) {
  await assertPhotosFitKid({ id: board.kidId, tenantId: board.tenantId }, allSteps(input));
  await assertAudioFitsKid(board.kidId, allAudio(input).pages);
  const { version, ...fields } = input;
  const res = await prisma.aacBoard.updateMany({ where: { id: board.id, version }, data: { ...fields, pages: json(fields.pages), coreCells: json(fields.coreCells), version: { increment: 1 }, updatedByName: by } });
  if (res.count === 0) throw conflict("Someone else changed this board since you opened it. Reload it to see their changes, then make yours again.", "BOARD_CHANGED");
  return prisma.aacBoard.findUniqueOrThrow({ where: { id: board.id } });
}

async function staffBoard(user: AuthUser, id: string) {
  const board = await prisma.aacBoard.findUnique({ where: { id } });
  if (!board) throw notFound("Board not found");
  await assertCanAccessKid(user, board.kidId);
  return board;
}

async function parentBoard(parentId: string, kidId: string, id: string) {
  await assertOwnsKid(parentId, kidId);
  const board = await prisma.aacBoard.findFirst({ where: { id, kidId } });
  if (!board) throw notFound("Board not found");
  return board;
}

export const aacBoardsService = {
  async getForStaff(user: AuthUser, kidId: string) {
    await assertCanAccessKid(user, kidId);
    const b = await prisma.aacBoard.findUnique({ where: { kidId } });
    return b ? presentBoard(b, staffViewer(user)) : null;
  },
  async createForStaff(user: AuthUser, input: BoardFields & { kidId: string }) {
    const { kidId, ...fields } = input;
    const kid = await assertCanAccessKid(user, kidId);
    return presentBoard(await createFor(kid, fields, await staffName(user)), staffViewer(user));
  },
  async saveForStaff(user: AuthUser, id: string, input: BoardFields & { version: number }) {
    const board = await staffBoard(user, id);
    return presentBoard(await saveFor(board, input, await staffName(user)), staffViewer(user));
  },
  async removeForStaff(user: AuthUser, id: string) {
    await staffBoard(user, id);
    await prisma.aacBoard.delete({ where: { id } });
  },

  async getForParent(parentId: string, kidId: string) {
    await assertOwnsKid(parentId, kidId);
    const b = await prisma.aacBoard.findUnique({ where: { kidId } });
    return { board: b ? presentBoard(b, parentViewer(parentId)) : null };
  },
  async createForParent(parentId: string, kidId: string, input: BoardFields) {
    const kid = await assertOwnsKid(parentId, kidId);
    return presentBoard(await createFor(kid, input, await parentName(parentId)), parentViewer(parentId));
  },
  async saveForParent(parentId: string, kidId: string, id: string, input: BoardFields & { version: number }) {
    const board = await parentBoard(parentId, kidId, id);
    return presentBoard(await saveFor(board, input, await parentName(parentId)), parentViewer(parentId));
  },
  async removeForParent(parentId: string, kidId: string, id: string) {
    await parentBoard(parentId, kidId, id);
    await prisma.aacBoard.delete({ where: { id } });
  },

  /** AI draft (staff). The therapist reviews and saves through the normal create/save route; nothing is saved here. */
  async draftForStaff(user: AuthUser, input: { kidId: string; brief: string; language: "en" | "hi"; mediaIds: string[] }) {
    const kid = await assertCanAccessKid(user, input.kidId);
    const name = (await prisma.kid.findUniqueOrThrow({ where: { id: kid.id }, select: { firstName: true } })).firstName;
    const draft = await draftBoardWithAi({ kidId: kid.id, kidName: name, tenantId: kid.tenantId, brief: input.brief, language: input.language, photos: input.mediaIds.map((mediaId) => ({ mediaId })) });
    if (!draft) throw new AppError(503, "AI_UNAVAILABLE", "Pravnya couldn't draft the board just now. Try again in a moment, or build it yourself.");
    return draft;
  },

  /** AI draft (parent). Same, bound to a kid they own. */
  async draftForParent(parentId: string, kidId: string, input: { brief: string; language: "en" | "hi"; mediaIds: string[] }) {
    const kid = await assertOwnsKid(parentId, kidId);
    const name = (await prisma.kid.findUniqueOrThrow({ where: { id: kid.id }, select: { firstName: true } })).firstName;
    const draft = await draftBoardWithAi({ kidId: kid.id, kidName: name, tenantId: kid.tenantId, brief: input.brief, language: input.language, photos: input.mediaIds.map((mediaId) => ({ mediaId })) });
    if (!draft) throw new AppError(503, "AI_UNAVAILABLE", "Pravnya couldn't draft the board just now. Try again in a moment, or build it yourself.");
    return draft;
  }
};

// ---------- Templates ----------

/** Creates the built-in Pravnya boards (English and Hindi) that don't exist yet. Never overwrites. */
export async function ensureBuiltInBoards() {
  const existing = new Set((await prisma.aacBoardTemplate.findMany({ where: { builtInKey: { not: null } }, select: { builtInKey: true } })).map((t) => t.builtInKey));
  for (const b of BUILT_IN_BOARDS) {
    for (const lang of ["en", "hi"] as const) {
      const key = `${b.key}:${lang}`;
      if (existing.has(key)) continue;
      const pageId = new Map(b.pages.map((p) => [p.key, crypto.randomUUID()]));
      const pages: Page[] = b.pages.map((p) => ({
        id: pageId.get(p.key)!,
        name: p.name[lang],
        cells: p.cells.flatMap((spec, i) => {
          if (!spec) return [];
          const [en, hi, symbolId, cls, target] = spec;
          const folder = cls === "folder";
          return [
            {
              id: crypto.randomUUID(),
              row: Math.floor(i / b.cols),
              col: i % b.cols,
              kind: folder ? ("folder" as const) : ("word" as const),
              label: lang === "en" ? en : hi,
              say: null,
              picture: symbolId ? { kind: "symbol" as const, symbolId } : null,
              wordClass: folder ? ("misc" as const) : cls,
              targetPageId: folder ? pageId.get(target!)! : null,
              affix: null,
              hidden: false,
              audio: null
            }
          ];
        })
      }));
      await prisma.aacBoardTemplate
        .create({ data: { builtInKey: key, name: b.name[lang], language: lang, rows: b.rows, cols: b.cols, homePageId: pages[0].id, pages: json(pages), createdByName: "Pravnya" } })
        .catch(() => undefined); // created by a parallel request
    }
  }
}

function canEditTemplate(user: AuthUser, t: AacBoardTemplate) {
  if (user.role === "SUPERADMIN") return t.tenantId === null;
  if (t.tenantId !== user.tenantId) return false;
  if (user.role === "TENANT_ADMIN") return true;
  return user.role === "THERAPIST" && t.createdByUserId === user.id;
}

function viewTemplate(t: AacBoardTemplate, viewer: Viewer, canEdit = false) {
  return {
    id: t.id,
    scope: t.tenantId ? ("CENTRE" as const) : ("PRAVNYA" as const),
    builtIn: t.builtInKey !== null,
    builtInKey: t.builtInKey,
    name: t.name,
    language: t.language as Language,
    rows: t.rows,
    cols: t.cols,
    homePageId: t.homePageId,
    pages: presentPages(t.pages as unknown as Page[], viewer),
    createdByName: t.createdByName,
    canEdit,
    updatedAt: t.updatedAt
  };
}

async function visibleTemplates(tenantId: string | null, language?: Language) {
  await ensureBuiltInBoards();
  return prisma.aacBoardTemplate.findMany({
    where: { archived: false, OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])], ...(language ? { language } : {}) },
    orderBy: [{ tenantId: { sort: "asc", nulls: "last" } }, { builtInKey: { sort: "asc", nulls: "first" } }, { updatedAt: "desc" }]
  });
}

async function editableTemplate(user: AuthUser, id: string) {
  const t = await prisma.aacBoardTemplate.findFirst({ where: { id, archived: false } });
  if (!t) throw notFound("Template not found");
  if (!canEditTemplate(user, t)) throw forbidden(t.tenantId ? "Only a centre admin or whoever made this template can change it" : "Only Pravnya can change Pravnya's templates");
  return t;
}

export const aacTemplatesService = {
  async list(user: AuthUser, language?: Language) {
    const rows = await visibleTemplates(user.role === "SUPERADMIN" ? null : user.tenantId, language);
    return rows.map((t) => viewTemplate(t, staffViewer(user), canEditTemplate(user, t)));
  },
  async listForParent(parentId: string, kidId: string, language?: Language) {
    const kid = await assertOwnsKid(parentId, kidId);
    return (await visibleTemplates(kid.tenantId, language)).map((t) => viewTemplate(t, parentViewer(parentId)));
  },
  async create(user: AuthUser, input: BoardFields) {
    const tenantId = user.role === "SUPERADMIN" ? null : user.tenantId!;
    assertNoAudio(input.pages);
    await assertPhotosFitTemplate(tenantId, asSteps(input.pages));
    const t = await prisma.aacBoardTemplate.create({ data: { tenantId, ...input, pages: json(input.pages), createdByUserId: user.id, createdByName: await staffName(user) } });
    return viewTemplate(t, staffViewer(user), true);
  },
  async edit(user: AuthUser, id: string, input: BoardFields) {
    const t = await editableTemplate(user, id);
    assertNoAudio(input.pages);
    await assertPhotosFitTemplate(t.tenantId, asSteps(input.pages));
    const row = await prisma.aacBoardTemplate.update({ where: { id }, data: { ...input, pages: json(input.pages) } });
    return viewTemplate(row, staffViewer(user), true);
  },
  /** Built-in ones are hidden rather than deleted, so they don't come back. */
  async remove(user: AuthUser, id: string) {
    const t = await editableTemplate(user, id);
    if (t.builtInKey) await prisma.aacBoardTemplate.update({ where: { id }, data: { archived: true } });
    else await prisma.aacBoardTemplate.delete({ where: { id } });
  },
  /** A child's board saved as a centre template. The child's own photos are left out. */
  async fromBoard(user: AuthUser, boardId: string, name?: string) {
    if (!user.tenantId) throw forbidden();
    const board = await staffBoard(user, boardId);
    const pages = board.pages as unknown as Page[];
    const ids = [...new Set(allCells(pages).flatMap((c) => (c.picture?.kind === "photo" ? [c.picture.mediaId] : [])))];
    const keep = new Set((await prisma.mediaAsset.findMany({ where: { id: { in: ids }, kidId: null, tenantId: user.tenantId }, select: { id: true } })).map((a) => a.id));
    let droppedPhotos = 0;
    const cleaned = pages.map((p) => ({
      ...p,
      // The child's voice recordings never go into a template.
      cells: p.cells.map((c) => ({ ...(c.picture?.kind === "photo" && !keep.has(c.picture.mediaId) ? (droppedPhotos++, { ...c, picture: null }) : c), audio: null }))
    }));
    if (!name && !board.name) throw badRequest("Give the template a name");
    const t = await prisma.aacBoardTemplate.create({
      data: { tenantId: user.tenantId, name: name ?? board.name, language: board.language, rows: board.rows, cols: board.cols, homePageId: board.homePageId, pages: json(cleaned), createdByUserId: user.id, createdByName: await staffName(user) }
    });
    return { ...viewTemplate(t, staffViewer(user), true), droppedPhotos };
  }
};
