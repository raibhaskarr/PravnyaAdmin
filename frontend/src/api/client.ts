import type {
  AuditLogEntry,
  AuthUser,
  CanonicalDiscipline,
  CanonicalDomain,
  CanonicalSkill,
  CanonicalSkillDetail,
  DbModel,
  DocSection,
  EvidenceCandidate,
  Goal,
  GoalItemEvidenceRow,
  ParentSummary,
  GoalItemInput,
  GoalSkillSuggestionResponse,
  IepGoalCandidate,
  InvitationPreview,
  Kid,
  Modality,
  Parent,
  ScheduleEntry,
  StaffCompanionMessage,
  PocEvidenceOutcome,
  PocModality,
  PocReviewChild,
  PocReviewChildDetail,
  PocReviewFlags,
  PocSupportLevel,
  SuperadminInvitation,
  SuperadminInvitationPreview,
  SuperadminUser,
  Tenant,
  TenantDiscipline,
  TenantHealth,
  TenantInvitation,
  TenantInvitationPreview,
  TenantKycFields,
  TenantProfileFields,
  Therapist,
  TherapistInvitation,
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
  listTenantHealth(token: string) {
    return request<TenantHealth[]>("/tenants/health", { token });
  },
  listTenantAuditLog(token: string, tenantId: string) {
    return request<AuditLogEntry[]>(`/tenants/${tenantId}/audit-log`, { token });
  },
  updateTenant(token: string, tenantId: string, input: { name?: string; status?: "ACTIVE" | "SUSPENDED" }) {
    return request<Tenant>(`/tenants/${tenantId}`, { token, method: "PATCH", body: input });
  },
  getTenant(token: string, tenantId: string) {
    return request<Tenant>(`/tenants/${tenantId}`, { token });
  },
  updateTenantProfile(token: string, tenantId: string, input: Partial<TenantProfileFields & TenantKycFields>) {
    return request<Tenant>(`/tenants/${tenantId}/profile`, { token, method: "PATCH", body: input });
  },

  // Tenant admin's own tenant profile (self-service -- no KYC fields, see backend schema split)
  getOwnTenantProfile(token: string) {
    return request<Tenant>("/tenants/me/profile", { token });
  },
  updateOwnTenantProfile(token: string, input: Partial<TenantProfileFields>) {
    return request<Tenant>("/tenants/me/profile", { token, method: "PATCH", body: input });
  },
  getOwnTenantHealth(token: string) {
    return request<TenantHealth>("/tenants/me/health", { token });
  },
  listOwnTenantAuditLog(token: string) {
    return request<AuditLogEntry[]>("/tenants/me/audit-log", { token });
  },

  // Tenant invitations (superadmin invites, invitee sets their own password and later fills in
  // the business/KYC profile themselves via updateOwnTenantProfile)
  listTenantInvitations(token: string) {
    return request<TenantInvitation[]>("/tenant-invitations", { token });
  },
  inviteTenant(token: string, input: { name: string; slug: string; email: string }) {
    return request<{ invitation: TenantInvitation; signupUrl?: string }>("/tenant-invitations", { token, method: "POST", body: input });
  },
  revokeTenantInvitation(token: string, invitationId: string) {
    return request(`/tenant-invitations/${invitationId}`, { token, method: "DELETE" });
  },
  previewTenantSignup(inviteToken: string) {
    return request<TenantInvitationPreview>(`/tenant-signup/${inviteToken}`);
  },
  acceptTenantSignup(inviteToken: string, input: { adminName: string; password: string }) {
    return request<{ token: string; user: AuthUser }>(`/tenant-signup/${inviteToken}/accept`, { method: "POST", body: input });
  },

  // Superadmin invitations (same pattern as tenant invitations: invitee sets their own password)
  listSuperadmins(token: string) {
    return request<SuperadminUser[]>("/superadmin-invitations/users", { token });
  },
  listSuperadminInvitations(token: string) {
    return request<SuperadminInvitation[]>("/superadmin-invitations", { token });
  },
  inviteSuperadmin(token: string, input: { email: string }) {
    return request<{ invitation: SuperadminInvitation; signupUrl?: string }>("/superadmin-invitations", { token, method: "POST", body: input });
  },
  revokeSuperadminInvitation(token: string, invitationId: string) {
    return request(`/superadmin-invitations/${invitationId}`, { token, method: "DELETE" });
  },
  previewSuperadminSignup(inviteToken: string) {
    return request<SuperadminInvitationPreview>(`/superadmin-signup/${inviteToken}`);
  },
  acceptSuperadminSignup(inviteToken: string, input: { name: string; password: string }) {
    return request<{ token: string; user: AuthUser }>(`/superadmin-signup/${inviteToken}/accept`, { method: "POST", body: input });
  },

  // Account (any authenticated role)
  changePassword(token: string, input: { currentPassword: string; newPassword: string }) {
    return request<void>("/auth/password", { token, method: "PATCH", body: input });
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

  // Tenant disciplines. Pass kidId when populating a discipline picker for a specific kid (e.g.
  // creating a goal) -- a guest therapist from another tenant needs the KID's enabled disciplines,
  // not their own. Omit it for the tenant's own settings page.
  listTenantDisciplines(token: string, kidId?: string) {
    return request<TenantDiscipline[]>(`/tenant-disciplines${kidId ? `?kidId=${kidId}` : ""}`, { token });
  },
  // Full canonical discipline list, tenant-independent -- used for a therapist's own "qualified
  // in" picker (what they're credentialed in, not what this tenant happens to have enabled).
  listCanonicalDisciplines(token: string) {
    return request<CanonicalDiscipline[]>("/taxonomy/disciplines", { token });
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
  getTherapist(token: string, therapistId: string) {
    return request<Therapist>(`/therapists/${therapistId}`, { token });
  },
  updateTherapist(token: string, therapistId: string, input: { name?: string; phone?: string; disciplineIds?: string[]; status?: "ACTIVE" | "DEACTIVATED" }) {
    return request<Therapist>(`/therapists/${therapistId}`, { token, method: "PATCH", body: input });
  },
  setTherapistKids(token: string, therapistId: string, kidIds: string[]) {
    return request<void>(`/therapists/${therapistId}/kids`, { token, method: "PATCH", body: { kidIds } });
  },

  // Self-service professional profile -- the therapist's own, not the Tenant Admin's edit above.
  getOwnTherapist(token: string) {
    return request<Therapist>("/therapists/me", { token });
  },
  updateOwnTherapist(
    token: string,
    input: { dob?: string | null; gender?: string | null; bio?: string | null; yearsOfExperience?: number | null; qualifiedDisciplineIds?: string[] }
  ) {
    return request<Therapist>("/therapists/me", { token, method: "PATCH", body: input });
  },

  // Therapist invitations
  listTherapistInvitations(token: string) {
    return request<TherapistInvitation[]>("/therapist-invitations", { token });
  },
  inviteTherapist(token: string, input: { email: string; name: string; phone?: string; disciplineIds: string[] }) {
    return request<{ invitation: TherapistInvitation; inviteUrl?: string }>("/therapist-invitations", { token, method: "POST", body: input });
  },
  inviteTherapistForKid(token: string, kidId: string, email: string, disciplineIds: string[]) {
    return request<{ linked: true; therapist: Therapist } | { linked: false; invitation: TherapistInvitation; inviteUrl?: string }>(
      "/therapist-invitations/for-kid",
      { token, method: "POST", body: { kidId, email, disciplineIds } }
    );
  },
  revokeTherapistInvitation(token: string, invitationId: string) {
    return request(`/therapist-invitations/${invitationId}`, { token, method: "DELETE" });
  },
  previewInvitation(inviteToken: string) {
    return request<InvitationPreview>(`/invitations/${inviteToken}`);
  },
  acceptInvitation(inviteToken: string, input: { name: string; phone?: string; password: string }) {
    return request<{ token: string; user: AuthUser }>(`/invitations/${inviteToken}/accept`, { method: "POST", body: input });
  },

  // Kids
  listKids(token: string) {
    return request<Kid[]>("/kids", { token });
  },
  createKid(
    token: string,
    input: {
      firstName: string;
      lastName: string;
      dob?: string;
      gender?: string;
      therapistIds: string[];
      parentEmail?: string;
      parentMobile?: string;
      fatherName?: string;
      motherName?: string;
      addressLine1?: string;
      city?: string;
    }
  ) {
    return request<Kid>("/kids", { token, method: "POST", body: input });
  },
  updateKid(
    token: string,
    kidId: string,
    input: {
      firstName?: string;
      lastName?: string;
      dob?: string | null;
      gender?: string | null;
      therapistIds?: string[];
      status?: "ACTIVE" | "ARCHIVED";
      parentEmail?: string;
    }
  ) {
    return request<Kid>(`/kids/${kidId}`, { token, method: "PATCH", body: input });
  },

  // Parents -- adding a kid under one (with or without a first kid attached) still goes through
  // createKid above; createParent below is for "Add parent" with no kid at all.
  listParents(token: string) {
    return request<ParentSummary[]>("/parents", { token });
  },
  getParent(token: string, parentId: string) {
    return request<{ parent: Parent; kids: Kid[] }>(`/parents/${parentId}`, { token });
  },
  createParent(
    token: string,
    input: { parentEmail: string; parentMobile: string; fatherName?: string; motherName?: string; addressLine1?: string; city?: string }
  ) {
    return request<Parent>("/parents", { token, method: "POST", body: input });
  },

  // Goals
  listGoals(token: string, kidId?: string) {
    return request<Goal[]>(`/goals${kidId ? `?kidId=${kidId}` : ""}`, { token });
  },

  // Schedule / Companion -- read-only staff views of parent-app data
  listKidSchedule(token: string, kidId: string) {
    return request<ScheduleEntry[]>(`/schedule?kidId=${kidId}`, { token });
  },
  listKidCompanionMessages(token: string, kidId: string) {
    return request<StaffCompanionMessage[]>(`/companion-messages?kidId=${kidId}`, { token });
  },
  createGoal(
    token: string,
    input: {
      kidId: string;
      canonicalSkillId: string;
      disciplineId: string;
      modality: Modality;
      title: string;
      notes?: string;
      centreName?: string;
      confidence?: number;
      rationale?: string;
      items?: GoalItemInput[];
    }
  ) {
    return request<Goal>("/goals", { token, method: "POST", body: input });
  },
  updateGoal(
    token: string,
    goalId: string,
    input: {
      canonicalSkillId?: string;
      disciplineId?: string;
      modality?: Modality;
      title?: string;
      status?: "ACTIVE" | "ACHIEVED" | "DISCONTINUED";
      notes?: string | null;
      centreName?: string | null;
      confidence?: number | null;
      rationale?: string | null;
      items?: GoalItemInput[];
    }
  ) {
    return request<Goal>(`/goals/${goalId}`, { token, method: "PATCH", body: input });
  },
  suggestGoalSkill(token: string, kidId: string, title: string) {
    return request<GoalSkillSuggestionResponse>("/ai/suggest-goal-skill", { token, method: "POST", body: { kidId, title } });
  },
  extractIepGoals(
    token: string,
    kidId: string,
    source: { kind: "pdf"; base64: string } | { kind: "image"; base64: string; mimeType: string } | { kind: "csv"; csvText: string }
  ) {
    return request<{ statusUpdates: EvidenceCandidate[]; newGoals: IepGoalCandidate[] } | { error: string }>("/iep/extract", { token, method: "POST", body: { kidId, source } });
  },
  extractEvidence(token: string, kidId: string, input: { freeText: string } | { media: { kind: "image" | "audio"; mimeType: string; base64: string } }) {
    return request<{ candidates: EvidenceCandidate[] } | { error: string }>("/ai/extract-evidence", { token, method: "POST", body: { kidId, ...input } });
  },
  logEvidence(
    token: string,
    goalId: string,
    input: {
      goalItemId?: string;
      newItemCustomText?: string;
      logDate: string;
      centreName?: string | null;
      outcome: PocEvidenceOutcome;
      supportLevel: PocSupportLevel;
      modality: PocModality;
      measurementValue?: number | null;
      measurementUnit?: string | null;
      measurementBoolean?: boolean | null;
      measurementText?: string | null;
    }
  ) {
    return request<GoalItemEvidenceRow & { goalItem: { id: string; customText: string | null; canonicalSkillItem: { id: string; displayName: string } | null } }>(
      `/goals/${goalId}/evidence`,
      { token, method: "POST", body: input }
    );
  },
  updateEvidenceCentre(token: string, goalId: string, evidenceId: string, centreName: string | null) {
    return request<GoalItemEvidenceRow & { goalItem: { id: string; customText: string | null; canonicalSkillItem: { id: string; displayName: string } | null } }>(
      `/goals/${goalId}/evidence/${evidenceId}`,
      { token, method: "PATCH", body: { centreName } }
    );
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
      resolvedSourceGoalId: string | null;
      resolvedSource: string;
      note?: string | null;
    }
  ) {
    return request<void>(`/poc-review/children/${childId}/review-flags/resolve`, { token, method: "POST", body });
  }
};

export type { UserRole };
export { ApiError };
