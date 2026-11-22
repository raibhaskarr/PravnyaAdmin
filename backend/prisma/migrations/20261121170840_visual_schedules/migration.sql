-- CreateEnum
CREATE TYPE "VisualScheduleKind" AS ENUM ('FIRST_THEN', 'ROUTINE', 'DAY');

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kidId" UUID,
    "uploadedByUserId" UUID,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisualSchedule" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kidId" UUID NOT NULL,
    "authorUserId" UUID,
    "authorName" TEXT NOT NULL,
    "centreName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "VisualScheduleKind" NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "steps" JSONB NOT NULL,
    "days" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiDrafted" BOOLEAN NOT NULL DEFAULT false,
    "status" "HomeSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisualSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_kidId_idx" ON "MediaAsset"("kidId");

-- CreateIndex
CREATE INDEX "VisualSchedule_kidId_status_idx" ON "VisualSchedule"("kidId", "status");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_kidId_fkey" FOREIGN KEY ("kidId") REFERENCES "Kid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualSchedule" ADD CONSTRAINT "VisualSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualSchedule" ADD CONSTRAINT "VisualSchedule_kidId_fkey" FOREIGN KEY ("kidId") REFERENCES "Kid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualSchedule" ADD CONSTRAINT "VisualSchedule_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
