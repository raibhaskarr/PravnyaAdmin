// Same request()/ApiError shape as the admin frontend's own api/client.ts (same repo, same
// backend's error format: {error: {message, code}}) -- not shared code, this app is built from
// scratch, but there's no reason to invent a different convention for talking to the same API.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:4011" : "");

/** A full URL on the API server, for links the browser opens itself (e.g. the data download). */
export function apiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

/** A progress update a therapist wrote and sent to the parent. */
export type ProgressUpdate = {
  id: string;
  authorName: string;
  centreName: string;
  language: "en" | "hi";
  periodStart: string;
  periodEnd: string;
  body: string;
  sentAt: string;
  readAt: string | null;
};

export type IepPlanGoal = { goalId: string; title: string; area: string; baseline: string; target: string; strategies: string[]; homePractice: string[] };

export type IepPlan = {
  id: string;
  title: string;
  authorName: string;
  centreName: string;
  planStart: string;
  reviewDate: string;
  content: { presentLevels: string; strengths: string[]; goals: IepPlanGoal[]; notes: string };
  sharedAt: string;
  readAt: string | null;
};

/** A picture link from the API: our own (signed) links are relative to the API server. */
export function assetUrl(url: string) {
  return url.startsWith("/") ? apiUrl(url) : url;
}

/** One step of a picture schedule a therapist made. */
export type SchedulePicture = { kind: "symbol"; symbolId: string; url: string } | { kind: "photo"; mediaId: string; url: string };

export type VisualScheduleStep = {
  key: string;
  label: string;
  say: string | null;
  picture: SchedulePicture | null;
  minutes: number | null;
};

export type ScheduleKind = "FIRST_THEN" | "ROUTINE" | "DAY";

export type VisualSchedule = {
  id: string;
  title: string;
  kind: ScheduleKind;
  language: "en" | "hi";
  /** PARENT: made in this app. */
  source: "THERAPIST" | "PARENT";
  /** This parent made it, so they can change everything (otherwise only its time and reminder). */
  mine: boolean;
  authorName: string;
  centreName: string;
  days: string[];
  /** The time set for it ("HH:MM"), or null to learn it from use. */
  time: string | null;
  remind: boolean;
  /** When it's done: the set time, or one learned from when it's usually opened. */
  timing: { time: string | null; days: string[]; source: "set" | "learned" | null };
  forToday: boolean;
  doneToday: boolean;
  startedToday: boolean;
  /** Around its time today, and not done yet: shown first on Home. */
  dueNow: boolean;
  minutesUntil: number | null;
  steps: VisualScheduleStep[];
};

/** What Pravnya drafted from the parent's description, before it's saved. */
export type ScheduleDraft = { title: string; kind: ScheduleKind; language: "en" | "hi"; time: string | null; days: string[]; steps: VisualScheduleStep[] };

export type ScheduleFields = { title: string; kind: ScheduleKind; language: "en" | "hi"; steps: VisualScheduleStep[]; days: string[]; time: string | null; remind: boolean };

export type SymbolResult = { id: string; label: string; url: string };

// ---------- AAC (talking) boards ----------

export type AacWordClass = "pronoun" | "verb" | "describe" | "noun" | "social" | "question" | "misc";
export type AacCell = {
  id: string;
  row: number;
  col: number;
  kind: "word" | "folder";
  label: string;
  say: string | null;
  picture: SchedulePicture | null;
  wordClass: AacWordClass;
  targetPageId: string | null;
  hidden: boolean;
  /** Someone's recording of this word, played instead of the phone's voice. */
  audio: { mediaId: string; url: string } | null;
};
export type AacPage = { id: string; name: string; cells: AacCell[]; rows?: number; cols?: number };
export type AacBoardFields = { name: string; language: "en" | "hi"; rows: number; cols: number; homePageId: string; pages: AacPage[]; coreCells?: AacCell[] };
export type AacBoard = AacBoardFields & { id: string; kidId: string; version: number; updatedByName: string; updatedAt: string; credit: string };
export type AacTemplate = AacBoardFields & { id: string; scope: "PRAVNYA" | "CENTRE"; builtIn: boolean };

