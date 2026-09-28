-- CreateTable
CREATE TABLE "GoalItem" (
    "id" UUID NOT NULL,
    "goalId" UUID NOT NULL,
    "canonicalSkillItemId" UUID,
    "customText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoalItem_goalId_idx" ON "GoalItem"("goalId");

-- AddForeignKey
ALTER TABLE "GoalItem" ADD CONSTRAINT "GoalItem_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalItem" ADD CONSTRAINT "GoalItem_canonicalSkillItemId_fkey" FOREIGN KEY ("canonicalSkillItemId") REFERENCES "CanonicalSkillItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
