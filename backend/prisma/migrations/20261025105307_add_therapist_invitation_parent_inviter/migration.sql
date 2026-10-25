-- DropForeignKey
ALTER TABLE "TherapistInvitation" DROP CONSTRAINT "TherapistInvitation_invitedById_fkey";

-- AlterTable
ALTER TABLE "TherapistInvitation" ADD COLUMN     "invitedByParentId" UUID,
ALTER COLUMN "invitedById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "TherapistInvitation" ADD CONSTRAINT "TherapistInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistInvitation" ADD CONSTRAINT "TherapistInvitation_invitedByParentId_fkey" FOREIGN KEY ("invitedByParentId") REFERENCES "Parent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
