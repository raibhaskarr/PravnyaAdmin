-- CreateTable
CREATE TABLE "SuperadminInvitation" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperadminInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SuperadminInvitation_tokenHash_key" ON "SuperadminInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "SuperadminInvitation_email_idx" ON "SuperadminInvitation"("email");

-- AddForeignKey
ALTER TABLE "SuperadminInvitation" ADD CONSTRAINT "SuperadminInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
