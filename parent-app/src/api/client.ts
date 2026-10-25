// Same request()/ApiError shape as the admin frontend's own api/client.ts (same repo, same
// backend's error format: {error: {message, code}}) -- not shared code, this app is built from
// scratch, but there's no reason to invent a different convention for talking to the same API.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:4011" : "");

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

export type GoalItemEvidence = {
  id: string;
  logDate: string | null;
  centreName: string | null;
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

export type CreateEvidenceInput = {
  goalItemId?: string;
  newItemCustomText?: string;
  logDate: string;
  centreName?: string | null;
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
    return request<{ statusUpdates: unknown[]; newGoals: IepGoalCandidate[] } | { error: string }>(`/parent-kids/${kidId}/iep/extract`, {
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
  listSchedule(token: string, kidId: string) {
    return request<ScheduleSlot[]>(`/parent-kids/${kidId}/schedule`, { token });
  },
  createScheduleSlot(token: string, kidId: string, input: CreateScheduleSlotInput) {
    return request<ScheduleSlot>(`/parent-kids/${kidId}/schedule`, { token, method: "POST", body: input });
  },
  deleteScheduleSlot(token: string, kidId: string, slotId: string) {
    return request<void>(`/parent-kids/${kidId}/schedule/${slotId}`, { token, method: "DELETE" });
  }
};
