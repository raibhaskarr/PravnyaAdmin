-- CreateEnum
CREATE TYPE "TherapistStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- AlterTable
ALTER TABLE "Therapist" ADD COLUMN     "status" "TherapistStatus" NOT NULL DEFAULT 'ACTIVE';
