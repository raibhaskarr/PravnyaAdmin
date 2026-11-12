// Typed builders for synthetic test data. Every name/email/centre here is made up -- never real
// family data. Each builder takes a Partial override so a test only spells out what it cares about.
import type {
  Centre,
  CompanionMessage,
  EvidenceCandidate,
  Goal,
  GoalItem,
  GoalItemEvidence,
  IepGoalCandidate,
  LinkedTherapist,
  ParentProfile,
  ScheduleSlot,
  TherapistInvitationSummary
} from "../api/client";

export type Kid = NonNullable<ParentProfile["kids"]>[number];

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

export const CENTRE_A: Centre = { id: "centre-a", name: "Sunny Steps Clinic", city: "Testville" };
export const CENTRE_B: Centre = { id: "centre-b", name: "Little Leaps Centre", city: null };

export function makeEvidence(overrides: Partial<GoalItemEvidence> = {}): GoalItemEvidence {
  return {
    id: nextId("ev"),
    logDate: "2026-10-01T00:00:00.000Z",
    centre: null,
    outcome: "CORRECT",
    supportLevel: "INDEPENDENT",
    modality: "VERBAL",
    measurementType: null,
    measurementValue: null,
    measurementUnit: null,
    measurementBoolean: null,
    measurementText: null,
    ...overrides
  };
}

export function makeItem(overrides: Partial<GoalItem> = {}): GoalItem {
  return {
    id: nextId("item"),
    canonicalSkillItemId: null,
    canonicalSkillItem: null,
    customText: null,
    evidence: [],
    ...overrides
  };
}

export function makeGoal(overrides: Partial<Goal> & { domainName?: string; skillName?: string; measurementType?: string | null } = {}): Goal {
  const { domainName = "Communication", skillName = "Requesting", measurementType = null, ...rest } = overrides;
  return {
    id: nextId("goal"),
    title: "Asks for help using words",
    status: "ACTIVE",
    createdById: null,
    canonicalSkill: { id: "skill-1", name: skillName, measurementType, domain: { id: "domain-1", name: domainName } },
    discipline: { id: "disc-1", name: "Speech therapy" },
    items: [],
    ...rest
  };
}

/** Shorthand: a goal with a single item holding the given evidence. */
export function goalWithEvidence(evidence: Partial<GoalItemEvidence>[], goal: Parameters<typeof makeGoal>[0] = {}, item: Partial<GoalItem> = {}): Goal {
  return makeGoal({ ...goal, items: [makeItem({ ...item, evidence: evidence.map((e) => makeEvidence(e)) })] });
}

export function makeKid(overrides: Partial<Kid> = {}): Kid {
  return {
    id: "kid-1",
    firstName: "Sam",
    lastName: "Testchild",
    dob: "2020-05-05T00:00:00.000Z",
    gender: "Male",
    selfReportedTherapies: ["ABA"],
    selfReportedScheduleDays: ["Mon"],
    ...overrides
  };
}

export function makeProfile(overrides: Partial<ParentProfile> = {}): ParentProfile {
  return {
    id: "parent-1",
    email: "parent@test.local",
    name: "Test Parent",
    kids: [makeKid()],
    ...overrides
  };
}

export function makeSlot(overrides: Partial<ScheduleSlot> = {}): ScheduleSlot {
  return { id: nextId("slot"), label: "Speech therapy", dayOfWeek: "Tue", startTime: "16:00", therapist: null, ...overrides };
}

export function makeTherapist(overrides: Partial<LinkedTherapist> = {}): LinkedTherapist {
  return {
    id: nextId("therapist"),
    name: "Dr. Example Therapist",
    disciplineIds: ["disc-1"],
    status: "ACTIVE",
    tenant: { id: "tenant-1", name: "Example Therapy Group" },
    ...overrides
  };
}

export function makeInvitation(overrides: Partial<TherapistInvitationSummary> = {}): TherapistInvitationSummary {
  return {
    id: nextId("inv"),
    email: "therapist@test.local",
    status: "PENDING",
    kidId: "kid-1",
    createdAt: "2026-11-01T10:00:00.000Z",
    ...overrides
  };
}

export function makeEvidenceCandidate(overrides: Partial<EvidenceCandidate> = {}): EvidenceCandidate {
  return {
    goalId: "goal-x",
    goalTitle: "Asks for help using words",
    skillName: "Requesting",
    domainName: "Communication",
    measurementType: null,
    itemHint: null,
    outcome: "CORRECT",
    supportLevel: "INDEPENDENT",
    modality: "VERBAL",
    measurementValue: null,
    measurementUnit: null,
    measurementBoolean: null,
    measurementText: null,
    confidence: 0.9,
    excerpt: "Said 'help please' at snack time",
    ...overrides
  };
}

export function makeIepGoalCandidate(overrides: Partial<IepGoalCandidate> = {}): IepGoalCandidate {
  return {
    canonicalSkillId: "skill-1",
    skillName: "Requesting",
    domainName: "Communication",
    measurementType: null,
    disciplineId: "disc-1",
    modality: null,
    title: "Will request preferred items with 2-word phrases",
    confidence: 0.82,
    sourceExcerpt: "Student will request items using two-word phrases",
    ...overrides
  };
}

export function makeMessage(overrides: Partial<CompanionMessage> = {}): CompanionMessage {
  return { id: nextId("msg"), role: "PARENT", content: "Hello", createdAt: "2026-11-01T10:00:00.000Z", ...overrides };
}
