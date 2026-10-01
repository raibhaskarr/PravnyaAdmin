-- CreateEnum
CREATE TYPE "PocEvidenceOutcome" AS ENUM ('CORRECT', 'INCORRECT', 'PARTIAL', 'ATTEMPTED', 'NOT_OBSERVED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PocSupportLevel" AS ENUM ('INDEPENDENT', 'VISUAL_PROMPT', 'VERBAL_PROMPT', 'GESTURAL_PROMPT', 'PHYSICAL_PROMPT', 'PARTIAL_ASSISTANCE', 'FULL_ASSISTANCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PocGoalTagStatus" AS ENUM ('TAGGED', 'NO_MATCH', 'ERROR');

-- CreateTable
CREATE TABLE "PocReviewChild" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "sourceChildId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PocReviewChild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PocGoalTag" (
    "id" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "goalTitle" TEXT NOT NULL,
    "predictedSkillId" UUID,
    "confidence" DOUBLE PRECISION,
    "rationale" TEXT,
    "status" "PocGoalTagStatus" NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PocGoalTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PocLogEvidence" (
    "id" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "logDate" TIMESTAMP(3),
    "predictedSkillId" UUID,
    "itemHint" TEXT,
    "outcome" "PocEvidenceOutcome" NOT NULL,
    "supportLevel" "PocSupportLevel" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PocLogEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PocReviewChild_sourceChildId_key" ON "PocReviewChild"("sourceChildId");

-- CreateIndex
CREATE INDEX "PocGoalTag_childId_idx" ON "PocGoalTag"("childId");

-- CreateIndex
CREATE INDEX "PocLogEvidence_childId_idx" ON "PocLogEvidence"("childId");

-- CreateIndex
CREATE INDEX "PocLogEvidence_predictedSkillId_idx" ON "PocLogEvidence"("predictedSkillId");

-- AddForeignKey
ALTER TABLE "PocGoalTag" ADD CONSTRAINT "PocGoalTag_childId_fkey" FOREIGN KEY ("childId") REFERENCES "PocReviewChild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PocGoalTag" ADD CONSTRAINT "PocGoalTag_predictedSkillId_fkey" FOREIGN KEY ("predictedSkillId") REFERENCES "CanonicalSkill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PocLogEvidence" ADD CONSTRAINT "PocLogEvidence_childId_fkey" FOREIGN KEY ("childId") REFERENCES "PocReviewChild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PocLogEvidence" ADD CONSTRAINT "PocLogEvidence_predictedSkillId_fkey" FOREIGN KEY ("predictedSkillId") REFERENCES "CanonicalSkill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
