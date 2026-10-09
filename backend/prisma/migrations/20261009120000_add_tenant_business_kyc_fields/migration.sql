-- CreateEnum
CREATE TYPE "TenantKycStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "kycNotes" TEXT,
ADD COLUMN     "kycReviewedAt" TIMESTAMP(3),
ADD COLUMN     "kycStatus" "TenantKycStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "leadOwnerEmail" TEXT,
ADD COLUMN     "leadOwnerName" TEXT,
ADD COLUMN     "leadOwnerPhone" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "socialLinks" JSONB,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "website" TEXT;

