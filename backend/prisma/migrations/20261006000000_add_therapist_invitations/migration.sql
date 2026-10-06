-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "TherapistInvitation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "disciplineIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "kidId" UUID,
    "invitedById" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TherapistInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TherapistInvitation_tokenHash_key" ON "TherapistInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "TherapistInvitation_tenantId_idx" ON "TherapistInvitation"("tenantId");

-- CreateIndex
CREATE INDEX "TherapistInvitation_email_idx" ON "TherapistInvitation"("email");

-- AddForeignKey
ALTER TABLE "TherapistInvitation" ADD CONSTRAINT "TherapistInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistInvitation" ADD CONSTRAINT "TherapistInvitation_kidId_fkey" FOREIGN KEY ("kidId") REFERENCES "Kid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistInvitation" ADD CONSTRAINT "TherapistInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

