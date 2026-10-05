-- AlterTable
ALTER TABLE "CanonicalSkill" ADD COLUMN     "measurementType" "PocMeasurementType";


-- Data migration: backfill measurementType for all 148 real skills from the validated
-- L12 AI-tagging POC classification (tools/l12-poc-tagging/scripts/skill-measurement-types.ts).
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '01fcdb63-e315-4fe2-8e2d-feb3d12ac563'; -- Accepts/rejects (protests, says no)
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'f43f7b8c-2bf3-4cd7-b206-2ded645f30f1'; -- Answers personal/social questions
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'ffff0c85-a6dd-4f8c-a0be-cf18f635288a'; -- Answers WH/function questions about objects
UPDATE "CanonicalSkill" SET "measurementType" = 'FREQUENCY' WHERE id = '1218fc48-dfe2-4330-9934-c3d56a91e218'; -- Asks questions to gain information
UPDATE "CanonicalSkill" SET "measurementType" = 'FREQUENCY' WHERE id = '70952ca7-df90-4726-9ddf-fc50e755ace9'; -- Initiates calling/greeting phrases for familiar people
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '8877bc05-ab54-4a45-80fa-f704532b9ab7'; -- Labels/names familiar objects (tact)
UPDATE "CanonicalSkill" SET "measurementType" = 'FREQUENCY' WHERE id = 'bebdab97-4ac1-45a7-8993-69fa5f96c836'; -- Produces spontaneous functional verbs
UPDATE "CanonicalSkill" SET "measurementType" = 'FREQUENCY' WHERE id = 'd14d8038-6ba7-4225-b660-b1d1e6341c3b'; -- Requests desired items/actions/locations (mand)
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '69609a9a-8b94-4a38-9994-b6998123877c'; -- Responds to intraverbal prompts (fill-in-the-blank, conversational)
UPDATE "CanonicalSkill" SET "measurementType" = 'RATING' WHERE id = '1ba95257-aac4-40f7-a736-05dae485279a'; -- Retells a simple sequence of events (narrative)
UPDATE "CanonicalSkill" SET "measurementType" = 'PERCENTAGE' WHERE id = '5b4b382f-fc01-408c-90b3-ff820d2169b0'; -- Uses complex sentence structures
UPDATE "CanonicalSkill" SET "measurementType" = 'PERCENTAGE' WHERE id = 'b8842984-076a-444a-9c18-57096e70329c'; -- Uses descriptive language
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'c03e0c20-361c-4110-b78c-923d117522bc'; -- Uses grammatically correct past tense
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '65910297-244e-49b2-9522-644ba4b21ee7'; -- Uses plurals correctly
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'ecb5f312-aa2b-4653-b3ec-1ea4e0007f14'; -- Uses prepositions expressively
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '84c222c2-df2e-436e-a18b-15ec7b0a42f6'; -- Uses pronouns correctly
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '537c3f9c-e892-4ee4-a3dd-bea7221b394b'; -- Adapts to changes in routine (cognitive flexibility)
UPDATE "CanonicalSkill" SET "measurementType" = 'PERCENTAGE' WHERE id = '32fe926f-862e-4c91-827b-1f60541762e1'; -- Complies with simple instructions (instructional readiness)
UPDATE "CanonicalSkill" SET "measurementType" = 'DURATION' WHERE id = '9447d794-12f5-43a4-af8d-a6dcd1e7ba10'; -- Engages productively in independent leisure
UPDATE "CanonicalSkill" SET "measurementType" = 'PERCENTAGE' WHERE id = '39ffa0d0-a2a9-4d86-8dc2-077200116c18'; -- Follows a picture activity schedule
UPDATE "CanonicalSkill" SET "measurementType" = 'PERCENTAGE' WHERE id = '319f210c-dbf5-41e0-b40f-d1a292e6718a'; -- Follows multi-step classroom/home routines
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '52104824-f1dd-4423-898c-e1f09560dfae'; -- Self-monitors/checks own completed work
UPDATE "CanonicalSkill" SET "measurementType" = 'DURATION' WHERE id = '6fae8b91-be7a-4eec-9998-b340716fdd86'; -- Sustains attention and task participation
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '49e5fc43-2c46-4d69-a849-8e349d06b06a'; -- Transitions between activities/settings
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '3385e353-0ce5-48ea-8b98-34911c652c95'; -- Answers simple comprehension questions about a short story/passage
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'e4f7cd82-7d9a-4a08-82ef-3cbdd9320dba'; -- Compares quantities (more/less/equal)
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '8232dd4a-3a6a-49ea-b8c6-1f21c6e36551'; -- Counts and circles quantities
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '6515a7bf-8356-4eb5-b9f8-be363e1d15ee'; -- Demonstrates letter-sound correspondence (phonics)
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '5b78238a-d1fc-496f-9862-661b86206902'; -- Differentiates public vs. private places
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '987d06f9-9b36-420c-add6-dab2306c28cb'; -- Differentiates safe vs. dangerous scenarios
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '2db7a7f1-cd51-4200-bab8-ad8b764d1422'; -- Identifies and names basic shapes
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '090bc940-14f0-43ac-b78f-2bc13dd4831c'; -- Identifies currency notes
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '53f568a2-9568-426e-a08b-b6cafa8b3396'; -- Identifies uppercase/lowercase letters
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '3333842e-f517-4661-83ba-9a43bd508794'; -- Matches sight words to pictures
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '7ed57463-6056-406a-8adf-48fdf9e9cb90'; -- Matches uppercase to lowercase letters
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'a68a642d-df8d-4ff0-9067-a25cf82e2889'; -- Performs basic addition/subtraction
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '036f1b32-8b71-4470-88d6-fea97730e8f0'; -- Reads sight words aloud
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '331b3956-c39f-465f-8836-75963bd033c8'; -- Spells simple words from dictation/independently
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'd6457b45-9680-4b0a-ab0c-49fc107d7f11'; -- Tells time functionally
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = 'd1aeaa7b-0cd9-41f7-8814-66ed247763cf'; -- Writes/copies own name
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'a4d25caa-ee34-46b8-b9eb-31d9c97ecb81'; -- Writes letters/numbers from dictation
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '2f865d67-251f-4f23-9060-6965e3d9c6a1'; -- Answers WH-questions (receptive/selection response)
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'a4bc4c08-6508-44aa-ac2c-4fa245d757d9'; -- Follows directions with spatial/preposition concepts
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '57a0348c-d088-46c6-8f7a-460f50cf43a4'; -- Follows verbal directions (graded by step count)
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '0cf8334d-9a17-4cf3-b5ed-9cfa2722083f'; -- Identifies actions when named
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '19dcfc15-6108-4a47-91e3-426f7fcebb22'; -- Identifies body parts when named
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '321b914c-0ee1-4eb2-a3e9-a11a1ed346f8'; -- Identifies colors when named
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '91981f1c-83cf-48ae-9a5e-39990ffb5afc'; -- Identifies emotions from facial expression/context
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '746ec6fa-002f-44cb-91b7-e7799802553a'; -- Identifies objects by attribute
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '06ff791a-ff31-41c4-ba0a-064224c3b886'; -- Identifies objects/pictures when named
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'e035bc0b-16f2-41ec-9395-bf7c182dc402'; -- Understands basic possessive pronouns
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '34e1f7ac-fdf9-44b2-933c-79b340433a2a'; -- Understands negation
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '16f88c32-f32e-4dfb-ad88-1ce3c3011be4'; -- Understands quantity/size concepts
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '0c1cac9b-0708-4fad-9da3-453ce358da80'; -- Understands yes/no questions
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'aab5f2a9-b850-4ccb-940c-e29ed04b54bd'; -- Auditory memory for multi-item sequences
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'a98fd337-e008-4d43-9625-5ae1dbcafe45'; -- Demonstrates phonological awareness
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '5274db3a-1175-481f-b26f-465836c5e0fc'; -- Discriminates between speech sounds (auditory-only)
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'fe1b5b69-04ee-4c46-b3df-79a4bcc419d6'; -- Discriminates environmental sounds from speech
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'f97d61e7-3655-40fb-996c-8c59aef4343c'; -- Identifies common items by auditory cue alone (no visual)
UPDATE "CanonicalSkill" SET "measurementType" = 'DURATION' WHERE id = '852c132a-e364-45b1-b76c-391e10064681'; -- Listens/attends with background noise present
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'f4bc38a0-31ac-423b-85fc-df3a40402927'; -- Localizes a sound source
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '555c999d-3736-44c6-b4e1-34a71e739fee'; -- Tracks and listens to increasingly long sentences
UPDATE "CanonicalSkill" SET "measurementType" = 'DURATION' WHERE id = '1ba1a088-bd1e-432e-bd64-fe6b9ac2ffea'; -- Balances
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'f3e1639e-22f2-48a4-80d6-372304903037'; -- Catches, throws, and kicks a ball
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = 'f3014b3b-9161-41e6-9204-2b2a5cdb47d2'; -- Climbs stairs with alternating feet
UPDATE "CanonicalSkill" SET "measurementType" = 'RATING' WHERE id = 'cc052553-efcc-470b-89d6-92d3e74b344e'; -- Coordinates functional movement
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'ae38119b-c8d5-4cc7-b3bc-68ca77ce5347'; -- Executes multi-step motor sequences (motor planning/praxis)
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '2e9725e3-84be-4679-a3a3-69bfb9374674'; -- Imitates gross motor actions on verbal instruction
UPDATE "CanonicalSkill" SET "measurementType" = 'DURATION' WHERE id = 'fa036808-9e11-4a28-be13-b7cc56979928'; -- Increases sitting/postural tolerance
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '2930e0c1-77ed-49b5-8802-e9d921dc547e'; -- Jumps (in place, forward, over an obstacle)
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '3214c83d-e739-421b-bab0-59c4abadf702'; -- Rides a tricycle/bicycle
UPDATE "CanonicalSkill" SET "measurementType" = 'RATING' WHERE id = '5bd2dc08-bd10-44ec-ad22-c53782dbbbed'; -- Walks/runs with age-appropriate coordination
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = 'c731a453-3546-47ca-b6f8-ba3113aad527'; -- Bathes/showers with decreasing support
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = 'f114a4e7-8add-46eb-bca7-9be1ef7e0710'; -- Cares for hair
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '2f86f569-c68d-4bc1-8708-6d183a3e7ea6'; -- Completes dressing tasks independently (fasteners)
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '7c14ca14-b2aa-44f7-8c25-fbc7ccda11af'; -- Completes hygiene routines independently
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '4695958d-8f1b-4544-8fb5-3399e53fb430'; -- Completes meal-related tasks independently
UPDATE "CanonicalSkill" SET "measurementType" = 'YES_NO' WHERE id = 'ae23d6e9-f86e-4188-978e-49000145d12e'; -- Completes toileting routine independently
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '008a3cfc-f25d-4a90-969e-6383f3ddae2a'; -- Dresses self fully (garments, not just fasteners)
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '3a0073fb-22d7-4940-be46-87cd7ca5e97e'; -- Drinks from an open cup
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '06e2cc55-9582-4f8a-954f-11a17d056743'; -- Eats independently with utensils
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '06559696-0d9f-48f9-83f1-8ec65465f15e'; -- Opens food packaging independently
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'fe9081c4-8f61-45af-868a-ab1c9bb42822'; -- Understands and follows basic safety rules
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'f3cab504-f696-4bbc-ad92-19299b331041'; -- Builds block/pattern constructions from a model
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '5a59ed2f-a9b3-4454-bea6-eee77f67870b'; -- Completes puzzles/form boards
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'b31420cc-5c8b-411d-abc4-c857fb398684'; -- Discriminates size, shape, and color concepts
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'c4b00e60-e0fb-4d42-883b-10a8880bbeb4'; -- Matches associated pictures (non-identical, related concept)
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'c0a998cf-9e42-4efb-b07b-35e1bc7ad5ee'; -- Matches identical pictures/objects (visual matching-to-sample)
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '08b54d34-af73-4dcf-a4d7-f3a981ca44d9'; -- Sequences pictures/events in order
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '6cdfbeb3-6ca5-4f18-923e-59c5ac4d6728'; -- Sorts/categorizes by attribute or class
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '8fe6077a-0565-4ac5-a990-7671528cf9be'; -- Understands cause-and-effect
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '495145ad-72fb-4065-a914-154354ed8170'; -- Builds with blocks / stacks
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = 'e884418e-c78c-4afe-a9cc-2cc4928d0931'; -- Buttons, snaps, and uses zippers
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '9e3bdd6c-a4d9-451f-b978-acc2e34e65a5'; -- Completes pegboards and inset puzzles
UPDATE "CanonicalSkill" SET "measurementType" = 'RATING' WHERE id = 'f51a79f6-ec4b-4c12-b351-b24b7b7f8509'; -- Copies basic shapes and pre-writing strokes
UPDATE "CanonicalSkill" SET "measurementType" = 'RATING' WHERE id = 'a92d618f-faec-43b6-826d-6fc82947dfac'; -- Cuts along a line with scissors
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '52165b12-f7c0-4127-89e8-3f26caecb321'; -- In-hand manipulation of small objects
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '551ffd8a-e27b-4344-a2fc-8bd86241267c'; -- Strings beads / manipulates small objects
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '1683c391-079d-4e98-805b-db0ae03726a8'; -- Turns pages of a book
UPDATE "CanonicalSkill" SET "measurementType" = 'RATING' WHERE id = '6ef42f6a-76c8-4d3b-9ce4-eef4ac05ca64'; -- Uses a functional pencil/crayon grasp
UPDATE "CanonicalSkill" SET "measurementType" = 'PROMPT_LEVEL' WHERE id = '1336c624-9ad1-4548-8466-767cb090e911'; -- Uses utensils with control
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '20bad943-469a-46ed-8e19-e8b680f5126a'; -- Contrasts voiced/voiceless sound pairs
UPDATE "CanonicalSkill" SET "measurementType" = 'RATING' WHERE id = 'f8d15ce6-c4da-4e2d-a9e2-12338324aed7'; -- Controls vocal parameters (volume, pitch, rate)
UPDATE "CanonicalSkill" SET "measurementType" = 'PERCENTAGE' WHERE id = '32aa168b-50a1-459c-b857-76641e58f646'; -- Maintains fluent speech (reduces disfluency)
UPDATE "CanonicalSkill" SET "measurementType" = 'PERCENTAGE' WHERE id = 'ae95b80f-6993-432b-925d-77409a6e8577'; -- Maintains target sound in connected/spontaneous speech
UPDATE "CanonicalSkill" SET "measurementType" = 'RATING' WHERE id = '8c69363d-446c-44d3-aa3e-ad7696d73ea9'; -- Oral-motor strength & mobility (jaw/lip/tongue)
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '58406d86-0812-4e29-a7bd-f41cfd051778'; -- Produces target sound in isolation
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'ebbe87df-24d7-45b0-9169-a142f09f6639'; -- Produces target sound in phrases and sentences
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'dc32667a-85ea-4ebf-8375-57c0039392a2'; -- Produces target sound in syllables (CV/VC)
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'd781481d-a17a-4f43-8a76-5bfd3572840c'; -- Produces target sound in words (initial/medial/final)
UPDATE "CanonicalSkill" SET "measurementType" = 'PERCENTAGE' WHERE id = '236150fe-4a65-4b88-a918-0bf5cfb58613'; -- Reduces a specific phonological process
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '3a8084da-10dd-41df-862e-627019319ea7'; -- Differentiates socially appropriate ("cool") vs. inappropriate behavior
UPDATE "CanonicalSkill" SET "measurementType" = 'DURATION' WHERE id = '9cb5bca8-3121-4750-aace-fe7f4be1c167'; -- Engages in cooperative play with peers
UPDATE "CanonicalSkill" SET "measurementType" = 'DURATION' WHERE id = '40cea645-85fa-419e-88b7-d426e322356d'; -- Engages in functional/appropriate toy play
UPDATE "CanonicalSkill" SET "measurementType" = 'DURATION' WHERE id = 'fdcef1b7-9bba-48c1-bdcc-b14c9081f144'; -- Engages in guided play and peer interaction
UPDATE "CanonicalSkill" SET "measurementType" = 'DURATION' WHERE id = 'e65e2522-c4ca-45f1-8b29-0dacefd29ce2'; -- Engages in independent leisure
UPDATE "CanonicalSkill" SET "measurementType" = 'DURATION' WHERE id = '873a5d40-e908-458a-a41b-4eeca1c51cfc'; -- Engages in parallel play
UPDATE "CanonicalSkill" SET "measurementType" = 'DURATION' WHERE id = '5235bb3c-ebef-4f5c-a37b-f9efd30327ff'; -- Engages in pretend/symbolic play
UPDATE "CanonicalSkill" SET "measurementType" = 'FREQUENCY' WHERE id = 'a7e710b1-ddb0-4109-b5dc-6f9500faa7f9'; -- Initiates and responds to joint attention
UPDATE "CanonicalSkill" SET "measurementType" = 'FREQUENCY' WHERE id = '63115129-95e5-4b59-8757-d0c56d99cb70'; -- Initiates interaction with peers
UPDATE "CanonicalSkill" SET "measurementType" = 'FREQUENCY' WHERE id = '40d05ba9-468e-483b-a5ab-a0ad78808fce'; -- Responds to / initiates greetings
UPDATE "CanonicalSkill" SET "measurementType" = 'FREQUENCY' WHERE id = 'b39f717b-1252-42ca-96e1-b032c7fec2f3'; -- Shares and takes turns with toys/materials
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '706b37d4-0dff-4520-8ae2-382836727b5b'; -- Takes turns with a familiar partner
UPDATE "CanonicalSkill" SET "measurementType" = 'DURATION' WHERE id = '66ee4e16-6391-4dad-8941-b514783cbf5b'; -- Tolerates group settings
UPDATE "CanonicalSkill" SET "measurementType" = 'DURATION' WHERE id = '59a8bb87-8c76-445e-833c-8181eb233803'; -- Uses appropriate eye contact and non-verbal social cues
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '86e20d61-6fb4-4988-a0c2-32fc62edf7bb'; -- Discriminates sensory input
UPDATE "CanonicalSkill" SET "measurementType" = 'RATING' WHERE id = 'a79b0784-25f7-4bc2-a93b-479c32371fb8'; -- Improves sensory registration and responsiveness
UPDATE "CanonicalSkill" SET "measurementType" = 'DURATION' WHERE id = '9649a6c4-a189-47fa-88c0-b2d5b2c7c1a8'; -- Meets vestibular and proprioceptive input needs
UPDATE "CanonicalSkill" SET "measurementType" = 'RATING' WHERE id = '6b040a94-5474-4fd8-b549-c3fc377455bf'; -- Modulates response to auditory input
UPDATE "CanonicalSkill" SET "measurementType" = 'DURATION' WHERE id = '8abe3458-3032-4460-9559-c71aceae9a23'; -- Self-regulates via structured sensory-motor input
UPDATE "CanonicalSkill" SET "measurementType" = 'RATING' WHERE id = 'dd8ad0d0-af73-4e8a-b8aa-8ffea26bae6a'; -- Tolerates oral-sensory input (feeding-relevant)
UPDATE "CanonicalSkill" SET "measurementType" = 'RATING' WHERE id = 'db0e68dd-d500-4326-ab4c-347c989e78de'; -- Tolerates tactile input
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'a594eb7e-3d76-4520-809f-9fa973e87dfb'; -- Identifies and labels own emotions
UPDATE "CanonicalSkill" SET "measurementType" = 'PERCENTAGE' WHERE id = '8174d6e7-8a26-4cda-9f69-7aacce4792b5'; -- Increases compliance with adult instructions
UPDATE "CanonicalSkill" SET "measurementType" = 'FREQUENCY' WHERE id = '0d48de68-1336-4cc1-b8f7-2e41596054a2'; -- Reduces elopement (beyond "bolting")
UPDATE "CanonicalSkill" SET "measurementType" = 'FREQUENCY' WHERE id = 'b519ab1e-4d6d-49ff-ab78-2e6d5a82f2b7'; -- Reduces frequency/duration of a target behavior
UPDATE "CanonicalSkill" SET "measurementType" = 'FREQUENCY' WHERE id = 'd78976ef-fd8e-4eb4-b2bb-e446f7eec9f6'; -- Reduces property destruction
UPDATE "CanonicalSkill" SET "measurementType" = 'FREQUENCY' WHERE id = '12da9150-a365-4f6c-b914-b1c66fa39570'; -- Reduces self-injurious behavior
UPDATE "CanonicalSkill" SET "measurementType" = 'DURATION' WHERE id = 'cf1232d5-4ee8-470b-a1d3-1ad2a5582357'; -- Tolerates denied access / waits for preferred items
UPDATE "CanonicalSkill" SET "measurementType" = 'RATING' WHERE id = '4f23016e-176a-4bee-a3fe-be598cbf3ec3'; -- Tolerates transitions/changes in routine without challenging behavior
UPDATE "CanonicalSkill" SET "measurementType" = 'FREQUENCY' WHERE id = 'd0fe8dfd-ff93-484a-989a-9d1ddd98020b'; -- Uses a coping/calming strategy when dysregulated
UPDATE "CanonicalSkill" SET "measurementType" = 'FREQUENCY' WHERE id = 'eb4873c3-fdc5-4125-ac29-2dbafe98c247'; -- Uses functional communication instead of challenging behavior
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '48dc3998-1934-41cd-8ec8-42112e3090b5'; -- Imitates facial expressions
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '46416d4d-c4b0-4f5d-af73-31b7275eaa57'; -- Imitates gross/fine motor actions on model
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '870de99f-c30e-470d-9c25-fc80276e20f6'; -- Imitates oral-motor (non-speech) movements
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = '13ffd55f-9a5a-4659-b8b7-49bfc23edb6c'; -- Imitates two-step action sequences
UPDATE "CanonicalSkill" SET "measurementType" = 'TRIALS' WHERE id = 'ed590a50-c000-4af7-b133-55c71658c819'; -- Imitates vowel and early consonant sounds (echoic)
UPDATE "CanonicalSkill" SET "measurementType" = 'FREQUENCY' WHERE id = '175e0323-e70c-4d3f-a708-f580b376b389'; -- Produces spontaneous pre-verbal vocalizations
