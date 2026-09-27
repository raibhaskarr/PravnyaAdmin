// Transcribes docs/canonical-taxonomy-master-list.md and docs/canonical-item-banks.md
// (PranTrackingSystem repo) into real rows. Idempotent (upsert on unique keys) so it can be
// re-run safely as the source docs evolve.
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()/,'"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const DISCIPLINES = [
  { key: "SLP", name: "Speech-Language Pathology" },
  { key: "OT", name: "Occupational Therapy" },
  { key: "ABA", name: "Applied Behavior Analysis" },
  { key: "PT", name: "Physical Therapy" },
  { key: "SPECIAL_ED", name: "Special Education / Academic Instruction" }
] as const;

const DOMAINS = [
  { key: "RECEPTIVE_LANGUAGE", name: "Receptive Language", sortOrder: 1 },
  { key: "EXPRESSIVE_LANGUAGE", name: "Expressive Language", sortOrder: 2 },
  { key: "SPEECH_PRODUCTION", name: "Speech Production & Articulation", sortOrder: 3 },
  { key: "AUDITORY_PROCESSING", name: "Auditory Processing & Listening", sortOrder: 4 },
  { key: "SOCIAL_COMMUNICATION", name: "Social Communication & Pragmatics", sortOrder: 5 },
  { key: "COGNITIVE_PRE_ACADEMIC", name: "Cognitive & Pre-Academic Skills", sortOrder: 6 },
  { key: "FUNCTIONAL_ACADEMICS", name: "Functional Academics", sortOrder: 7 },
  { key: "EXECUTIVE_FUNCTIONING", name: "Executive Functioning & Attention", sortOrder: 8 },
  { key: "BEHAVIOR_REGULATION", name: "Behavior & Self-Regulation", sortOrder: 9 },
  { key: "SENSORY_PROCESSING", name: "Sensory Processing", sortOrder: 10 },
  { key: "GROSS_MOTOR", name: "Gross Motor & Physical Development", sortOrder: 11 },
  { key: "FINE_MOTOR", name: "Fine Motor Skills", sortOrder: 12 },
  { key: "ADAPTIVE_DAILY_LIVING", name: "Adaptive / Daily Living Skills", sortOrder: 13 },
  { key: "IMITATION_FOUNDATIONAL", name: "Imitation & Foundational Learning Skills", sortOrder: 14 }
] as const;

type SkillSeed = {
  domain: string;
  name: string;
  discipline: string;
  supportsItems: boolean;
  source: "PROD" | "FRAMEWORK";
};

