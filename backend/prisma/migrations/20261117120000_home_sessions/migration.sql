-- CreateEnum
CREATE TYPE "HomeSessionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HomeSessionRunStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ENDED_EARLY');

-- AlterTable
ALTER TABLE "GoalItemEvidence" ADD COLUMN     "sessionRunId" UUID;

-- CreateTable
CREATE TABLE "HomeSession" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kidId" UUID NOT NULL,
    "authorUserId" UUID,
    "authorName" TEXT NOT NULL,
    "centreName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "plan" JSONB NOT NULL,
    "schedule" JSONB NOT NULL,
    "aiDrafted" BOOLEAN NOT NULL DEFAULT false,
    "status" "HomeSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeSessionRun" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kidId" UUID NOT NULL,
    "status" "HomeSessionRunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "state" JSONB NOT NULL,
    "results" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "summaryEmailedAt" TIMESTAMP(3),

    CONSTRAINT "HomeSessionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HomeSession_kidId_status_idx" ON "HomeSession"("kidId", "status");

-- CreateIndex
CREATE INDEX "HomeSessionRun_sessionId_startedAt_idx" ON "HomeSessionRun"("sessionId", "startedAt");

-- CreateIndex
CREATE INDEX "HomeSessionRun_kidId_startedAt_idx" ON "HomeSessionRun"("kidId", "startedAt");

-- CreateIndex
CREATE INDEX "GoalItemEvidence_sessionRunId_idx" ON "GoalItemEvidence"("sessionRunId");

-- AddForeignKey
ALTER TABLE "GoalItemEvidence" ADD CONSTRAINT "GoalItemEvidence_sessionRunId_fkey" FOREIGN KEY ("sessionRunId") REFERENCES "HomeSessionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeSession" ADD CONSTRAINT "HomeSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeSession" ADD CONSTRAINT "HomeSession_kidId_fkey" FOREIGN KEY ("kidId") REFERENCES "Kid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeSession" ADD CONSTRAINT "HomeSession_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeSessionRun" ADD CONSTRAINT "HomeSessionRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "HomeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeSessionRun" ADD CONSTRAINT "HomeSessionRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeSessionRun" ADD CONSTRAINT "HomeSessionRun_kidId_fkey" FOREIGN KEY ("kidId") REFERENCES "Kid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

