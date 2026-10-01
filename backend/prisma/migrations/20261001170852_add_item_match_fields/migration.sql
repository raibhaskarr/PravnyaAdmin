-- AlterTable
ALTER TABLE "PocLogEvidence" ADD COLUMN     "itemMatchMethod" TEXT,
ADD COLUMN     "itemMatchScore" DOUBLE PRECISION,
ADD COLUMN     "predictedItemId" UUID;

-- AddForeignKey
ALTER TABLE "PocLogEvidence" ADD CONSTRAINT "PocLogEvidence_predictedItemId_fkey" FOREIGN KEY ("predictedItemId") REFERENCES "CanonicalSkillItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
