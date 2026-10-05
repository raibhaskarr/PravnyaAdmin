-- AlterTable
ALTER TABLE "PocReviewDecision" ADD COLUMN     "resolvedSourceGoalId" UUID;

-- CreateTable
CREATE TABLE "PocEvidenceGoalSuggestion" (
    "id" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "canonicalSkillId" UUID NOT NULL,
    "suggestedGoalId" UUID,
    "suggestedGoalTitle" TEXT,
    "confidence" DOUBLE PRECISION,
    "rationale" TEXT,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PocEvidenceGoalSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PocEvidenceGoalSuggestion_childId_canonicalSkillId_key" ON "PocEvidenceGoalSuggestion"("childId", "canonicalSkillId");

-- AddForeignKey
ALTER TABLE "PocEvidenceGoalSuggestion" ADD CONSTRAINT "PocEvidenceGoalSuggestion_childId_fkey" FOREIGN KEY ("childId") REFERENCES "PocReviewChild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