// Matches canonical-taxonomy-master-list.md exactly, domain by domain. First-listed discipline
// in the doc's "Primary discipline(s)" column is used as defaultDisciplineId (the schema models
// one default; the doc's own framing is "default, not exclusive").
const SKILLS: SkillSeed[] = [
  // 1. Receptive Language (SLP)
  { domain: "RECEPTIVE_LANGUAGE", name: "Identifies objects/pictures when named", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "RECEPTIVE_LANGUAGE", name: "Identifies body parts when named", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "RECEPTIVE_LANGUAGE", name: "Identifies actions when named", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "RECEPTIVE_LANGUAGE", name: "Follows verbal directions (graded by step count)", discipline: "SLP", supportsItems: false, source: "PROD" },
  { domain: "RECEPTIVE_LANGUAGE", name: "Follows directions with spatial/preposition concepts", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "RECEPTIVE_LANGUAGE", name: "Identifies objects by attribute", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "RECEPTIVE_LANGUAGE", name: "Answers WH-questions (receptive/selection response)", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "RECEPTIVE_LANGUAGE", name: "Identifies colors when named", discipline: "SLP", supportsItems: true, source: "FRAMEWORK" },
  { domain: "RECEPTIVE_LANGUAGE", name: "Understands quantity/size concepts", discipline: "SLP", supportsItems: true, source: "FRAMEWORK" },
  { domain: "RECEPTIVE_LANGUAGE", name: "Understands negation", discipline: "SLP", supportsItems: false, source: "FRAMEWORK" },
  { domain: "RECEPTIVE_LANGUAGE", name: "Understands yes/no questions", discipline: "SLP", supportsItems: false, source: "FRAMEWORK" },
  { domain: "RECEPTIVE_LANGUAGE", name: "Understands basic possessive pronouns", discipline: "SLP", supportsItems: true, source: "FRAMEWORK" },
  { domain: "RECEPTIVE_LANGUAGE", name: "Identifies emotions from facial expression/context", discipline: "SLP", supportsItems: true, source: "FRAMEWORK" },

  // 2. Expressive Language (SLP)
  { domain: "EXPRESSIVE_LANGUAGE", name: "Labels/names familiar objects (tact)", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "EXPRESSIVE_LANGUAGE", name: "Requests desired items/actions/locations (mand)", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "EXPRESSIVE_LANGUAGE", name: "Accepts/rejects (protests, says no)", discipline: "SLP", supportsItems: false, source: "PROD" },
  { domain: "EXPRESSIVE_LANGUAGE", name: "Answers personal/social questions", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "EXPRESSIVE_LANGUAGE", name: "Answers WH/function questions about objects", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "EXPRESSIVE_LANGUAGE", name: "Uses descriptive language", discipline: "SLP", supportsItems: false, source: "PROD" },
  { domain: "EXPRESSIVE_LANGUAGE", name: "Uses grammatically correct past tense", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "EXPRESSIVE_LANGUAGE", name: "Uses complex sentence structures", discipline: "SLP", supportsItems: false, source: "PROD" },
  { domain: "EXPRESSIVE_LANGUAGE", name: "Produces spontaneous functional verbs", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "EXPRESSIVE_LANGUAGE", name: "Initiates calling/greeting phrases for familiar people", discipline: "SLP", supportsItems: false, source: "PROD" },
  { domain: "EXPRESSIVE_LANGUAGE", name: "Responds to intraverbal prompts (fill-in-the-blank, conversational)", discipline: "SLP", supportsItems: true, source: "FRAMEWORK" },
  { domain: "EXPRESSIVE_LANGUAGE", name: "Uses plurals correctly", discipline: "SLP", supportsItems: true, source: "FRAMEWORK" },
  { domain: "EXPRESSIVE_LANGUAGE", name: "Uses pronouns correctly", discipline: "SLP", supportsItems: true, source: "FRAMEWORK" },
  { domain: "EXPRESSIVE_LANGUAGE", name: "Uses prepositions expressively", discipline: "SLP", supportsItems: true, source: "FRAMEWORK" },
  { domain: "EXPRESSIVE_LANGUAGE", name: "Asks questions to gain information", discipline: "SLP", supportsItems: true, source: "FRAMEWORK" },
  { domain: "EXPRESSIVE_LANGUAGE", name: "Retells a simple sequence of events (narrative)", discipline: "SLP", supportsItems: false, source: "FRAMEWORK" },

  // 3. Speech Production & Articulation (SLP)
  { domain: "SPEECH_PRODUCTION", name: "Produces target sound in isolation", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "SPEECH_PRODUCTION", name: "Produces target sound in syllables (CV/VC)", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "SPEECH_PRODUCTION", name: "Produces target sound in words (initial/medial/final)", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "SPEECH_PRODUCTION", name: "Produces target sound in phrases and sentences", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "SPEECH_PRODUCTION", name: "Maintains target sound in connected/spontaneous speech", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "SPEECH_PRODUCTION", name: "Contrasts voiced/voiceless sound pairs", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "SPEECH_PRODUCTION", name: "Oral-motor strength & mobility (jaw/lip/tongue)", discipline: "SLP", supportsItems: false, source: "PROD" },
  { domain: "SPEECH_PRODUCTION", name: "Reduces a specific phonological process", discipline: "SLP", supportsItems: true, source: "FRAMEWORK" },
  { domain: "SPEECH_PRODUCTION", name: "Controls vocal parameters (volume, pitch, rate)", discipline: "SLP", supportsItems: true, source: "FRAMEWORK" },
  { domain: "SPEECH_PRODUCTION", name: "Maintains fluent speech (reduces disfluency)", discipline: "SLP", supportsItems: false, source: "FRAMEWORK" },

  // 4. Auditory Processing & Listening (SLP - AVT)
  { domain: "AUDITORY_PROCESSING", name: "Discriminates between speech sounds (auditory-only)", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "AUDITORY_PROCESSING", name: "Identifies common items by auditory cue alone (no visual)", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "AUDITORY_PROCESSING", name: "Tracks and listens to increasingly long sentences", discipline: "SLP", supportsItems: false, source: "PROD" },
  { domain: "AUDITORY_PROCESSING", name: "Auditory memory for multi-item sequences", discipline: "SLP", supportsItems: false, source: "PROD" },
  { domain: "AUDITORY_PROCESSING", name: "Localizes a sound source", discipline: "SLP", supportsItems: true, source: "FRAMEWORK" },
  { domain: "AUDITORY_PROCESSING", name: "Discriminates environmental sounds from speech", discipline: "SLP", supportsItems: true, source: "FRAMEWORK" },
  { domain: "AUDITORY_PROCESSING", name: "Listens/attends with background noise present", discipline: "SLP", supportsItems: false, source: "FRAMEWORK" },
  { domain: "AUDITORY_PROCESSING", name: "Demonstrates phonological awareness", discipline: "SLP", supportsItems: true, source: "FRAMEWORK" },

  // 5. Social Communication & Pragmatics (SLP, ABA, OT)
  { domain: "SOCIAL_COMMUNICATION", name: "Responds to / initiates greetings", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "SOCIAL_COMMUNICATION", name: "Takes turns with a familiar partner", discipline: "ABA", supportsItems: false, source: "PROD" },
  { domain: "SOCIAL_COMMUNICATION", name: "Engages in parallel play", discipline: "ABA", supportsItems: false, source: "PROD" },
  { domain: "SOCIAL_COMMUNICATION", name: "Engages in independent leisure", discipline: "ABA", supportsItems: false, source: "PROD" },
  { domain: "SOCIAL_COMMUNICATION", name: "Engages in guided play and peer interaction", discipline: "OT", supportsItems: false, source: "PROD" },
  { domain: "SOCIAL_COMMUNICATION", name: "Tolerates group settings", discipline: "ABA", supportsItems: false, source: "PROD" },
  { domain: "SOCIAL_COMMUNICATION", name: "Differentiates socially appropriate (\"cool\") vs. inappropriate behavior", discipline: "ABA", supportsItems: false, source: "PROD" },
  { domain: "SOCIAL_COMMUNICATION", name: "Engages in functional/appropriate toy play", discipline: "ABA", supportsItems: true, source: "FRAMEWORK" },
  { domain: "SOCIAL_COMMUNICATION", name: "Engages in pretend/symbolic play", discipline: "ABA", supportsItems: true, source: "FRAMEWORK" },
  { domain: "SOCIAL_COMMUNICATION", name: "Engages in cooperative play with peers", discipline: "ABA", supportsItems: false, source: "FRAMEWORK" },
  { domain: "SOCIAL_COMMUNICATION", name: "Shares and takes turns with toys/materials", discipline: "ABA", supportsItems: false, source: "FRAMEWORK" },
  { domain: "SOCIAL_COMMUNICATION", name: "Initiates interaction with peers", discipline: "SLP", supportsItems: false, source: "FRAMEWORK" },
  { domain: "SOCIAL_COMMUNICATION", name: "Initiates and responds to joint attention", discipline: "ABA", supportsItems: false, source: "FRAMEWORK" },
  { domain: "SOCIAL_COMMUNICATION", name: "Uses appropriate eye contact and non-verbal social cues", discipline: "SLP", supportsItems: false, source: "FRAMEWORK" },

  // 6. Cognitive & Pre-Academic Skills (ABA, OT, Special Ed)
  { domain: "COGNITIVE_PRE_ACADEMIC", name: "Matches identical pictures/objects (visual matching-to-sample)", discipline: "ABA", supportsItems: true, source: "FRAMEWORK" },
  { domain: "COGNITIVE_PRE_ACADEMIC", name: "Matches associated pictures (non-identical, related concept)", discipline: "ABA", supportsItems: true, source: "FRAMEWORK" },
  { domain: "COGNITIVE_PRE_ACADEMIC", name: "Sorts/categorizes by attribute or class", discipline: "ABA", supportsItems: true, source: "FRAMEWORK" },
  { domain: "COGNITIVE_PRE_ACADEMIC", name: "Understands cause-and-effect", discipline: "OT", supportsItems: false, source: "FRAMEWORK" },
  { domain: "COGNITIVE_PRE_ACADEMIC", name: "Completes puzzles/form boards", discipline: "OT", supportsItems: true, source: "FRAMEWORK" },
  { domain: "COGNITIVE_PRE_ACADEMIC", name: "Sequences pictures/events in order", discipline: "ABA", supportsItems: false, source: "FRAMEWORK" },
  { domain: "COGNITIVE_PRE_ACADEMIC", name: "Discriminates size, shape, and color concepts", discipline: "ABA", supportsItems: false, source: "FRAMEWORK" },
  { domain: "COGNITIVE_PRE_ACADEMIC", name: "Builds block/pattern constructions from a model", discipline: "OT", supportsItems: false, source: "FRAMEWORK" },

  // 7. Functional Academics (Special Ed, ABA)
  { domain: "FUNCTIONAL_ACADEMICS", name: "Identifies uppercase/lowercase letters", discipline: "SPECIAL_ED", supportsItems: true, source: "PROD" },
  { domain: "FUNCTIONAL_ACADEMICS", name: "Matches uppercase to lowercase letters", discipline: "SPECIAL_ED", supportsItems: true, source: "PROD" },
  { domain: "FUNCTIONAL_ACADEMICS", name: "Matches sight words to pictures", discipline: "SPECIAL_ED", supportsItems: true, source: "PROD" },
  { domain: "FUNCTIONAL_ACADEMICS", name: "Writes letters/numbers from dictation", discipline: "SPECIAL_ED", supportsItems: true, source: "PROD" },
  { domain: "FUNCTIONAL_ACADEMICS", name: "Writes/copies own name", discipline: "SPECIAL_ED", supportsItems: false, source: "PROD" },
  { domain: "FUNCTIONAL_ACADEMICS", name: "Counts and circles quantities", discipline: "SPECIAL_ED", supportsItems: true, source: "PROD" },
  { domain: "FUNCTIONAL_ACADEMICS", name: "Identifies currency notes", discipline: "SPECIAL_ED", supportsItems: true, source: "PROD" },
  { domain: "FUNCTIONAL_ACADEMICS", name: "Differentiates public vs. private places", discipline: "SPECIAL_ED", supportsItems: false, source: "PROD" },
  { domain: "FUNCTIONAL_ACADEMICS", name: "Differentiates safe vs. dangerous scenarios", discipline: "SPECIAL_ED", supportsItems: false, source: "PROD" },
  { domain: "FUNCTIONAL_ACADEMICS", name: "Reads sight words aloud", discipline: "SPECIAL_ED", supportsItems: true, source: "FRAMEWORK" },
  { domain: "FUNCTIONAL_ACADEMICS", name: "Demonstrates letter-sound correspondence (phonics)", discipline: "SPECIAL_ED", supportsItems: false, source: "FRAMEWORK" },
  { domain: "FUNCTIONAL_ACADEMICS", name: "Answers simple comprehension questions about a short story/passage", discipline: "SPECIAL_ED", supportsItems: false, source: "FRAMEWORK" },
  { domain: "FUNCTIONAL_ACADEMICS", name: "Performs basic addition/subtraction", discipline: "SPECIAL_ED", supportsItems: false, source: "FRAMEWORK" },
  { domain: "FUNCTIONAL_ACADEMICS", name: "Identifies and names basic shapes", discipline: "SPECIAL_ED", supportsItems: true, source: "FRAMEWORK" },
  { domain: "FUNCTIONAL_ACADEMICS", name: "Compares quantities (more/less/equal)", discipline: "SPECIAL_ED", supportsItems: false, source: "FRAMEWORK" },
  { domain: "FUNCTIONAL_ACADEMICS", name: "Spells simple words from dictation/independently", discipline: "SPECIAL_ED", supportsItems: true, source: "FRAMEWORK" },
  { domain: "FUNCTIONAL_ACADEMICS", name: "Tells time functionally", discipline: "SPECIAL_ED", supportsItems: false, source: "FRAMEWORK" },

  // 8. Executive Functioning & Attention (ABA, OT)
  { domain: "EXECUTIVE_FUNCTIONING", name: "Sustains attention and task participation", discipline: "ABA", supportsItems: false, source: "PROD" },
  { domain: "EXECUTIVE_FUNCTIONING", name: "Follows a picture activity schedule", discipline: "ABA", supportsItems: true, source: "PROD" },
  { domain: "EXECUTIVE_FUNCTIONING", name: "Engages productively in independent leisure", discipline: "ABA", supportsItems: false, source: "PROD" },
  { domain: "EXECUTIVE_FUNCTIONING", name: "Complies with simple instructions (instructional readiness)", discipline: "ABA", supportsItems: false, source: "FRAMEWORK" },
  { domain: "EXECUTIVE_FUNCTIONING", name: "Transitions between activities/settings", discipline: "ABA", supportsItems: false, source: "FRAMEWORK" },
  { domain: "EXECUTIVE_FUNCTIONING", name: "Follows multi-step classroom/home routines", discipline: "ABA", supportsItems: true, source: "FRAMEWORK" },
  { domain: "EXECUTIVE_FUNCTIONING", name: "Self-monitors/checks own completed work", discipline: "OT", supportsItems: false, source: "FRAMEWORK" },
  { domain: "EXECUTIVE_FUNCTIONING", name: "Adapts to changes in routine (cognitive flexibility)", discipline: "ABA", supportsItems: false, source: "FRAMEWORK" },

  // 9. Behavior & Self-Regulation (ABA)
  { domain: "BEHAVIOR_REGULATION", name: "Reduces frequency/duration of a target behavior", discipline: "ABA", supportsItems: true, source: "PROD" },
  { domain: "BEHAVIOR_REGULATION", name: "Tolerates denied access / waits for preferred items", discipline: "ABA", supportsItems: false, source: "PROD" },
  { domain: "BEHAVIOR_REGULATION", name: "Reduces self-injurious behavior", discipline: "ABA", supportsItems: true, source: "FRAMEWORK" },
  { domain: "BEHAVIOR_REGULATION", name: "Reduces elopement (beyond \"bolting\")", discipline: "ABA", supportsItems: false, source: "FRAMEWORK" },
  { domain: "BEHAVIOR_REGULATION", name: "Reduces property destruction", discipline: "ABA", supportsItems: false, source: "FRAMEWORK" },
  { domain: "BEHAVIOR_REGULATION", name: "Increases compliance with adult instructions", discipline: "ABA", supportsItems: false, source: "FRAMEWORK" },
  { domain: "BEHAVIOR_REGULATION", name: "Uses functional communication instead of challenging behavior", discipline: "ABA", supportsItems: true, source: "FRAMEWORK" },
  { domain: "BEHAVIOR_REGULATION", name: "Identifies and labels own emotions", discipline: "ABA", supportsItems: true, source: "FRAMEWORK" },
  { domain: "BEHAVIOR_REGULATION", name: "Uses a coping/calming strategy when dysregulated", discipline: "ABA", supportsItems: true, source: "FRAMEWORK" },
  { domain: "BEHAVIOR_REGULATION", name: "Tolerates transitions/changes in routine without challenging behavior", discipline: "ABA", supportsItems: false, source: "FRAMEWORK" },

  // 10. Sensory Processing (OT)
  { domain: "SENSORY_PROCESSING", name: "Improves sensory registration and responsiveness", discipline: "OT", supportsItems: false, source: "PROD" },
  { domain: "SENSORY_PROCESSING", name: "Meets vestibular and proprioceptive input needs", discipline: "OT", supportsItems: false, source: "PROD" },
  { domain: "SENSORY_PROCESSING", name: "Self-regulates via structured sensory-motor input", discipline: "OT", supportsItems: false, source: "PROD" },
  { domain: "SENSORY_PROCESSING", name: "Tolerates tactile input", discipline: "OT", supportsItems: true, source: "FRAMEWORK" },
  { domain: "SENSORY_PROCESSING", name: "Modulates response to auditory input", discipline: "OT", supportsItems: true, source: "FRAMEWORK" },
  { domain: "SENSORY_PROCESSING", name: "Tolerates oral-sensory input (feeding-relevant)", discipline: "OT", supportsItems: true, source: "FRAMEWORK" },
  { domain: "SENSORY_PROCESSING", name: "Discriminates sensory input", discipline: "OT", supportsItems: false, source: "FRAMEWORK" },

  // 11. Gross Motor & Physical Development (OT, PT)
  { domain: "GROSS_MOTOR", name: "Imitates gross motor actions on verbal instruction", discipline: "OT", supportsItems: true, source: "PROD" },
  { domain: "GROSS_MOTOR", name: "Executes multi-step motor sequences (motor planning/praxis)", discipline: "OT", supportsItems: false, source: "PROD" },
  { domain: "GROSS_MOTOR", name: "Increases sitting/postural tolerance", discipline: "OT", supportsItems: false, source: "PROD" },
  { domain: "GROSS_MOTOR", name: "Coordinates functional movement", discipline: "OT", supportsItems: false, source: "PROD" },
  { domain: "GROSS_MOTOR", name: "Walks/runs with age-appropriate coordination", discipline: "PT", supportsItems: false, source: "FRAMEWORK" },
  { domain: "GROSS_MOTOR", name: "Jumps (in place, forward, over an obstacle)", discipline: "PT", supportsItems: false, source: "FRAMEWORK" },
  { domain: "GROSS_MOTOR", name: "Balances", discipline: "PT", supportsItems: true, source: "FRAMEWORK" },
  { domain: "GROSS_MOTOR", name: "Climbs stairs with alternating feet", discipline: "PT", supportsItems: false, source: "FRAMEWORK" },
  { domain: "GROSS_MOTOR", name: "Catches, throws, and kicks a ball", discipline: "PT", supportsItems: true, source: "FRAMEWORK" },
  { domain: "GROSS_MOTOR", name: "Rides a tricycle/bicycle", discipline: "PT", supportsItems: false, source: "FRAMEWORK" },

  // 12. Fine Motor Skills (OT)
  { domain: "FINE_MOTOR", name: "Uses a functional pencil/crayon grasp", discipline: "OT", supportsItems: false, source: "FRAMEWORK" },
  { domain: "FINE_MOTOR", name: "Copies basic shapes and pre-writing strokes", discipline: "OT", supportsItems: true, source: "FRAMEWORK" },
  { domain: "FINE_MOTOR", name: "Cuts along a line with scissors", discipline: "OT", supportsItems: true, source: "FRAMEWORK" },
  { domain: "FINE_MOTOR", name: "Strings beads / manipulates small objects", discipline: "OT", supportsItems: true, source: "FRAMEWORK" },
  { domain: "FINE_MOTOR", name: "Builds with blocks / stacks", discipline: "OT", supportsItems: false, source: "FRAMEWORK" },
  { domain: "FINE_MOTOR", name: "Turns pages of a book", discipline: "OT", supportsItems: false, source: "FRAMEWORK" },
  { domain: "FINE_MOTOR", name: "Buttons, snaps, and uses zippers", discipline: "OT", supportsItems: true, source: "FRAMEWORK" },
  { domain: "FINE_MOTOR", name: "Uses utensils with control", discipline: "OT", supportsItems: true, source: "FRAMEWORK" },
  { domain: "FINE_MOTOR", name: "Completes pegboards and inset puzzles", discipline: "OT", supportsItems: false, source: "FRAMEWORK" },
  { domain: "FINE_MOTOR", name: "In-hand manipulation of small objects", discipline: "OT", supportsItems: false, source: "FRAMEWORK" },

  // 13. Adaptive / Daily Living Skills (OT, ABA, Special Ed)
  { domain: "ADAPTIVE_DAILY_LIVING", name: "Completes toileting routine independently", discipline: "OT", supportsItems: false, source: "PROD" },
  { domain: "ADAPTIVE_DAILY_LIVING", name: "Completes hygiene routines independently", discipline: "OT", supportsItems: true, source: "PROD" },
  { domain: "ADAPTIVE_DAILY_LIVING", name: "Completes dressing tasks independently (fasteners)", discipline: "OT", supportsItems: false, source: "PROD" },
  { domain: "ADAPTIVE_DAILY_LIVING", name: "Completes meal-related tasks independently", discipline: "OT", supportsItems: true, source: "PROD" },
  { domain: "ADAPTIVE_DAILY_LIVING", name: "Dresses self fully (garments, not just fasteners)", discipline: "OT", supportsItems: true, source: "FRAMEWORK" },
  { domain: "ADAPTIVE_DAILY_LIVING", name: "Eats independently with utensils", discipline: "OT", supportsItems: false, source: "FRAMEWORK" },
  { domain: "ADAPTIVE_DAILY_LIVING", name: "Drinks from an open cup", discipline: "OT", supportsItems: false, source: "FRAMEWORK" },
  { domain: "ADAPTIVE_DAILY_LIVING", name: "Opens food packaging independently", discipline: "OT", supportsItems: false, source: "FRAMEWORK" },
  { domain: "ADAPTIVE_DAILY_LIVING", name: "Cares for hair", discipline: "OT", supportsItems: false, source: "FRAMEWORK" },
  { domain: "ADAPTIVE_DAILY_LIVING", name: "Bathes/showers with decreasing support", discipline: "OT", supportsItems: false, source: "FRAMEWORK" },
  { domain: "ADAPTIVE_DAILY_LIVING", name: "Understands and follows basic safety rules", discipline: "SPECIAL_ED", supportsItems: true, source: "FRAMEWORK" },

  // 14. Imitation & Foundational Learning Skills (ABA, SLP)
  { domain: "IMITATION_FOUNDATIONAL", name: "Imitates gross/fine motor actions on model", discipline: "ABA", supportsItems: true, source: "PROD" },
  { domain: "IMITATION_FOUNDATIONAL", name: "Imitates oral-motor (non-speech) movements", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "IMITATION_FOUNDATIONAL", name: "Imitates vowel and early consonant sounds (echoic)", discipline: "SLP", supportsItems: true, source: "PROD" },
  { domain: "IMITATION_FOUNDATIONAL", name: "Imitates two-step action sequences", discipline: "ABA", supportsItems: false, source: "FRAMEWORK" },
  { domain: "IMITATION_FOUNDATIONAL", name: "Imitates facial expressions", discipline: "ABA", supportsItems: true, source: "FRAMEWORK" },
  { domain: "IMITATION_FOUNDATIONAL", name: "Produces spontaneous pre-verbal vocalizations", discipline: "SLP", supportsItems: false, source: "FRAMEWORK" }
];