/** The API stores pictures by symbol or photo id; links are only for showing them. */
function toApiBoard(b: AacBoardFields): AacBoardFields {
  return {
    name: b.name,
    language: b.language,
    rows: b.rows,
    cols: b.cols,
    homePageId: b.homePageId,
    pages: b.pages.map((p) => ({
      id: p.id,
      name: p.name,
      ...(p.rows !== undefined ? { rows: p.rows } : {}),
      ...(p.cols !== undefined ? { cols: p.cols } : {}),
      cells: p.cells.map((c) => ({ ...c, picture: stripUrl(c as unknown as VisualScheduleStep).picture as SchedulePicture | null, audio: c.audio ? ({ mediaId: c.audio.mediaId } as AacCell["audio"]) : null }))
    })),
    coreCells: (b.coreCells ?? []).map((c) => ({ ...c, picture: stripUrl(c as unknown as VisualScheduleStep).picture as SchedulePicture | null, audio: c.audio ? ({ mediaId: c.audio.mediaId } as AacCell["audio"]) : null }))
  };
}

/** A ready-made schedule from Pravnya or the child's centre, to start from. */
export type ScheduleTemplate = { id: string; scope: "PRAVNYA" | "CENTRE"; title: string; kind: ScheduleKind; language: "en" | "hi"; steps: VisualScheduleStep[]; days: string[]; time: string | null };

/** The API stores a picture by symbol id or photo id; the link is only for showing it. */
function stripUrl(s: VisualScheduleStep) {
  const p = s.picture;
  return { ...s, picture: p ? (p.kind === "symbol" ? { kind: "symbol", symbolId: p.symbolId } : { kind: "photo", mediaId: p.mediaId }) : null };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: { token?: string; method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.message ?? "Something went wrong");
  }
  return data as T;
}

export type ParentProfile = {
  id: string;
  email: string;
  name: string | null;
  /** Set while the account is waiting to be deleted (30 days after the parent asked). */
  scheduledPurgeAt?: string | null;
  kids?: {
    id: string;
    firstName: string;
    lastName: string;
    dob: string | null;
    gender: string | null;
    selfReportedTherapies: string[];
    selfReportedScheduleDays: string[];
  }[];
};

export type IepGoalCandidate = {
  canonicalSkillId: string;
  skillName: string;
  domainName: string;
  measurementType: string | null;
  disciplineId: string | null;
  modality: string | null;
  title: string;
  confidence: number;
  sourceExcerpt: string;
};

export type IepSource = { kind: "pdf"; base64: string } | { kind: "image"; base64: string; mimeType: string };

export type Centre = { id: string; name: string; city: string | null };

export type GoalItemEvidence = {
  id: string;
  logDate: string | null;
  centre: Centre | null;
  outcome: string;
  supportLevel: string;
  modality: string;
  measurementType: string | null;
  measurementValue: number | null;
  measurementUnit: string | null;
  measurementBoolean: boolean | null;
  measurementText: string | null;
};

export type GoalItem = {
  id: string;
  canonicalSkillItemId: string | null;
  canonicalSkillItem: { id: string; displayName: string } | null;
  customText: string | null;
  evidence: GoalItemEvidence[];
};

export type Goal = {
  id: string;
  title: string;
  status: "ACTIVE" | "ACHIEVED" | "DISCONTINUED";
  // null means this goal was never touched by a staff member -- the only way a parent-owned kid
  // gets a goal today is the IEP-accept flow (parentIep.service.ts), which never sets this. Non-
  // null means a therapist/tenant admin created or last edited it on the admin side.
  createdById: string | null;
  canonicalSkill: { id: string; name: string; measurementType: string | null; domain: { id: string; name: string } };
  discipline: { id: string; name: string };
  items: GoalItem[];
};

