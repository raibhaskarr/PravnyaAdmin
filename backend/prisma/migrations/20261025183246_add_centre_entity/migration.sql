-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "centreId" UUID;

-- AlterTable
ALTER TABLE "GoalItemEvidence" ADD COLUMN     "centreId" UUID;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "centreId" UUID;

-- CreateTable
CREATE TABLE "Centre" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Centre_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Centre_name_key" ON "Centre"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_centreId_key" ON "Tenant"("centreId");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "Centre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "Centre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalItemEvidence" ADD CONSTRAINT "GoalItemEvidence_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "Centre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

