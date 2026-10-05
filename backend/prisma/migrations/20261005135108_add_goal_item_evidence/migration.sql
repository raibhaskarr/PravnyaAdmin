-- CreateTable
CREATE TABLE "GoalItemEvidence" (
    "id" UUID NOT NULL,
    "goalItemId" UUID NOT NULL,
    "logDate" TIMESTAMP(3),
    "centreName" TEXT,
    "outcome" "PocEvidenceOutcome" NOT NULL,
    "supportLevel" "PocSupportLevel" NOT NULL,
    "modality" "PocModality" NOT NULL DEFAULT 'UNKNOWN',
    "measurementType" "PocMeasurementType",
    "measurementValue" DOUBLE PRECISION,
    "measurementUnit" TEXT,
    "measurementBoolean" BOOLEAN,
    "measurementText" TEXT,
    "confidence" DOUBLE PRECISION,
    "sourceChildId" UUID,
    "sourceLogId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalItemEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoalItemEvidence_goalItemId_logDate_idx" ON "GoalItemEvidence"("goalItemId", "logDate");

-- AddForeignKey
ALTER TABLE "GoalItemEvidence" ADD CONSTRAINT "GoalItemEvidence_goalItemId_fkey" FOREIGN KEY ("goalItemId") REFERENCES "GoalItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
