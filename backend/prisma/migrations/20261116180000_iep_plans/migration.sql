-- CreateEnum
CREATE TYPE "IepPlanStatus" AS ENUM ('DRAFT', 'FINAL');

-- CreateTable
CREATE TABLE "IepPlan" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kidId" UUID NOT NULL,
    "authorUserId" UUID,
    "authorName" TEXT NOT NULL,
    "centreName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "baselineFrom" TIMESTAMP(3) NOT NULL,
    "baselineTo" TIMESTAMP(3) NOT NULL,
    "planStart" TIMESTAMP(3) NOT NULL,
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "content" JSONB NOT NULL,
    "stats" JSONB NOT NULL,
    "aiDrafted" BOOLEAN NOT NULL DEFAULT false,
    "status" "IepPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "finalisedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IepPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IepPlan_kidId_status_idx" ON "IepPlan"("kidId", "status");

-- AddForeignKey
ALTER TABLE "IepPlan" ADD CONSTRAINT "IepPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IepPlan" ADD CONSTRAINT "IepPlan_kidId_fkey" FOREIGN KEY ("kidId") REFERENCES "Kid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IepPlan" ADD CONSTRAINT "IepPlan_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

