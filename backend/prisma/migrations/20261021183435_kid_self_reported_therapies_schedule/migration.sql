-- AlterTable
ALTER TABLE "Kid" ADD COLUMN     "selfReportedScheduleDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "selfReportedTherapies" TEXT[] DEFAULT ARRAY[]::TEXT[];