export type GuideContent = {
  summary: string;
  minutes: number;
  materials: string[];
  steps: { title: string; detail: string }[];
  ifItsHard: string[];
  success: string;
  keepItFun: string[];
  stopIf: string;
};

/** Everything needed to walk a parent through one goal's activity at home. */
export type Walkthrough = {
  goal: { id: string; title: string; skillName: string; area: string };
  item: { goalItemId: string; label: string } | null;
  lastAtCentre: { supportLevel: string; centreName: string | null; date: string } | null;
  fromPlan: { authorName: string; homePractice: string[]; target: string } | null;
  guide: GuideContent;
  /** reviewed by the Pravnya team, drafted by Pravnya and not yet reviewed, or the general steps. */
  guideKind: "reviewed" | "drafted" | "general";
};

export type SessionSchedule = { kind: "once" } | { kind: "weekly"; days: string[]; until: string | null };

/** A guided session a therapist set for the child, as listed for the parent. */
export type HomeSessionSummary = {
  id: string;
  title: string;
  authorName: string;
  centreName: string;
  schedule: SessionSchedule;
  activities: string[];
  dueToday: boolean;
  inProgressRunId: string | null;
  lastRun: { id: string; status: "COMPLETED" | "ENDED_EARLY"; startedAt: string; endedAt: string | null; summary: string | null } | null;
};

/** How one activity is done: Pravnya explains it before the parent and child do it together. */
export type SessionGuide = {
  setup: string;
  say: string;
  countsWhen: string;
  helps: string[];
  ifMiss: string;
  reward: string;
  plan: string;
  moveOn: string;
};

/** own = did it on their own, help = with help, notyet = didn't get it, none = not done. */
export type TryMark = "own" | "help" | "notyet" | "none";
export type SessionReport = { items: { goalItemId: string; tries: TryMark[] }[]; help: string | null };

/** One step of a running session: intro, explain an activity, report how it went, or done. */
export type SessionStep = {
  phase: "intro" | "explain" | "report" | "done";
  activityTitle: string | null;
  activityLabel: string | null;
  /** How the last activity went, said before this step. */
  feedback: string | null;
  item: string | null;
  /** What Pravnya says, in order (read aloud). */
  lines: string[];
  guide: SessionGuide | null;
  report: { items: { goalItemId: string; label: string }[]; triesPerItem: number; helps: { id: string; label: string }[] } | null;
  choices: { id: string; label: string }[];
  progress: { done: number; total: number };
};

/** Practice sessions Pravnya makes on request, from the Activities tab. */
export type PracticeStatus = {
  perDay: number;
  usedToday: number;
  remainingToday: number;
  inProgressRunId: string | null;
  /** False when there's nothing to practise yet (no active goals with items). */
  available: boolean;
  minutes: number | null;
};

export type SessionTurnResult = {
  status: "IN_PROGRESS" | "COMPLETED" | "ENDED_EARLY";
  step: SessionStep;
  reply: string | null;
  logged: { outcome: string; supportLevel: string; itemLabel: string }[];
  summary: string | null;
};

export type CreateEvidenceInput = {
  goalItemId?: string;
  newItemCustomText?: string;
  logDate: string;
  centreId?: string | null;
  outcome: string;
  supportLevel: string;
  modality: string;
  measurementValue?: number | null;
  measurementUnit?: string | null;
  measurementBoolean?: boolean | null;
  measurementText?: string | null;
};

export type EvidenceCandidate = {
  goalId: string;
  goalTitle: string;
  skillName: string;
  domainName: string;
  measurementType: string | null;
  itemHint: string | null;
  outcome: string;
  supportLevel: string;
  modality: string;
  measurementValue: number | null;
  measurementUnit: string | null;
  measurementBoolean: boolean | null;
  measurementText: string | null;
  confidence: number;
  excerpt: string;
};

