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

export type PocEvidenceOutcome = "CORRECT" | "INCORRECT" | "PARTIAL" | "ATTEMPTED" | "NOT_OBSERVED" | "UNKNOWN";
export type PocSupportLevel =
  | "INDEPENDENT"
  | "VISUAL_PROMPT"
  | "VERBAL_PROMPT"
  | "GESTURAL_PROMPT"
  | "PHYSICAL_PROMPT"
  | "PARTIAL_ASSISTANCE"
  | "FULL_ASSISTANCE"
  | "UNKNOWN";
export type PocGoalTagStatus = "TAGGED" | "NO_MATCH" | "ERROR";

export type PocSkillRef = { id: string; name: string; domain: { name: string } };

export type PocReviewChild = {
  id: string;
  label: string;
  sourceChildId: string;
  _count?: { goalTags: number; logEvidence: number };
};

export type PocGoalTag = {
  id: string;
  goalTitle: string;
  originalDomainName: string | null;
  originalCategory: string | null;
  predictedSkill: PocSkillRef | null;
  confidence: number | null;
  rationale: string | null;
  status: PocGoalTagStatus;
  modelProvider: string;
  modelName: string;
};

export type PocLogEvidenceRow = {
  id: string;
  logDate: string | null;
  predictedSkill: PocSkillRef | null;
  itemHint: string | null;
  outcome: PocEvidenceOutcome;
  supportLevel: PocSupportLevel;
  confidence: number | null;
  modelProvider: string;
  modelName: string;
};

export type PocReviewChildDetail = PocReviewChild & {
  goalTags: PocGoalTag[];
  logEvidence: PocLogEvidenceRow[];
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
