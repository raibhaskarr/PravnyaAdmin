-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "unusedSince" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MediaAuditEvent" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "kidId" UUID,
    "action" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaAuditEvent_tenantId_createdAt_idx" ON "MediaAuditEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAuditEvent_kidId_createdAt_idx" ON "MediaAuditEvent"("kidId", "createdAt");

-- AddForeignKey
ALTER TABLE "MediaAuditEvent" ADD CONSTRAINT "MediaAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
