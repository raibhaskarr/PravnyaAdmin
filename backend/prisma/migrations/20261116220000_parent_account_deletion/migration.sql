-- AlterTable
ALTER TABLE "Parent" ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "scheduledPurgeAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Parent_scheduledPurgeAt_idx" ON "Parent"("scheduledPurgeAt");

