-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "sourceGoalId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Goal_sourceGoalId_key" ON "Goal"("sourceGoalId");

