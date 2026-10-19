-- AlterTable
ALTER TABLE "Parent" ADD COLUMN     "createdByTenantId" UUID;

-- CreateIndex
CREATE INDEX "Parent_createdByTenantId_idx" ON "Parent"("createdByTenantId");

-- AddForeignKey
ALTER TABLE "Parent" ADD CONSTRAINT "Parent_createdByTenantId_fkey" FOREIGN KEY ("createdByTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
