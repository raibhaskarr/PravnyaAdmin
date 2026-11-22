-- CreateTable
CREATE TABLE "AacBoard" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kidId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "rows" INTEGER NOT NULL,
    "cols" INTEGER NOT NULL,
    "homePageId" TEXT NOT NULL,
    "pages" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AacBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AacBoardTemplate" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "builtInKey" TEXT,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "rows" INTEGER NOT NULL,
    "cols" INTEGER NOT NULL,
    "homePageId" TEXT NOT NULL,
    "pages" JSONB NOT NULL,
    "createdByUserId" UUID,
    "createdByName" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AacBoardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AacBoard_kidId_key" ON "AacBoard"("kidId");

-- CreateIndex
CREATE UNIQUE INDEX "AacBoardTemplate_builtInKey_key" ON "AacBoardTemplate"("builtInKey");

-- CreateIndex
CREATE INDEX "AacBoardTemplate_tenantId_idx" ON "AacBoardTemplate"("tenantId");

-- AddForeignKey
ALTER TABLE "AacBoard" ADD CONSTRAINT "AacBoard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AacBoard" ADD CONSTRAINT "AacBoard_kidId_fkey" FOREIGN KEY ("kidId") REFERENCES "Kid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AacBoardTemplate" ADD CONSTRAINT "AacBoardTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AacBoardTemplate" ADD CONSTRAINT "AacBoardTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
