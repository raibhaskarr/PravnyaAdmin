-- CreateEnum
CREATE TYPE "PocMeasurementType" AS ENUM ('TRIALS', 'FREQUENCY', 'DURATION', 'PERCENTAGE', 'PROMPT_LEVEL', 'YES_NO', 'RATING', 'FREE_OBSERVATION');

-- AlterTable
-- All new columns are nullable -- no backfill/default-value concern against the already-populated
-- PocLogEvidence table, unlike the earlier modality migration.
ALTER TABLE "PocLogEvidence" ADD COLUMN     "measurementType" "PocMeasurementType",
ADD COLUMN     "measurementNumerator" INTEGER,
ADD COLUMN     "measurementDenominator" INTEGER,
ADD COLUMN     "measurementValue" DOUBLE PRECISION,
ADD COLUMN     "measurementUnit" TEXT,
ADD COLUMN     "measurementBoolean" BOOLEAN,
ADD COLUMN     "measurementText" TEXT;
