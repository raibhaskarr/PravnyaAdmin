-- CreateEnum
CREATE TYPE "PocReviewFlagKind" AS ENUM ('GOAL_DISAGREEMENT', 'EVIDENCE_WITHOUT_GOAL');

-- AlterTable
ALTER TABLE "PocGoalTag" ADD COLUMN     "sourceGoalId" UUID;

-- CreateTable
CREATE TABLE "PocReviewDecision" (
    "id" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "kind" "PocReviewFlagKind" NOT NULL,
    "sourceGoalId" UUID,
    "canonicalSkillId" UUID,
    "resolvedSkillId" UUID,
    "resolvedSource" TEXT,
    "note" TEXT,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PocReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PocGoalTag_sourceGoalId_idx" ON "PocGoalTag"("sourceGoalId");

-- CreateIndex
CREATE INDEX "PocReviewDecision_childId_kind_idx" ON "PocReviewDecision"("childId", "kind");

-- AddForeignKey
ALTER TABLE "PocReviewDecision" ADD CONSTRAINT "PocReviewDecision_childId_fkey" FOREIGN KEY ("childId") REFERENCES "PocReviewChild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
