-- CreateTable
CREATE TABLE "VisualScheduleTemplate" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "builtInKey" TEXT,
    "title" TEXT NOT NULL,
    "kind" "VisualScheduleKind" NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "steps" JSONB NOT NULL,
    "days" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "time" TEXT,
    "createdByUserId" UUID,
    "createdByName" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisualScheduleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisualScheduleTemplate_builtInKey_key" ON "VisualScheduleTemplate"("builtInKey");

-- CreateIndex
CREATE INDEX "VisualScheduleTemplate_tenantId_idx" ON "VisualScheduleTemplate"("tenantId");

-- AddForeignKey
ALTER TABLE "VisualScheduleTemplate" ADD CONSTRAINT "VisualScheduleTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualScheduleTemplate" ADD CONSTRAINT "VisualScheduleTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
