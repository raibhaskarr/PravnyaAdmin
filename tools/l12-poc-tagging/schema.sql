-- L12 AI-tagging POC schema (SQLite). Local-only, disposable -- see README.md.
-- Two groups of tables: snapshots of real source data (read-only once loaded),
-- and AI-derived output (safe to wipe and regenerate on every prompt iteration).

-- ── Source snapshots (loaded once from the decrypted JSON extracts) ─────────

CREATE TABLE IF NOT EXISTS poc_source_goals (
  id TEXT PRIMARY KEY,                 -- IEPGoal.id
  child_id TEXT NOT NULL,
  domain_name TEXT,
  category TEXT,
  title TEXT NOT NULL,
  description TEXT,                    -- decrypted free text
  target_behavior TEXT,
  measurement_method TEXT,
  status TEXT
);

CREATE TABLE IF NOT EXISTS poc_source_logs (
  id TEXT PRIMARY KEY,                 -- DailyLog.id
  child_id TEXT NOT NULL,
  log_date TEXT,
  category TEXT,
  source TEXT,
  free_text TEXT NOT NULL,             -- decrypted free text
  linked_iep_goal_id TEXT,
  capture_intent TEXT
);

CREATE TABLE IF NOT EXISTS poc_taxonomy_skills (
  id TEXT PRIMARY KEY,                 -- CanonicalSkill.id (PravnyaAdmin)
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  domain_name TEXT NOT NULL,
  default_discipline_name TEXT,
  supports_items INTEGER NOT NULL DEFAULT 0,
  supported_modalities TEXT            -- JSON array, e.g. ["VERBAL","AAC"]
);

CREATE TABLE IF NOT EXISTS poc_taxonomy_skill_items (
  id TEXT PRIMARY KEY,                 -- CanonicalSkillItem.id
  skill_id TEXT NOT NULL REFERENCES poc_taxonomy_skills(id),
  key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  semantic_group TEXT
);

-- ── AI-derived output (wiped and regenerated on every prompt iteration) ─────

CREATE TABLE IF NOT EXISTS poc_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_type TEXT NOT NULL,              -- 'goal_tagging' | 'log_evidence_extraction'
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  records_processed INTEGER NOT NULL DEFAULT 0,
  records_succeeded INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0
);

-- Script 1 output: one row per goal (the model picks at most one best-match skill).
CREATE TABLE IF NOT EXISTS poc_goal_skill_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES poc_runs(id),
  source_goal_id TEXT NOT NULL REFERENCES poc_source_goals(id),
  child_id TEXT NOT NULL,
  predicted_skill_id TEXT REFERENCES poc_taxonomy_skills(id),
  predicted_skill_name TEXT,
  confidence REAL,
  rationale TEXT,
  status TEXT NOT NULL,                -- 'tagged' | 'no_match' | 'error'
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Script 2 output: one row per extracted piece of evidence (a single log can
-- yield zero, one, or several -- e.g. "cricket 30%, badminton 70%, skating
-- 100%" in one log is three separate evidence rows against three skills).
CREATE TABLE IF NOT EXISTS poc_log_skill_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES poc_runs(id),
  source_log_id TEXT NOT NULL REFERENCES poc_source_logs(id),
  child_id TEXT NOT NULL,
  predicted_skill_id TEXT REFERENCES poc_taxonomy_skills(id),
  predicted_skill_name TEXT,
  predicted_item_id TEXT REFERENCES poc_taxonomy_skill_items(id),
  predicted_item_name TEXT,            -- the raw free-text item hint from the extraction pass
  item_match_score REAL,               -- how matchItem() scored predicted_item_id against the hint
  item_match_method TEXT,              -- exact | substring | token_overlap | levenshtein | no_match | no_hint | not_applicable
  outcome TEXT,                        -- correct | incorrect | partial | attempted | not_observed | unknown
  support_level TEXT,                  -- independent | visual_prompt | ... | unknown
  modality TEXT,                       -- verbal | manual_sign | aac | written | gestural | unknown | not_applicable
  measurement_type TEXT,               -- trials | frequency | duration | percentage | prompt_level | yes_no | rating | free_observation | NULL
  measurement_value REAL,              -- meaning depends on measurement_type: count (frequency), seconds (duration), 0-100 (percentage), 1-5 (rating)
  measurement_unit TEXT,               -- e.g. "times", "seconds" -- paired with measurement_value
  measurement_boolean INTEGER,         -- 0/1, only set when measurement_type = yes_no
  measurement_text TEXT,               -- only set when measurement_type = free_observation
  confidence REAL,
  excerpt TEXT,                        -- the exact span of free_text this evidence came from
  rationale TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_goal_tags_run ON poc_goal_skill_tags(run_id);
CREATE INDEX IF NOT EXISTS idx_log_evidence_run ON poc_log_skill_evidence(run_id);
CREATE INDEX IF NOT EXISTS idx_log_evidence_skill ON poc_log_skill_evidence(predicted_skill_id);
