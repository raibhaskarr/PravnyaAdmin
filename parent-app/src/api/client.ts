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
  }
};
