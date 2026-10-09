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

export type TenantKycStatus = "PENDING" | "VERIFIED" | "REJECTED";

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED";
  leadOwnerName: string | null;
  leadOwnerEmail: string | null;
  leadOwnerPhone: string | null;
  phone: string | null;
  website: string | null;
  socialLinks: Record<string, string> | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  logoUrl: string | null;
  kycStatus: TenantKycStatus;
  kycNotes: string | null;
  kycReviewedAt: string | null;
  createdAt: string;
};

export type TenantProfileFields = Pick<
  Tenant,
  | "leadOwnerName"
  | "leadOwnerEmail"
  | "leadOwnerPhone"
  | "phone"
  | "website"
  | "socialLinks"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "state"
  | "country"
  | "pincode"
  | "logoUrl"
>;

export type TenantKycFields = Pick<Tenant, "kycStatus" | "kycNotes">;

export type TenantInvitation = {
  id: string;
  name: string;
  slug: string;
  email: string;
  status: TherapistInvitationStatus;
  expiresAt: string;
  createdAt: string;
};

export type TenantInvitationPreview = {
  name: string;
  slug: string;
  email: string;
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

export type TherapistInvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export type TherapistInvitation = {
  id: string;
  email: string;
  name: string | null;
  status: TherapistInvitationStatus;
  kid: { id: string; firstName: string; lastName: string } | null;
  expiresAt: string;
  createdAt: string;
};

export type InvitationPreview = {
  email: string;
  name: string | null;
  tenantName: string;
  kidName: string | null;
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

export type GoalItemEvidenceRow = {
  id: string;
  logDate: string | null;
  centreName: string | null;
  outcome: PocEvidenceOutcome;
  supportLevel: PocSupportLevel;
  modality: PocModality;
  measurementType: PocMeasurementType | null;
  measurementValue: number | null;
  measurementUnit: string | null;
  measurementBoolean: boolean | null;
  measurementText: string | null;
  confidence: number | null;
};

export type GoalItem = {
  id: string;
  canonicalSkillItemId: string | null;
  canonicalSkillItem: { id: string; displayName: string } | null;
  customText: string | null;
  evidence: GoalItemEvidenceRow[];
};

export type GoalItemInput = { canonicalSkillItemId?: string; customText?: string };

export type EvidenceCandidate = {
  goalId: string;
  goalTitle: string;
  skillName: string;
  measurementType: PocMeasurementType | null;
  itemHint: string | null;
  outcome: PocEvidenceOutcome;
  supportLevel: PocSupportLevel;
  modality: PocModality;
  measurementValue: number | null;
  measurementUnit: string | null;
  measurementBoolean: boolean | null;
  measurementText: string | null;
  confidence: number;
  excerpt: string;
};

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
export type PocModality = "VERBAL" | "MANUAL_SIGN" | "AAC" | "WRITTEN" | "GESTURAL" | "UNKNOWN" | "NOT_APPLICABLE";
export type PocMeasurementType = "TRIALS" | "FREQUENCY" | "DURATION" | "PERCENTAGE" | "PROMPT_LEVEL" | "YES_NO" | "RATING" | "FREE_OBSERVATION";

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
  centreName: string | null;
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
  centreName: string | null;
  predictedSkill: PocSkillRef | null;
  itemHint: string | null;
  predictedItem: { id: string; displayName: string } | null;
  itemMatchScore: number | null;
  itemMatchMethod: string | null;
  outcome: PocEvidenceOutcome;
  supportLevel: PocSupportLevel;
  modality: PocModality;
  measurementType: PocMeasurementType | null;
  measurementNumerator: number | null;
  measurementDenominator: number | null;
  measurementValue: number | null;
  measurementUnit: string | null;
  measurementBoolean: boolean | null;
  measurementText: string | null;
  confidence: number | null;
  modelProvider: string;
  modelName: string;
};

export type PocReviewChildDetail = PocReviewChild & {
  goalTags: PocGoalTag[];
  logEvidence: PocLogEvidenceRow[];
};

export type PocReviewFlagKind = "GOAL_DISAGREEMENT" | "EVIDENCE_WITHOUT_GOAL";

export type PocReviewDecision = {
  id: string;
  kind: PocReviewFlagKind;
  sourceGoalId: string | null;
  canonicalSkillId: string | null;
  resolvedSkillId: string | null;
  resolvedSourceGoalId: string | null;
  resolvedSource: string | null;
  note: string | null;
  decidedById: string | null;
  decidedAt: string;
};

export type PocEvidenceGoalSuggestion = {
  id: string;
  canonicalSkillId: string;
  suggestedGoalId: string | null;
  suggestedGoalTitle: string | null;
  confidence: number | null;
  rationale: string | null;
  modelProvider: string;
};

export type PocGoalDisagreement = {
  sourceGoalId: string;
  goalTitle: string;
  tags: { modelProvider: string; predictedSkill: PocSkillRef | null; confidence: number | null; rationale: string | null }[];
  decision: PocReviewDecision | null;
};

export type PocEvidenceWithoutGoal = {
  canonicalSkillId: string;
  skill: PocSkillRef | null;
  evidenceCount: number;
  providers: string[];
  decision: PocReviewDecision | null;
  suggestion: PocEvidenceGoalSuggestion | null;
};

export type PocReviewFlags = {
  disagreements: PocGoalDisagreement[];
  evidenceWithoutGoal: PocEvidenceWithoutGoal[];
};

export type Goal = {
  id: string;
  tenantId: string;
  kidId: string;
  kid: { id: string; firstName: string; lastName: string };
  canonicalSkillId: string;
  canonicalSkill: { id: string; name: string; measurementType: PocMeasurementType | null; domain: { id: string; name: string } };
  disciplineId: string;
  discipline: { id: string; name: string };
  modality: Modality;
  title: string;
  status: "ACTIVE" | "ACHIEVED" | "DISCONTINUED";
  notes: string | null;
  items: GoalItem[];
};
