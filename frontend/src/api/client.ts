import type {
  AuthUser,
  CanonicalDomain,
  CanonicalSkill,
  CanonicalSkillDetail,
  DbModel,
  DocSection,
  Goal,
  GoalItemInput,
  GoalSkillSuggestionResponse,
  Kid,
  Modality,
  PocReviewChild,
  PocReviewChildDetail,
  PocReviewFlags,
  Tenant,
  TenantDiscipline,
  Therapist,
  UserRole
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:4011" : "");

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
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

export const api = {
  login(email: string, password: string) {
    return request<{ token: string; user: AuthUser }>("/auth/login", { method: "POST", body: { email, password } });
  },

  // Tenants (superadmin)
  listTenants(token: string) {
    return request<Tenant[]>("/tenants", { token });
  },
  createTenant(token: string, input: { name: string; slug: string; adminEmail: string; adminName: string }) {
    return request<{ tenant: Tenant; adminEmail: string; tempPassword: string }>("/tenants", { token, method: "POST", body: input });
  },
  updateTenant(token: string, tenantId: string, input: { name?: string; status?: "ACTIVE" | "SUSPENDED" }) {
    return request<Tenant>(`/tenants/${tenantId}`, { token, method: "PATCH", body: input });
  },

  // Taxonomy (read: any role; write: superadmin)
  listDomains(token: string) {
    return request<CanonicalDomain[]>("/taxonomy/domains", { token });
  },
  listSkills(token: string, domainId?: string) {
    return request<CanonicalSkill[]>(`/taxonomy/skills${domainId ? `?domainId=${domainId}` : ""}`, { token });
  },
  getSkill(token: string, skillId: string) {
    return request<CanonicalSkillDetail>(`/taxonomy/skills/${skillId}`, { token });
  },
  createSkill(token: string, input: { domainId: string; key: string; name: string; supportsItems: boolean; sourceTag: "PROD" | "FRAMEWORK" }) {
    return request<CanonicalSkill>("/taxonomy/skills", { token, method: "POST", body: input });
  },
  createItem(token: string, skillId: string, input: { key: string; displayName: string; semanticGroup: string }) {
    return request(`/taxonomy/skills/${skillId}/items`, { token, method: "POST", body: input });
  },
  deleteItem(token: string, itemId: string) {
    return request(`/taxonomy/items/${itemId}`, { token, method: "DELETE" });
  },

  // Tenant disciplines
  listTenantDisciplines(token: string) {
    return request<TenantDiscipline[]>("/tenant-disciplines", { token });
  },
  enableDiscipline(token: string, disciplineId: string) {
    return request(`/tenant-disciplines/${disciplineId}/enable`, { token, method: "POST" });
  },
  disableDiscipline(token: string, disciplineId: string) {
    return request(`/tenant-disciplines/${disciplineId}/disable`, { token, method: "POST" });
  },

  // Therapists
  listTherapists(token: string) {
    return request<Therapist[]>("/therapists", { token });
  },
  createTherapist(token: string, input: { email: string; name: string; disciplineIds: string[] }) {
    return request<{ therapist: Therapist; tempPassword: string }>("/therapists", { token, method: "POST", body: input });
  },

  // Kids
  listKids(token: string) {
    return request<Kid[]>("/kids", { token });
  },
  createKid(token: string, input: { firstName: string; lastName: string; therapistIds: string[] }) {
    return request<Kid>("/kids", { token, method: "POST", body: input });
  },

  // Goals
  listGoals(token: string, kidId?: string) {
    return request<Goal[]>(`/goals${kidId ? `?kidId=${kidId}` : ""}`, { token });
  },
  createGoal(
    token: string,
    input: {
      kidId: string;
      canonicalSkillId: string;
      disciplineId: string;
      modality: Modality;
      title: string;
      items?: GoalItemInput[];
    }
  ) {
    return request<Goal>("/goals", { token, method: "POST", body: input });
  },
  suggestGoalSkill(token: string, title: string) {
    return request<GoalSkillSuggestionResponse>("/ai/suggest-goal-skill", { token, method: "POST", body: { title } });
  },

  // Manual
  listManualDocs(token: string) {
    return request<DocSection[]>("/manual/docs", { token });
  },
  getDbStructure(token: string) {
    return request<DbModel[]>("/manual/db-structure", { token });
  },

  // AI tagging POC review (superadmin)
  listPocReviewChildren(token: string) {
    return request<PocReviewChild[]>("/poc-review/children", { token });
  },
  getPocReviewChild(token: string, childId: string) {
    return request<PocReviewChildDetail>(`/poc-review/children/${childId}`, { token });
  },
  getPocReviewFlags(token: string, childId: string) {
    return request<PocReviewFlags>(`/poc-review/children/${childId}/review-flags`, { token });
  },
  resolvePocReviewFlag(
    token: string,
    childId: string,
    body: {
      kind: "GOAL_DISAGREEMENT" | "EVIDENCE_WITHOUT_GOAL";
      sourceGoalId: string | null;
      canonicalSkillId: string | null;
      resolvedSkillId: string | null;
      resolvedSource: string;
      note?: string | null;
    }
  ) {
    return request<void>(`/poc-review/children/${childId}/review-flags/resolve`, { token, method: "POST", body });
  }
};

export type { UserRole };
export { ApiError };
