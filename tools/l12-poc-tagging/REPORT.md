# L12 AI-Tagging POC -- Results Summary
Generated: 2026-10-01T14:18:28.453Z

## Goal -> Canonical Skill tagging
Run #4 (gemini), 2026-10-01T13:45:39.867Z -> 2026-10-01T13:47:10.701Z
Total goals in snapshot: 103
Processed: 103, succeeded: 103, failed: 0

- Tagged with a skill: 100 (97%)
- No reasonable match found: 3 (3%)
- Errored: 0

Confidence distribution (tagged only): {"0.9-1.0":83,"0.75-0.9":17,"0.5-0.75":0,"<0.5":0,"null":0}

Top 10 most-tagged skills:
  7x  Requests desired items/actions/locations (mand)
  5x  Oral-motor strength & mobility (jaw/lip/tongue)
  4x  Reduces frequency/duration of a target behavior
  4x  Identifies objects/pictures when named
  3x  Labels/names familiar objects (tact)
  3x  Produces target sound in syllables (CV/VC)
  3x  Maintains target sound in connected/spontaneous speech
  3x  Uses grammatically correct past tense
  3x  Produces target sound in phrases and sentences
  2x  Identifies uppercase/lowercase letters

Skills with ZERO goal coverage across these 103 real goals: 88 / 148
(Not necessarily a gap -- these two kids' goals don't have to span the whole taxonomy. Worth a skim, not a verdict.)

Sample "no match" rationale (first 5, titles omitted -- see DB for full detail if needed):
  - The goal targets labeling/tacting actions (verbs) using an AAC device when presented with a picture prompt. The taxonomy contains 'Labels/names familiar objects (tact)' and 'Identifies actions when named' (receptive), but lacks a canonical skill for expressively labeling/naming actions or verbs.
  - The goal spans multiple distinct levels of the articulation hierarchy simultaneously (syllables, word chains/words, and sound-loaded phrases) within a motor-drill framework, so it does not cleanly match any single granular skill in the taxonomy (such as syllables, words, or phrases).
  - The goal targets the production of multiple residual speech sound errors (/th/, /n/, /l/, /r/, /s/) during structured speech tasks. The candidate articulation skills are strictly divided by linguistic hierarchy level (isolation, syllables, words, phrases/sentences, connected speech), none of which is specified in the goal text.

## Daily Log -> Skill Evidence extraction
Run #6 (gemini), 2026-10-01T13:53:28.700Z -> 2026-10-01T14:18:20.057Z
Total logs in snapshot: 673
Processed: 673, succeeded: 671, failed: 2
Logs with >=1 extracted evidence item: 558 (83% of successfully processed logs)
Total evidence rows extracted: 840 (avg 1.5 per log that had any)

Confidence distribution: {"0.9-1.0":395,"0.75-0.9":414,"0.5-0.75":31,"<0.5":0,"null":0}

Outcome distribution: {"partial":156,"correct":454,"incorrect":20,"unknown":49,"attempted":160,"not_observed":1}
Support-level distribution: {"unknown":526,"verbal_prompt":110,"independent":186,"partial_assistance":14,"visual_prompt":2,"physical_prompt":2}

Top 10 skills by evidence volume:
  70x  Produces target sound in words (initial/medial/final)
  64x  Identifies objects/pictures when named
  45x  Sustains attention and task participation
  40x  Coordinates functional movement
  35x  Requests desired items/actions/locations (mand)
  31x  Produces target sound in phrases and sentences
  30x  Labels/names familiar objects (tact)
  29x  Uses appropriate eye contact and non-verbal social cues
  26x  Catches, throws, and kicks a ball
  19x  Identifies actions when named

## Cross-check: log evidence vs. the goal it's explicitly linked to
334 logs are explicitly linked to a goal that was successfully tagged.
  - Agree (log evidence includes the linked goal's own tagged skill): 89
  - Disagree (log has evidence, but for different skill(s) than the linked goal): 217
  - No evidence extracted from the log at all: 28
This is the closest thing to a ground-truth check available without manual labeling --
a log explicitly tied to goal X should usually surface evidence for X's own skill.