// The shared object-identification bank (canonical-item-banks.md's 11-category, ~110-item
// reference table) is attached only to its primary skill below, per the doc's own framing
// ("cross-referenced, not duplicated"). Skills 2/4/6 that the doc lists as sharing this same
// bank ("Labels/names familiar objects (tact)", "Identifies common items by auditory cue alone",
// "Matches identical pictures/objects") don't get their own copy in this pass -- a proper
// many-to-many item<->skill link is a schema change for later, not built here.
const OBJECT_BANK: Array<{ group: string; items: string[] }> = [
  { group: "ANIMALS", items: ["Dog", "Cat", "Cow", "Horse", "Goat", "Sheep", "Pig", "Chicken", "Duck", "Elephant", "Lion", "Tiger", "Monkey", "Rabbit", "Bear", "Bird", "Fish", "Snake", "Frog", "Butterfly"] },
  { group: "FOOD_AND_DRINK", items: ["Apple", "Banana", "Mango", "Orange", "Grapes", "Milk", "Water", "Juice", "Bread", "Rice", "Egg", "Biscuit", "Ice cream", "Chocolate", "Dosa", "Idli", "Paratha", "Sabzi"] },
  { group: "VEHICLES_TRANSPORT", items: ["Car", "Bus", "Bike", "Auto", "Aeroplane", "Train", "Boat", "Truck", "Bicycle", "Helicopter", "Ambulance", "Fire truck"] },
  { group: "TOYS", items: ["Ball", "Doll", "Blocks", "Puzzle", "Toy car", "Balloon", "Kite", "Teddy bear", "Swing", "Slide"] },
  { group: "CLOTHING", items: ["Shirt", "Pant", "Socks", "Shoes", "Cap", "Frock", "Jacket", "Sweater"] },
  { group: "UTENSILS_SMALL_HOUSEHOLD", items: ["Spoon", "Fork", "Plate", "Cup", "Glass", "Bowl", "Knife", "Bottle", "Key", "Phone", "Comb", "Brush", "Towel", "Soap"] },
  { group: "FURNITURE_AND_ROOMS", items: ["Bed", "Chair", "Table", "Sofa", "Cupboard", "Door", "Window", "Fan", "Light", "TV", "Bathroom", "Kitchen", "Bedroom"] },
  { group: "SCHOOL_OBJECTS", items: ["Pencil", "Pen", "Book", "Bag", "Scissor", "Crayon", "Eraser", "Ruler", "Notebook", "Glue"] },
  { group: "OUTSIDE_THINGS", items: ["Tree", "Flower", "Sun", "Moon", "Star", "Cloud", "Rain", "Grass", "Sand", "Park"] },
  { group: "PLACES_TO_GO", items: ["School", "Park", "Home", "Hospital", "Shop", "Market", "Temple"] },
  { group: "PEOPLE", items: ["Mother", "Father", "Sister", "Brother", "Baby", "Doctor", "Teacher", "Friend", "Grandmother", "Grandfather"] }
];

