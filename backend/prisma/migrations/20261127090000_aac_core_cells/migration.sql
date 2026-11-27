-- Add the core-cells strip (Proloquo2Go-style motor plan) to every AAC board.
-- Default [] means existing boards keep behaving exactly as before.
ALTER TABLE "AacBoard" ADD COLUMN "coreCells" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "AacBoardTemplate" ADD COLUMN "coreCells" JSONB NOT NULL DEFAULT '[]';