export type ExtractEvidenceInput = { freeText: string } | { media: { kind: "image" | "audio"; mimeType: string; base64: string } };

export type CompanionMessage = {
  id: string;
  role: "PARENT" | "ASSISTANT";
  content: string;
  createdAt: string;
};

export type CompanionResponse = { intent: "log" } | { intent: "question"; reply: string };

export type LinkedTherapist = {
  id: string;
  name: string;
  disciplineIds: string[];
  status: string;
  tenant: { id: string; name: string };
};

export type TherapistInvitationSummary = {
  id: string;
  email: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  kidId: string | null;
  createdAt: string;
};

export type InviteTherapistResponse =
  | { linked: true; therapist: LinkedTherapist }
  | { linked: false; invitation: TherapistInvitationSummary; inviteUrl?: string };

export type ResendInvitationResponse = { invitation: TherapistInvitationSummary; inviteUrl?: string };

// Same fixed sets as onboarding's ChildTherapies/ChildSchedule steps -- kept in sync by hand, same
// convention as the backend's own parentSchedule.schemas.ts duplicating-not-importing the admin's
// equivalent lists.
export const SCHEDULE_LABELS = ["Speech therapy", "ABA", "Occupational therapy", "Physiotherapy", "Special education", "Other"] as const;
export const SCHEDULE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type ScheduleSlot = {
  id: string;
  label: string;
  dayOfWeek: string;
  startTime: string;
  therapist: { id: string; name: string } | null;
};

export type CreateScheduleSlotInput = {
  label: string;
  dayOfWeek: string;
  startTime: string;
  therapistId?: string;
};

