// Hand-classified measurement type per real Canonical Skill (all 148, full taxonomy coverage).
// Generated once from a careful domain-by-domain review -- see chat history for the reasoning
// behind each non-obvious call. Keyed by skill id (stable); skill name kept as a comment for
// readability since ids alone aren't auditable at a glance.
//
// This is a POC-local classification, not written to the real CanonicalSkill table -- promoting
// it to production taxonomy (e.g. a measurementType column on CanonicalSkill itself) is a
// separate, deliberate decision, not a side effect of this file existing.
export type MeasurementType =
  | "TRIALS"
  | "FREQUENCY"
  | "DURATION"
  | "PERCENTAGE"
  | "PROMPT_LEVEL"
  | "YES_NO"
  | "RATING"
  | "FREE_OBSERVATION";

export const SKILL_MEASUREMENT_TYPE: Record<string, MeasurementType> = {
  // Expressive Language
  "01fcdb63-e315-4fe2-8e2d-feb3d12ac563": "TRIALS", // Accepts/rejects (protests, says no)
  "f43f7b8c-2bf3-4cd7-b206-2ded645f30f1": "TRIALS", // Answers personal/social questions
  "ffff0c85-a6dd-4f8c-a0be-cf18f635288a": "TRIALS", // Answers WH/function questions about objects
  "1218fc48-dfe2-4330-9934-c3d56a91e218": "FREQUENCY", // Asks questions to gain information
  "70952ca7-df90-4726-9ddf-fc50e755ace9": "FREQUENCY", // Initiates calling/greeting phrases for familiar people
  "8877bc05-ab54-4a45-80fa-f704532b9ab7": "TRIALS", // Labels/names familiar objects (tact)
  "bebdab97-4ac1-45a7-8993-69fa5f96c836": "FREQUENCY", // Produces spontaneous functional verbs
  "d14d8038-6ba7-4225-b660-b1d1e6341c3b": "FREQUENCY", // Requests desired items/actions/locations (mand)
  "69609a9a-8b94-4a38-9994-b6998123877c": "TRIALS", // Responds to intraverbal prompts (fill-in-the-blank, conversational)
  "1ba95257-aac4-40f7-a736-05dae485279a": "RATING", // Retells a simple sequence of events (narrative)
  "5b4b382f-fc01-408c-90b3-ff820d2169b0": "PERCENTAGE", // Uses complex sentence structures
  "b8842984-076a-444a-9c18-57096e70329c": "PERCENTAGE", // Uses descriptive language
  "c03e0c20-361c-4110-b78c-923d117522bc": "TRIALS", // Uses grammatically correct past tense
  "65910297-244e-49b2-9522-644ba4b21ee7": "TRIALS", // Uses plurals correctly
  "ecb5f312-aa2b-4653-b3ec-1ea4e0007f14": "TRIALS", // Uses prepositions expressively
  "84c222c2-df2e-436e-a18b-15ec7b0a42f6": "TRIALS", // Uses pronouns correctly
  // Executive Functioning & Attention
  "537c3f9c-e892-4ee4-a3dd-bea7221b394b": "PROMPT_LEVEL", // Adapts to changes in routine (cognitive flexibility)
  "32fe926f-862e-4c91-827b-1f60541762e1": "PERCENTAGE", // Complies with simple instructions (instructional readiness)
  "9447d794-12f5-43a4-af8d-a6dcd1e7ba10": "DURATION", // Engages productively in independent leisure
  "39ffa0d0-a2a9-4d86-8dc2-077200116c18": "PERCENTAGE", // Follows a picture activity schedule
  "319f210c-dbf5-41e0-b40f-d1a292e6718a": "PERCENTAGE", // Follows multi-step classroom/home routines
  "52104824-f1dd-4423-898c-e1f09560dfae": "PROMPT_LEVEL", // Self-monitors/checks own completed work
  "6fae8b91-be7a-4eec-9998-b340716fdd86": "DURATION", // Sustains attention and task participation
  "49e5fc43-2c46-4d69-a849-8e349d06b06a": "PROMPT_LEVEL", // Transitions between activities/settings
  // Functional Academics
  "3385e353-0ce5-48ea-8b98-34911c652c95": "TRIALS", // Answers simple comprehension questions about a short story/passage
  "e4f7cd82-7d9a-4a08-82ef-3cbdd9320dba": "TRIALS", // Compares quantities (more/less/equal)
  "8232dd4a-3a6a-49ea-b8c6-1f21c6e36551": "TRIALS", // Counts and circles quantities
  "6515a7bf-8356-4eb5-b9f8-be363e1d15ee": "TRIALS", // Demonstrates letter-sound correspondence (phonics)
  "5b78238a-d1fc-496f-9862-661b86206902": "TRIALS", // Differentiates public vs. private places
  "987d06f9-9b36-420c-add6-dab2306c28cb": "TRIALS", // Differentiates safe vs. dangerous scenarios
  "2db7a7f1-cd51-4200-bab8-ad8b764d1422": "TRIALS", // Identifies and names basic shapes
  "090bc940-14f0-43ac-b78f-2bc13dd4831c": "TRIALS", // Identifies currency notes
  "53f568a2-9568-426e-a08b-b6cafa8b3396": "TRIALS", // Identifies uppercase/lowercase letters
  "3333842e-f517-4661-83ba-9a43bd508794": "TRIALS", // Matches sight words to pictures
  "7ed57463-6056-406a-8adf-48fdf9e9cb90": "TRIALS", // Matches uppercase to lowercase letters
  "a68a642d-df8d-4ff0-9067-a25cf82e2889": "TRIALS", // Performs basic addition/subtraction
  "036f1b32-8b71-4470-88d6-fea97730e8f0": "TRIALS", // Reads sight words aloud
  "331b3956-c39f-465f-8836-75963bd033c8": "TRIALS", // Spells simple words from dictation/independently
  "d6457b45-9680-4b0a-ab0c-49fc107d7f11": "TRIALS", // Tells time functionally
  "d1aeaa7b-0cd9-41f7-8814-66ed247763cf": "PROMPT_LEVEL", // Writes/copies own name
  "a4d25caa-ee34-46b8-b9eb-31d9c97ecb81": "TRIALS", // Writes letters/numbers from dictation
  // Receptive Language
  "2f865d67-251f-4f23-9060-6965e3d9c6a1": "TRIALS", // Answers WH-questions (receptive/selection response)
  "a4bc4c08-6508-44aa-ac2c-4fa245d757d9": "TRIALS", // Follows directions with spatial/preposition concepts
  "57a0348c-d088-46c6-8f7a-460f50cf43a4": "TRIALS", // Follows verbal directions (graded by step count)
  "0cf8334d-9a17-4cf3-b5ed-9cfa2722083f": "TRIALS", // Identifies actions when named
  "19dcfc15-6108-4a47-91e3-426f7fcebb22": "TRIALS", // Identifies body parts when named
  "321b914c-0ee1-4eb2-a3e9-a11a1ed346f8": "TRIALS", // Identifies colors when named
  "91981f1c-83cf-48ae-9a5e-39990ffb5afc": "TRIALS", // Identifies emotions from facial expression/context
  "746ec6fa-002f-44cb-91b7-e7799802553a": "TRIALS", // Identifies objects by attribute
  "06ff791a-ff31-41c4-ba0a-064224c3b886": "TRIALS", // Identifies objects/pictures when named
  "e035bc0b-16f2-41ec-9395-bf7c182dc402": "TRIALS", // Understands basic possessive pronouns
  "34e1f7ac-fdf9-44b2-933c-79b340433a2a": "TRIALS", // Understands negation
  "16f88c32-f32e-4dfb-ad88-1ce3c3011be4": "TRIALS", // Understands quantity/size concepts
  "0c1cac9b-0708-4fad-9da3-453ce358da80": "TRIALS", // Understands yes/no questions
  // Auditory Processing & Listening
  "aab5f2a9-b850-4ccb-940c-e29ed04b54bd": "TRIALS", // Auditory memory for multi-item sequences
  "a98fd337-e008-4d43-9625-5ae1dbcafe45": "TRIALS", // Demonstrates phonological awareness
  "5274db3a-1175-481f-b26f-465836c5e0fc": "TRIALS", // Discriminates between speech sounds (auditory-only)
  "fe1b5b69-04ee-4c46-b3df-79a4bcc419d6": "TRIALS", // Discriminates environmental sounds from speech
  "f97d61e7-3655-40fb-996c-8c59aef4343c": "TRIALS", // Identifies common items by auditory cue alone (no visual)
  "852c132a-e364-45b1-b76c-391e10064681": "DURATION", // Listens/attends with background noise present
  "f4bc38a0-31ac-423b-85fc-df3a40402927": "TRIALS", // Localizes a sound source
  "555c999d-3736-44c6-b4e1-34a71e739fee": "TRIALS", // Tracks and listens to increasingly long sentences
  // Gross Motor & Physical Development
  "1ba1a088-bd1e-432e-bd64-fe6b9ac2ffea": "DURATION", // Balances
  "f3e1639e-22f2-48a4-80d6-372304903037": "TRIALS", // Catches, throws, and kicks a ball
  "f3014b3b-9161-41e6-9204-2b2a5cdb47d2": "PROMPT_LEVEL", // Climbs stairs with alternating feet
  "cc052553-efcc-470b-89d6-92d3e74b344e": "RATING", // Coordinates functional movement
  "ae38119b-c8d5-4cc7-b3bc-68ca77ce5347": "TRIALS", // Executes multi-step motor sequences (motor planning/praxis)
  "2e9725e3-84be-4679-a3a3-69bfb9374674": "TRIALS", // Imitates gross motor actions on verbal instruction
  "fa036808-9e11-4a28-be13-b7cc56979928": "DURATION", // Increases sitting/postural tolerance
  "2930e0c1-77ed-49b5-8802-e9d921dc547e": "TRIALS", // Jumps (in place, forward, over an obstacle)
  "3214c83d-e739-421b-bab0-59c4abadf702": "PROMPT_LEVEL", // Rides a tricycle/bicycle
  "5bd2dc08-bd10-44ec-ad22-c53782dbbbed": "RATING", // Walks/runs with age-appropriate coordination
  // Adaptive / Daily Living Skills
  "c731a453-3546-47ca-b6f8-ba3113aad527": "PROMPT_LEVEL", // Bathes/showers with decreasing support
  "f114a4e7-8add-46eb-bca7-9be1ef7e0710": "PROMPT_LEVEL", // Cares for hair
  "2f86f569-c68d-4bc1-8708-6d183a3e7ea6": "PROMPT_LEVEL", // Completes dressing tasks independently (fasteners)
  "7c14ca14-b2aa-44f7-8c25-fbc7ccda11af": "PROMPT_LEVEL", // Completes hygiene routines independently
  "4695958d-8f1b-4544-8fb5-3399e53fb430": "PROMPT_LEVEL", // Completes meal-related tasks independently
  "ae23d6e9-f86e-4188-978e-49000145d12e": "YES_NO", // Completes toileting routine independently
  "008a3cfc-f25d-4a90-969e-6383f3ddae2a": "PROMPT_LEVEL", // Dresses self fully (garments, not just fasteners)
  "3a0073fb-22d7-4940-be46-87cd7ca5e97e": "PROMPT_LEVEL", // Drinks from an open cup
  "06e2cc55-9582-4f8a-954f-11a17d056743": "PROMPT_LEVEL", // Eats independently with utensils
  "06559696-0d9f-48f9-83f1-8ec65465f15e": "PROMPT_LEVEL", // Opens food packaging independently
  "fe9081c4-8f61-45af-868a-ab1c9bb42822": "TRIALS", // Understands and follows basic safety rules
  // Cognitive & Pre-Academic Skills
  "f3cab504-f696-4bbc-ad92-19299b331041": "TRIALS", // Builds block/pattern constructions from a model
  "5a59ed2f-a9b3-4454-bea6-eee77f67870b": "PROMPT_LEVEL", // Completes puzzles/form boards
  "b31420cc-5c8b-411d-abc4-c857fb398684": "TRIALS", // Discriminates size, shape, and color concepts
  "c4b00e60-e0fb-4d42-883b-10a8880bbeb4": "TRIALS", // Matches associated pictures (non-identical, related concept)
  "c0a998cf-9e42-4efb-b07b-35e1bc7ad5ee": "TRIALS", // Matches identical pictures/objects (visual matching-to-sample)
  "08b54d34-af73-4dcf-a4d7-f3a981ca44d9": "TRIALS", // Sequences pictures/events in order
  "6cdfbeb3-6ca5-4f18-923e-59c5ac4d6728": "TRIALS", // Sorts/categorizes by attribute or class
  "8fe6077a-0565-4ac5-a990-7671528cf9be": "TRIALS", // Understands cause-and-effect
  // Fine Motor Skills
  "495145ad-72fb-4065-a914-154354ed8170": "PROMPT_LEVEL", // Builds with blocks / stacks
  "e884418e-c78c-4afe-a9cc-2cc4928d0931": "PROMPT_LEVEL", // Buttons, snaps, and uses zippers
  "9e3bdd6c-a4d9-451f-b978-acc2e34e65a5": "PROMPT_LEVEL", // Completes pegboards and inset puzzles
  "f51a79f6-ec4b-4c12-b351-b24b7b7f8509": "RATING", // Copies basic shapes and pre-writing strokes
  "a92d618f-faec-43b6-826d-6fc82947dfac": "RATING", // Cuts along a line with scissors
  "52165b12-f7c0-4127-89e8-3f26caecb321": "PROMPT_LEVEL", // In-hand manipulation of small objects
  "551ffd8a-e27b-4344-a2fc-8bd86241267c": "TRIALS", // Strings beads / manipulates small objects
  "1683c391-079d-4e98-805b-db0ae03726a8": "PROMPT_LEVEL", // Turns pages of a book
  "6ef42f6a-76c8-4d3b-9ce4-eef4ac05ca64": "RATING", // Uses a functional pencil/crayon grasp
  "1336c624-9ad1-4548-8466-767cb090e911": "PROMPT_LEVEL", // Uses utensils with control
  // Speech Production & Articulation
  "20bad943-469a-46ed-8e19-e8b680f5126a": "TRIALS", // Contrasts voiced/voiceless sound pairs
  "f8d15ce6-c4da-4e2d-a9e2-12338324aed7": "RATING", // Controls vocal parameters (volume, pitch, rate)
  "32aa168b-50a1-459c-b857-76641e58f646": "PERCENTAGE", // Maintains fluent speech (reduces disfluency)
  "ae95b80f-6993-432b-925d-77409a6e8577": "PERCENTAGE", // Maintains target sound in connected/spontaneous speech
  "8c69363d-446c-44d3-aa3e-ad7696d73ea9": "RATING", // Oral-motor strength & mobility (jaw/lip/tongue)
  "58406d86-0812-4e29-a7bd-f41cfd051778": "TRIALS", // Produces target sound in isolation
  "ebbe87df-24d7-45b0-9169-a142f09f6639": "TRIALS", // Produces target sound in phrases and sentences
  "dc32667a-85ea-4ebf-8375-57c0039392a2": "TRIALS", // Produces target sound in syllables (CV/VC)
  "d781481d-a17a-4f43-8a76-5bfd3572840c": "TRIALS", // Produces target sound in words (initial/medial/final)
  "236150fe-4a65-4b88-a918-0bf5cfb58613": "PERCENTAGE", // Reduces a specific phonological process
  // Social Communication & Pragmatics
  "3a8084da-10dd-41df-862e-627019319ea7": "TRIALS", // Differentiates socially appropriate ("cool") vs. inappropriate behavior
  "9cb5bca8-3121-4750-aace-fe7f4be1c167": "DURATION", // Engages in cooperative play with peers
  "40cea645-85fa-419e-88b7-d426e322356d": "DURATION", // Engages in functional/appropriate toy play
  "fdcef1b7-9bba-48c1-bdcc-b14c9081f144": "DURATION", // Engages in guided play and peer interaction
  "e65e2522-c4ca-45f1-8b29-0dacefd29ce2": "DURATION", // Engages in independent leisure
  "873a5d40-e908-458a-a41b-4eeca1c51cfc": "DURATION", // Engages in parallel play
  "5235bb3c-ebef-4f5c-a37b-f9efd30327ff": "DURATION", // Engages in pretend/symbolic play
  "a7e710b1-ddb0-4109-b5dc-6f9500faa7f9": "FREQUENCY", // Initiates and responds to joint attention
  "63115129-95e5-4b59-8757-d0c56d99cb70": "FREQUENCY", // Initiates interaction with peers
  "40d05ba9-468e-483b-a5ab-a0ad78808fce": "FREQUENCY", // Responds to / initiates greetings
  "b39f717b-1252-42ca-96e1-b032c7fec2f3": "FREQUENCY", // Shares and takes turns with toys/materials
  "706b37d4-0dff-4520-8ae2-382836727b5b": "TRIALS", // Takes turns with a familiar partner
  "66ee4e16-6391-4dad-8941-b514783cbf5b": "DURATION", // Tolerates group settings
  "59a8bb87-8c76-445e-833c-8181eb233803": "DURATION", // Uses appropriate eye contact and non-verbal social cues
  // Sensory Processing
  "86e20d61-6fb4-4988-a0c2-32fc62edf7bb": "TRIALS", // Discriminates sensory input
  "a79b0784-25f7-4bc2-a93b-479c32371fb8": "RATING", // Improves sensory registration and responsiveness
  "9649a6c4-a189-47fa-88c0-b2d5b2c7c1a8": "DURATION", // Meets vestibular and proprioceptive input needs
  "6b040a94-5474-4fd8-b549-c3fc377455bf": "RATING", // Modulates response to auditory input
  "8abe3458-3032-4460-9559-c71aceae9a23": "DURATION", // Self-regulates via structured sensory-motor input
  "dd8ad0d0-af73-4e8a-b8aa-8ffea26bae6a": "RATING", // Tolerates oral-sensory input (feeding-relevant)
  "db0e68dd-d500-4326-ab4c-347c989e78de": "RATING", // Tolerates tactile input
  // Behavior & Self-Regulation
  "a594eb7e-3d76-4520-809f-9fa973e87dfb": "TRIALS", // Identifies and labels own emotions
  "8174d6e7-8a26-4cda-9f69-7aacce4792b5": "PERCENTAGE", // Increases compliance with adult instructions
  "0d48de68-1336-4cc1-b8f7-2e41596054a2": "FREQUENCY", // Reduces elopement (beyond "bolting")
  "b519ab1e-4d6d-49ff-ab78-2e6d5a82f2b7": "FREQUENCY", // Reduces frequency/duration of a target behavior
  "d78976ef-fd8e-4eb4-b2bb-e446f7eec9f6": "FREQUENCY", // Reduces property destruction
  "12da9150-a365-4f6c-b914-b1c66fa39570": "FREQUENCY", // Reduces self-injurious behavior
  "cf1232d5-4ee8-470b-a1d3-1ad2a5582357": "DURATION", // Tolerates denied access / waits for preferred items
  "4f23016e-176a-4bee-a3fe-be598cbf3ec3": "RATING", // Tolerates transitions/changes in routine without challenging behavior
  "d0fe8dfd-ff93-484a-989a-9d1ddd98020b": "FREQUENCY", // Uses a coping/calming strategy when dysregulated
  "eb4873c3-fdc5-4125-ac29-2dbafe98c247": "FREQUENCY", // Uses functional communication instead of challenging behavior
  // Imitation & Foundational Learning Skills
  "48dc3998-1934-41cd-8ec8-42112e3090b5": "TRIALS", // Imitates facial expressions
  "46416d4d-c4b0-4f5d-af73-31b7275eaa57": "TRIALS", // Imitates gross/fine motor actions on model
  "870de99f-c30e-470d-9c25-fc80276e20f6": "TRIALS", // Imitates oral-motor (non-speech) movements
  "13ffd55f-9a5a-4659-b8b7-49bfc23edb6c": "TRIALS", // Imitates two-step action sequences
  "ed590a50-c000-4af7-b133-55c71658c819": "TRIALS", // Imitates vowel and early consonant sounds (echoic)
  "175e0323-e70c-4d3f-a708-f580b376b389": "FREQUENCY", // Produces spontaneous pre-verbal vocalizations
};