// Per-skill item banks, keyed by exact skill name (must match SKILLS above). Single semanticGroup
// "OTHER" for skills whose doc entry is a flat list rather than pre-grouped categories.
const ITEM_BANKS: Record<string, Array<{ group: string; items: string[] }>> = {
  "Identifies objects/pictures when named": OBJECT_BANK,
  "Identifies body parts when named": [{ group: "OTHER", items: ["Head", "Hair", "Forehead", "Eyebrow", "Eye", "Ear", "Nose", "Mouth", "Chin", "Neck", "Shoulder", "Chest", "Stomach", "Back", "Arm", "Elbow", "Hand", "Finger", "Leg", "Knee", "Foot", "Toe"] }],
  "Identifies actions when named": [{ group: "OTHER", items: ["Sleeping", "Jumping", "Crying", "Eating", "Running", "Walking", "Swimming", "Writing", "Sitting", "Standing", "Drinking", "Reading", "Washing", "Brushing", "Cutting", "Throwing", "Catching", "Pushing", "Pulling", "Climbing"] }],
  "Follows directions with spatial/preposition concepts": [{ group: "OTHER", items: ["In", "On", "Under", "Over", "Between", "Beside", "Behind", "In front of", "Next to", "Through", "Above", "Below"] }],
  "Identifies objects by attribute": [{ group: "OTHER", items: ["Clean/Dirty", "Big/Small", "Soft/Hard", "Hot/Cold", "Wet/Dry", "Full/Empty", "Long/Short", "Heavy/Light", "Fast/Slow", "Loud/Quiet", "Open/Closed", "New/Old", "Same/Different"] }],
  "Identifies colors when named": [{ group: "OTHER", items: ["Red", "Blue", "Yellow", "Green", "Orange", "Purple", "Pink", "Brown", "Black", "White", "Grey"] }],
  "Understands quantity/size concepts": [{ group: "OTHER", items: ["More/Less", "Big/Bigger/Biggest", "Small/Smaller/Smallest", "All/None", "Some", "Empty/Full", "One/Many"] }],
  "Understands basic possessive pronouns": [{ group: "OTHER", items: ["His", "Her", "My", "Your", "Their", "Our"] }],
  "Identifies emotions from facial expression/context": [{ group: "OTHER", items: ["Happy", "Sad", "Angry", "Scared", "Surprised", "Excited", "Tired", "Confused"] }],
  // Question-type categories only -- the actual question text/answer is inherently per-kid
  // (their own family, school, routine), so it isn't pre-populated here, same as how the picture
  // activity schedule skill's items are the child's own routine, generated per child.
  "Answers WH-questions (receptive/selection response)": [{ group: "OTHER", items: ["Who", "What", "Where", "When", "Why"] }],

  "Requests desired items/actions/locations (mand)": [{ group: "OTHER", items: ["Water", "Snack", "Toy", "Break", "More", "Help", "Bathroom", "All done", "Open", "Turn on", "Turn off", "Go outside", "Juice", "Book"] }],
  "Answers personal/social questions": [{ group: "OTHER", items: ["Name", "Age", "School name", "Mother's name", "Father's name", "Siblings' names", "Address", "Favorite color", "Favorite food"] }],
  "Answers WH/function questions about objects": [{ group: "OTHER", items: ["What do you eat with?", "What do you cut with?", "What do you write with?", "What do you wear on feet?", "What do you sleep on?", "What do you drink from?", "What do you see with?", "What do you hear with?", "What do you brush teeth with?"] }],
  "Uses grammatically correct past tense": [{ group: "REGULAR", items: ["Walked", "Jumped", "Played", "Cooked", "Cleaned", "Watched"] }, { group: "IRREGULAR", items: ["Went", "Ate", "Saw", "Ran", "Sat", "Drank", "Wrote", "Came", "Gave", "Took"] }],
  "Produces spontaneous functional verbs": [{ group: "OTHER", items: ["Help", "Open", "Go", "Stop", "Come", "Give", "Push", "Pull", "Turn on", "Turn off"] }],
  "Responds to intraverbal prompts (fill-in-the-blank, conversational)": [{ group: "OTHER", items: ["Twinkle twinkle little ___", "You sleep in a ___", "Name an animal", "Name a food", "Name a color"] }],
  "Uses plurals correctly": [{ group: "REGULAR", items: ["Cats", "Dogs", "Cups", "Books"] }, { group: "IRREGULAR", items: ["Feet", "Teeth", "Children", "Mice"] }],
  "Uses pronouns correctly": [{ group: "OTHER", items: ["I", "You", "He", "She", "They", "We", "It"] }],
  "Uses prepositions expressively": [{ group: "OTHER", items: ["In", "On", "Under", "Over", "Between", "Beside", "Behind", "In front of", "Next to", "Through", "Above", "Below"] }],
  "Asks questions to gain information": [{ group: "OTHER", items: ["What's that?", "Where's ___?", "Who is that?", "Can I have ___?"] }],

  "Produces target sound in isolation": [{ group: "CONSONANTS", items: ["/t/", "/d/", "/k/", "/g/", "/s/", "/r/", "/sh/", "/ch/", "/th/", "/n/", "/l/"] }],
  "Produces target sound in syllables (CV/VC)": [{ group: "CONSONANTS", items: ["/t/", "/d/", "/k/", "/g/", "/s/", "/r/", "/sh/", "/ch/", "/th/", "/n/", "/l/"] }],
  "Produces target sound in words (initial/medial/final)": [{ group: "CONSONANTS", items: ["/t/", "/d/", "/k/", "/g/", "/s/", "/r/", "/sh/", "/ch/", "/th/", "/n/", "/l/"] }],
  "Produces target sound in phrases and sentences": [{ group: "CONSONANTS", items: ["/t/", "/d/", "/k/", "/g/", "/s/", "/r/", "/sh/", "/ch/", "/th/", "/n/", "/l/"] }],
  "Maintains target sound in connected/spontaneous speech": [{ group: "CONSONANTS", items: ["/t/", "/d/", "/k/", "/g/", "/s/", "/r/", "/sh/", "/ch/", "/th/", "/n/", "/l/"] }],
  "Contrasts voiced/voiceless sound pairs": [{ group: "OTHER", items: ["/p/-/b/", "/t/-/d/", "/k/-/g/", "/f/-/v/", "/s/-/z/", "/sh/-/zh/", "/ch/-/j/"] }],
  "Reduces a specific phonological process": [{ group: "OTHER", items: ["Fronting", "Stopping", "Gliding", "Cluster Reduction", "Final Consonant Deletion"] }],
  "Controls vocal parameters (volume, pitch, rate)": [{ group: "OTHER", items: ["Loud/Soft", "Fast/Slow", "High/Low pitch"] }],

  "Discriminates between speech sounds (auditory-only)": [{ group: "OTHER", items: ["Pin/Bin", "Cat/Bat", "Tan/Can", "Go/No", "Sun/Fun", "/k/-/t/", "/g/-/d/"] }],
  "Identifies common items by auditory cue alone (no visual)": OBJECT_BANK,
  "Localizes a sound source": [{ group: "OTHER", items: ["Left", "Right", "Front", "Back", "Up", "Down"] }],
  "Discriminates environmental sounds from speech": [{ group: "OTHER", items: ["Doorbell", "Phone ringing", "Dog barking", "Car horn", "Clock ticking", "Water running", "Knock on door", "Alarm"] }],
  "Demonstrates phonological awareness": [{ group: "RHYMING", items: ["Cat/Hat", "Dog/Log"] }],

  "Responds to / initiates greetings": [{ group: "OTHER", items: ["Hi", "Hello", "Good morning", "Bye", "See you later", "How are you"] }],
  "Engages in functional/appropriate toy play": [{ group: "OTHER", items: ["Cause-effect toys", "Push-button toys", "Simple mechanical toys"] }],
  "Engages in pretend/symbolic play": [{ group: "OTHER", items: ["Feed a doll", "Pretend cook", "Pretend phone call", "Doctor kit", "Pretend driving"] }],

  "Matches identical pictures/objects (visual matching-to-sample)": OBJECT_BANK,
  "Matches associated pictures (non-identical, related concept)": [{ group: "OTHER", items: ["Sock-Shoe", "Cup-Saucer", "Spoon-Bowl", "Key-Lock", "Brush-Hair", "Pencil-Paper"] }],
  "Sorts/categorizes by attribute or class": [{ group: "OTHER", items: ["By color", "By shape", "Animals vs. food", "Animals vs. vehicles"] }],
  "Completes puzzles/form boards": [{ group: "OTHER", items: ["2-piece", "4-piece", "6-piece", "9-piece", "12-piece"] }],
  "Identifies and names basic shapes": [{ group: "OTHER", items: ["Circle", "Square", "Triangle", "Rectangle", "Star", "Oval", "Diamond", "Heart"] }],

  "Identifies uppercase/lowercase letters": [{ group: "UPPERCASE", items: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") }, { group: "LOWERCASE", items: "abcdefghijklmnopqrstuvwxyz".split("") }],
  "Matches uppercase to lowercase letters": [{ group: "UPPERCASE", items: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") }],
  "Matches sight words to pictures": [{ group: "DOLCH_PRE_PRIMER", items: ["a", "and", "big", "blue", "come", "down", "find", "go", "help", "here", "I", "in", "is", "it", "jump", "little", "look", "me", "my", "no", "one", "play", "red", "run", "see", "stop", "the", "up", "we", "yellow"] }],
  "Reads sight words aloud": [{ group: "DOLCH_PRE_PRIMER", items: ["a", "and", "big", "blue", "come", "down", "find", "go", "help", "here", "I", "in", "is", "it", "jump", "little", "look", "me", "my", "no", "one", "play", "red", "run", "see", "stop", "the", "up", "we", "yellow"] }],
  "Writes letters/numbers from dictation": [{ group: "LETTERS", items: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") }, { group: "NUMBERS", items: Array.from({ length: 20 }, (_, i) => String(i + 1)) }],
  "Counts and circles quantities": [{ group: "OTHER", items: Array.from({ length: 10 }, (_, i) => String(i + 1)) }],
  "Identifies currency notes": [{ group: "OTHER", items: ["₹1", "₹2", "₹5", "₹10", "₹20", "₹50", "₹100", "₹200", "₹500"] }],
  "Spells simple words from dictation/independently": [{ group: "CVC", items: ["Cat", "Dog", "Sun", "Hat", "Pen", "Cup", "Bed", "Pig", "Box", "Bus"] }],

  "Follows a picture activity schedule": [{ group: "OTHER", items: ["Sequenced activity icons (per-child, generated per routine)"] }],
  "Follows multi-step classroom/home routines": [{ group: "OTHER", items: ["Morning routine: wake up, brush teeth, wash face, get dressed, eat breakfast", "Cleanup routine"] }],

  "Reduces frequency/duration of a target behavior": [{ group: "OTHER", items: ["Aggression (hitting/biting/pushing)", "Elopement/bolting", "Property destruction", "Self-injury (head-banging, hand-biting)", "Tantrums", "Non-compliance", "Screaming", "Spitting", "Disruptive vocalizations"] }],
  "Reduces self-injurious behavior": [{ group: "OTHER", items: ["Head-banging", "Hand-biting"] }],
  "Uses functional communication instead of challenging behavior": [{ group: "OTHER", items: ["Request a break", "Request help", "Request the item", "Say no/stop"] }],
  "Identifies and labels own emotions": [{ group: "OTHER", items: ["Happy", "Sad", "Angry", "Frustrated"] }],
  "Uses a coping/calming strategy when dysregulated": [{ group: "OTHER", items: ["Deep breaths", "Count to 10", "Ask for a break", "Squeeze a stress ball", "Go to a calm-down space"] }],

  "Tolerates tactile input": [{ group: "TEXTURES", items: ["Rough", "Smooth", "Sticky", "Wet", "Bumpy", "Furry"] }, { group: "MATERIALS", items: ["Sand", "Water", "Playdough", "Shaving cream", "Rice bin"] }],
  "Modulates response to auditory input": [{ group: "OTHER", items: ["Vacuum", "Blender", "Hairdryer", "Fire alarm", "Crowd noise", "Hand dryer"] }],
  "Tolerates oral-sensory input (feeding-relevant)": [{ group: "OTHER", items: ["Crunchy", "Smooth", "Chewy", "Cold", "Hot", "Sour", "Mixed-texture"] }],

  "Imitates gross motor actions on verbal instruction": [{ group: "OTHER", items: ["Jump", "Clap", "March", "Hop", "Skip", "Crawl", "Spin", "Stomp", "Raise arms", "Touch head"] }],
  "Balances": [{ group: "OTHER", items: ["Single-leg stand", "Walking a line", "Standing on one foot with eyes closed"] }],
  "Catches, throws, and kicks a ball": [{ group: "OTHER", items: ["Roll", "Throw overhand", "Throw underhand", "Catch", "Kick", "Bounce"] }],

  "Copies basic shapes and pre-writing strokes": [{ group: "OTHER", items: ["Vertical line", "Horizontal line", "Circle", "Cross", "Diagonal line", "Square"] }],
  "Cuts along a line with scissors": [{ group: "OTHER", items: ["Straight line", "Curve", "Zigzag", "Circle", "Square"] }],
  "Strings beads / manipulates small objects": [{ group: "OTHER", items: ["Beads", "Pegs", "Buttons", "Coins", "Small blocks"] }],
  "Buttons, snaps, and uses zippers": [{ group: "OTHER", items: ["Button board", "Snap toy", "Zipper jacket"] }],
  "Uses utensils with control": [{ group: "OTHER", items: ["Spoon", "Fork"] }],

  "Completes hygiene routines independently": [{ group: "OTHER", items: ["Toothbrush", "Toothpaste", "Comb", "Hairbrush", "Soap", "Towel", "Nail clipper"] }],
  "Completes meal-related tasks independently": [{ group: "OTHER", items: ["Plate", "Spoon", "Fork", "Cup", "Napkin", "Placemat"] }],
  "Dresses self fully (garments, not just fasteners)": [{ group: "OTHER", items: ["Shirt", "Pants", "Socks", "Shoes", "Jacket", "Cap", "Underwear"] }],
  "Understands and follows basic safety rules": [{ group: "OTHER", items: ["Crossing the street", "Stranger awareness", "Hot stove", "Sharp objects", "Medicine safety", "Water safety"] }],

  "Imitates gross/fine motor actions on model": [{ group: "OTHER", items: ["Clap", "Wave", "Stomp", "Jump", "Raise arms", "Touch head", "Tap table"] }],
  "Imitates oral-motor (non-speech) movements": [{ group: "OTHER", items: ["Open mouth", "Stick out tongue", "Blow", "Smile", "Pucker lips", "Puff cheeks"] }],
  "Imitates vowel and early consonant sounds (echoic)": [{ group: "VOWELS", items: ["a", "e", "i", "o", "u"] }, { group: "CONSONANTS", items: ["m", "b", "p", "d", "n"] }],
  "Imitates facial expressions": [{ group: "OTHER", items: ["Smile", "Frown", "Surprised face", "Sad face"] }]
};

// Bootstrap superadmin -- reads from env so no real credential is ever committed. Falls back to
// a fixed local-dev-only password when unset, which only matters for a throwaway local database.
async function seedSuperadmin() {
  const email = process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@pravnya.com";
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? "local-dev-only-change-me";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Superadmin ${email} already exists, skipping`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { email, name: "Superadmin", role: "SUPERADMIN", passwordHash, tenantId: null }
  });
  console.log(`Seeded superadmin ${email}`);
}

async function main() {
  await seedSuperadmin();

  const disciplineByKey = new Map<string, string>();
  for (const d of DISCIPLINES) {
    const row = await prisma.canonicalDiscipline.upsert({
      where: { key: d.key },
      update: { name: d.name },
      create: d
    });
    disciplineByKey.set(d.key, row.id);
  }
  console.log(`Seeded ${DISCIPLINES.length} disciplines`);

  const domainByKey = new Map<string, string>();
  for (const d of DOMAINS) {
    const row = await prisma.canonicalDomain.upsert({
      where: { key: d.key },
      update: { name: d.name, sortOrder: d.sortOrder },
      create: d
    });
    domainByKey.set(d.key, row.id);
  }
  console.log(`Seeded ${DOMAINS.length} domains`);

  const skillByName = new Map<string, string>();
  for (const s of SKILLS) {
    const key = `${s.domain}.${slug(s.name)}`;
    const row = await prisma.canonicalSkill.upsert({
      where: { key },
      update: {
        name: s.name,
        domainId: domainByKey.get(s.domain)!,
        defaultDisciplineId: disciplineByKey.get(s.discipline)!,
        supportsItems: s.supportsItems,
        sourceTag: s.source
      },
      create: {
        key,
        name: s.name,
        domainId: domainByKey.get(s.domain)!,
        defaultDisciplineId: disciplineByKey.get(s.discipline)!,
        supportsItems: s.supportsItems,
        sourceTag: s.source
      }
    });
    skillByName.set(s.name, row.id);
  }
  console.log(`Seeded ${SKILLS.length} skills`);

  let itemCount = 0;
  for (const [skillName, groups] of Object.entries(ITEM_BANKS)) {
    const skillId = skillByName.get(skillName);
    if (!skillId) {
      console.warn(`No skill found for item bank "${skillName}" -- skipping`);
      continue;
    }
    for (const { group, items } of groups) {
      for (const displayName of items) {
        // Key includes the group, not just the slugified display name -- otherwise case-only
        // variants in different groups of the same skill collide (e.g. uppercase "A" and
        // lowercase "a" both slugify to "a", silently dropping one set on upsert).
        const key = `${slug(group)}_${slug(displayName)}`;
        await prisma.canonicalSkillItem.upsert({
          where: { skillId_key: { skillId, key } },
          update: { displayName, semanticGroup: group },
          create: { skillId, key, displayName, semanticGroup: group }
        });
        itemCount += 1;
      }
    }
  }
  console.log(`Seeded ${itemCount} items across ${Object.keys(ITEM_BANKS).length} skill item banks`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