export const api = {
  sendVerificationCode(email: string) {
    return request<{ sent: boolean }>("/parent-auth/send-verification-code", { method: "POST", body: { email } });
  },
  register(input: { email: string; password: string; name: string; verificationCode: string; consent: true }) {
    return request<{ token: string; parent: ParentProfile }>("/parent-auth/register", { method: "POST", body: input });
  },
  login(email: string, password: string) {
    return request<{ token: string; parent: ParentProfile }>("/parent-auth/login", { method: "POST", body: { email, password } });
  },
  requestAccountDeletion(token: string, password: string) {
    return request<{ scheduledPurgeAt: string }>("/parent-account/delete", { token, method: "POST", body: { password } });
  },
  cancelAccountDeletion(token: string) {
    return request<{ cancelled: boolean }>("/parent-account/cancel-deletion", { token, method: "POST" });
  },
  dataExportLink(token: string) {
    return request<{ path: string; expiresInMinutes: number }>("/parent-account/export-link", { token, method: "POST" });
  },
  me(token: string) {
    return request<ParentProfile>("/parent-auth/me", { token });
  },
  createFirstKid(token: string, input: { name: string; dob: string; gender?: string }) {
    return request<{ id: string; firstName: string; lastName: string; dob: string | null; gender: string | null }>("/parent-kids", {
      token,
      method: "POST",
      body: input
    });
  },
  updateKid(token: string, kidId: string, input: { selfReportedTherapies?: string[]; selfReportedScheduleDays?: string[]; gender?: string }) {
    return request<{ id: string; gender: string | null; selfReportedTherapies: string[]; selfReportedScheduleDays: string[] }>(
      `/parent-kids/${kidId}`,
      { token, method: "PATCH", body: input }
    );
  },
  extractIep(token: string, kidId: string, source: IepSource) {
    return request<{ statusUpdates: EvidenceCandidate[]; newGoals: IepGoalCandidate[] } | { error: string }>(`/parent-kids/${kidId}/iep/extract`, {
      token,
      method: "POST",
      body: { source }
    });
  },
  acceptIepGoals(token: string, kidId: string, candidates: IepGoalCandidate[]) {
    return request<{ created: number; skipped: number }>(`/parent-kids/${kidId}/iep/accept-goals`, {
      token,
      method: "POST",
      body: { candidates }
    });
  },
  resetPassword(input: { email: string; verificationCode: string; newPassword: string }) {
    return request<{ token: string; parent: ParentProfile }>("/parent-auth/reset-password", { method: "POST", body: input });
  },
  listGoals(token: string, kidId: string) {
    return request<Goal[]>(`/parent-kids/${kidId}/goals`, { token });
  },
  // Centres -- shared directory, independent of Tenant, same as the admin panel's own
  listCentres(token: string) {
    return request<Centre[]>("/parent-centres", { token });
  },
  createCentre(token: string, input: { name: string; city?: string }) {
    return request<Centre>("/parent-centres", { token, method: "POST", body: input });
  },
  logEvidence(token: string, kidId: string, goalId: string, input: CreateEvidenceInput) {
    return request<GoalItemEvidence & { goalItem: GoalItem }>(`/parent-kids/${kidId}/goals/${goalId}/evidence`, {
      token,
      method: "POST",
      body: input
    });
  },
  extractEvidence(token: string, kidId: string, input: ExtractEvidenceInput) {
    return request<{ candidates: EvidenceCandidate[] } | { error: string }>(`/parent-kids/${kidId}/goals/extract-evidence`, {
      token,
      method: "POST",
      body: input
    });
  },
  listCompanionMessages(token: string, kidId: string) {
    return request<CompanionMessage[]>(`/parent-kids/${kidId}/companion/messages`, { token });
  },
  sendCompanionMessage(token: string, kidId: string, text: string) {
    return request<CompanionResponse>(`/parent-kids/${kidId}/companion/messages`, {
      token,
      method: "POST",
      body: { text }
    });
  },
  listTherapists(token: string, kidId: string) {
    return request<LinkedTherapist[]>(`/parent-kids/${kidId}/therapists`, { token });
  },
  listTherapistInvitations(token: string, kidId: string) {
    return request<TherapistInvitationSummary[]>(`/parent-kids/${kidId}/therapist-invitations`, { token });
  },
  inviteTherapist(token: string, kidId: string, email: string) {
    return request<InviteTherapistResponse>(`/parent-kids/${kidId}/therapist-invitations`, {
      token,
      method: "POST",
      body: { email }
    });
  },
  revokeTherapistInvitation(token: string, kidId: string, invitationId: string) {
    return request<TherapistInvitationSummary>(`/parent-kids/${kidId}/therapist-invitations/${invitationId}`, {
      token,
      method: "DELETE"
    });
  },
  resendTherapistInvitation(token: string, kidId: string, invitationId: string) {
    return request<ResendInvitationResponse>(`/parent-kids/${kidId}/therapist-invitations/${invitationId}/resend`, {
      token,
      method: "POST"
    });
  },
  unlinkTherapist(token: string, kidId: string, therapistId: string) {
    return request<void>(`/parent-kids/${kidId}/therapists/${therapistId}`, { token, method: "DELETE" });
  },
  listUpdates(token: string, kidId: string) {
    return request<ProgressUpdate[]>(`/parent-kids/${kidId}/updates`, { token });
  },
  markUpdateRead(token: string, kidId: string, updateId: string) {
    return request<ProgressUpdate>(`/parent-kids/${kidId}/updates/${updateId}/read`, { token, method: "POST" });
  },
  listVisualSchedules(token: string, kidId: string) {
    return request<{ credit: string; schedules: VisualSchedule[] }>(`/parent-kids/${kidId}/visual-schedules`, { token });
  },
  draftVisualSchedule(token: string, kidId: string, body: { text?: string; audio?: { mimeType: string; base64: string }; kind: ScheduleKind | null; language: "en" | "hi" }) {
    return request<ScheduleDraft>(`/parent-kids/${kidId}/visual-schedules/draft`, { token, method: "POST", body });
  },
  getAacBoard(token: string, kidId: string) {
    return request<{ board: AacBoard | null }>(`/parent-kids/${kidId}/aac-board`, { token });
  },
  createAacBoard(token: string, kidId: string, board: AacBoardFields) {
    return request<AacBoard>(`/parent-kids/${kidId}/aac-board`, { token, method: "POST", body: toApiBoard(board) });
  },
  saveAacBoard(token: string, kidId: string, id: string, board: AacBoardFields, version: number) {
    return request<AacBoard>(`/parent-kids/${kidId}/aac-board/${id}`, { token, method: "PUT", body: { ...toApiBoard(board), version } });
  },
  deleteAacBoard(token: string, kidId: string, id: string) {
    return request<void>(`/parent-kids/${kidId}/aac-board/${id}`, { token, method: "DELETE" });
  },
  /** Send a batch of taps from the talking screen. The server drops ones whose cell no longer exists. */
  sendAacTaps(token: string, kidId: string, taps: { cellId: string; pageId: string; label: string; wordClass: string; kind: "word" | "folder"; at: string }[]) {
    return request<{ saved: number }>(`/parent-kids/${kidId}/aac-board/taps`, { token, method: "POST", body: { taps } });
  },
  /** Weekly stats for the parent (last 7 days, top 10 words). Null when there's no board yet. */
  getAacStats(token: string, kidId: string) {
    return request<{ stats: { perDay: { date: string; words: number }[]; totals: { words: number; activeDays: number; windowDays: number }; topWords: { label: string; count: number; lastAt: string }[] } | null }>(`/parent-kids/${kidId}/aac-board/stats`, { token });
  },
  uploadAudio(token: string, kidId: string, base64: string) {
    return request<{ id: string; url: string }>(`/parent-kids/${kidId}/media/audio`, { token, method: "POST", body: { base64 } });
  },
  listAacTemplates(token: string, kidId: string, language: "en" | "hi") {
    return request<AacTemplate[]>(`/parent-kids/${kidId}/aac-templates?language=${language}`, { token });
  },
  listScheduleTemplates(token: string, kidId: string, language: "en" | "hi") {
    return request<ScheduleTemplate[]>(`/parent-kids/${kidId}/schedule-templates?language=${language}`, { token });
  },
  createVisualSchedule(token: string, kidId: string, body: ScheduleFields) {
    return request<VisualSchedule>(`/parent-kids/${kidId}/visual-schedules`, { token, method: "POST", body: { ...body, steps: body.steps.map(stripUrl) } });
  },
  editVisualSchedule(token: string, kidId: string, id: string, body: Partial<ScheduleFields>) {
    return request<VisualSchedule>(`/parent-kids/${kidId}/visual-schedules/${id}`, { token, method: "PATCH", body: { ...body, steps: body.steps?.map(stripUrl) } });
  },
  deleteVisualSchedule(token: string, kidId: string, id: string) {
    return request<void>(`/parent-kids/${kidId}/visual-schedules/${id}`, { token, method: "DELETE" });
  },
  recordScheduleUse(token: string, kidId: string, id: string, event: "start" | "complete") {
    return request<{ ok: true }>(`/parent-kids/${kidId}/visual-schedules/${id}/uses`, { token, method: "POST", body: { event } });
  },
  searchSymbols(token: string, kidId: string, q: string) {
    return request<{ credit: string; symbols: SymbolResult[] }>(`/parent-kids/${kidId}/symbols?q=${encodeURIComponent(q)}`, { token });
  },
  uploadPicture(token: string, kidId: string, base64: string) {
    return request<{ id: string; url: string }>(`/parent-kids/${kidId}/media`, { token, method: "POST", body: { base64 } });
  },
  pushKey(token: string) {
    return request<{ publicKey: string | null }>("/parent-push", { token });
  },
  pushSubscribe(token: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return request<void>("/parent-push/subscriptions", { token, method: "POST", body: sub });
  },
  listSessions(token: string, kidId: string) {
    return request<HomeSessionSummary[]>(`/parent-kids/${kidId}/sessions`, { token });
  },
  startSession(token: string, kidId: string, sessionId: string) {
    return request<{ runId: string; title: string; step: SessionStep; resumed: boolean }>(`/parent-kids/${kidId}/sessions/${sessionId}/start`, { token, method: "POST" });
  },
  getPracticeStatus(token: string, kidId: string) {
    return request<PracticeStatus>(`/parent-kids/${kidId}/practice`, { token });
  },
  startPractice(token: string, kidId: string, language: "en" | "hi") {
    return request<{ runId: string; title: string; step: SessionStep; resumed: boolean }>(`/parent-kids/${kidId}/practice/start`, { token, method: "POST", body: { language } });
  },
  sessionTurn(token: string, kidId: string, runId: string, input: { choice: string } | { text: string } | { audio: { mimeType: string; base64: string } } | { report: SessionReport }) {
    return request<SessionTurnResult>(`/parent-kids/${kidId}/session-runs/${runId}/turn`, { token, method: "POST", body: input });
  },
  /** "Ball 2 of 3, cup with help" -> a filled-in report to check. Nothing is saved. */
  sessionReportDraft(token: string, kidId: string, runId: string, input: { text: string } | { audio: { mimeType: string; base64: string } }) {
    return request<{ report: SessionReport | null; reply: string }>(`/parent-kids/${kidId}/session-runs/${runId}/report-draft`, { token, method: "POST", body: input });
  },
  /** Where a run is now (after a call, to carry on with the screens). */
  getSessionRun(token: string, kidId: string, runId: string) {
    return request<{ runId: string; status: "IN_PROGRESS" | "COMPLETED" | "ENDED_EARLY"; step: SessionStep; summary: string | null }>(`/parent-kids/${kidId}/session-runs/${runId}`, { token });
  },
  /** A short-lived token for a hands-free call with Pravnya (Gemini Live), locked to this session. */
  startCall(token: string, kidId: string, runId: string) {
    return request<{ token: string; model: string; apiVersion: string; expiresAt: string; step: SessionStep }>(`/parent-kids/${kidId}/session-runs/${runId}/call`, { token, method: "POST" });
  },
  endSession(token: string, kidId: string, runId: string) {
    return request<{ status: string; summary: string | null }>(`/parent-kids/${kidId}/session-runs/${runId}/end`, { token, method: "POST" });
  },
  getWalkthrough(token: string, kidId: string, goalId: string) {
    return request<Walkthrough>(`/parent-kids/${kidId}/goals/${goalId}/walkthrough`, { token });
  },
  listIepPlans(token: string, kidId: string) {
    return request<IepPlan[]>(`/parent-kids/${kidId}/iep-plans`, { token });
  },
  markIepPlanRead(token: string, kidId: string, planId: string) {
    return request<IepPlan>(`/parent-kids/${kidId}/iep-plans/${planId}/read`, { token, method: "POST" });
  },
  listSchedule(token: string, kidId: string) {
    return request<ScheduleSlot[]>(`/parent-kids/${kidId}/schedule`, { token });
  },
  createScheduleSlot(token: string, kidId: string, input: CreateScheduleSlotInput) {
    return request<ScheduleSlot>(`/parent-kids/${kidId}/schedule`, { token, method: "POST", body: input });
  },
  updateScheduleSlot(token: string, kidId: string, slotId: string, input: CreateScheduleSlotInput) {
    return request<ScheduleSlot>(`/parent-kids/${kidId}/schedule/${slotId}`, { token, method: "PATCH", body: input });
  },
  deleteScheduleSlot(token: string, kidId: string, slotId: string) {
    return request<void>(`/parent-kids/${kidId}/schedule/${slotId}`, { token, method: "DELETE" });
  }
};
