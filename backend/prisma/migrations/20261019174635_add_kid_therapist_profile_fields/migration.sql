-- AlterTable
ALTER TABLE "Kid" ADD COLUMN     "gender" TEXT;

-- AlterTable
ALTER TABLE "Therapist" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "dob" TIMESTAMP(3),
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "qualifiedDisciplineIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "yearsOfExperience" INTEGER;
