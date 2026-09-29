export type UserRole = "SUPERADMIN" | "TENANT_ADMIN" | "THERAPIST" | "VIEWER";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string | null;
};

export type DocSection = {
  slug: string;
  title: string;
  content: string;
};

export type DbField = {
  name: string;
  type: string;
  kind: string;
  isRequired: boolean;
  isId: boolean;
  isUnique: boolean;
  isRelation: boolean;
  relationFromFields?: string[];
  documentation: string | null;
};

export type DbModel = {
  name: string;
  documentation: string | null;
  fields: DbField[];
};

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
};

export type CanonicalDiscipline = {
  id: string;
  key: string;
  name: string;
};

export type TenantDiscipline = CanonicalDiscipline & { enabled: boolean };

export type CanonicalDomain = {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  _count?: { skills: number };
};

export type CanonicalSkill = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  domainId: string;
  domain?: CanonicalDomain;
  defaultDisciplineId: string | null;
  defaultDiscipline?: CanonicalDiscipline;
  supportsItems: boolean;
  supportedModalities: Modality[];
  sourceTag: "PROD" | "FRAMEWORK";
  _count?: { items: number };
};

export type CanonicalSkillItem = {
  id: string;
  key: string;
  displayName: string;
  semanticGroup: string;
};

export type CanonicalSkillDetail = CanonicalSkill & { items: CanonicalSkillItem[] };

export type Therapist = {
  id: string;
  tenantId: string;
  name: string;
  disciplineIds: string[];
  user: { email: string; name: string };
};

export type Kid = {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  dob: string | null;
  status: "ACTIVE" | "ARCHIVED";
  therapists: { therapist: { id: string; name: string } }[];
};

export type Modality = "VERBAL" | "MANUAL_SIGN" | "AAC" | "WRITTEN" | "GESTURAL";

export type GoalItem = {
  id: string;
  canonicalSkillItemId: string | null;
  canonicalSkillItem: { id: string; displayName: string } | null;
  customText: string | null;
};

export type GoalItemInput = { canonicalSkillItemId?: string; customText?: string };

export type GoalSkillSuggestion = {
  domainId: string;
  canonicalSkillId: string;
  disciplineId: string | null;
  modality: Modality | null;
  rationale: string;
};

export type GoalSkillSuggestionResponse = {
  suggestion: GoalSkillSuggestion | null;
  reason?: string;
};

export type Goal = {
  id: string;
  tenantId: string;
  kidId: string;
  kid: { id: string; firstName: string; lastName: string };
  canonicalSkillId: string;
  canonicalSkill: { id: string; name: string };
  disciplineId: string;
  discipline: { id: string; name: string };
  modality: Modality;
  title: string;
  status: "ACTIVE" | "ACHIEVED" | "DISCONTINUED";
  notes: string | null;
  items: GoalItem[];
};
