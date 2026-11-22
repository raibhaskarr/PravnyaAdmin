-- CreateEnum
CREATE TYPE "VisualScheduleSource" AS ENUM ('THERAPIST', 'PARENT');

-- AlterTable
ALTER TABLE "VisualSchedule" ADD COLUMN     "createdByParentId" UUID,
ADD COLUMN     "remind" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "source" "VisualScheduleSource" NOT NULL DEFAULT 'THERAPIST',
ADD COLUMN     "time" TEXT;

-- CreateTable
CREATE TABLE "VisualScheduleUse" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "VisualScheduleUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisualScheduleReminder" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "forDate" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisualScheduleReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" UUID NOT NULL,
    "parentId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisualScheduleUse_scheduleId_startedAt_idx" ON "VisualScheduleUse"("scheduleId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VisualScheduleReminder_scheduleId_forDate_key" ON "VisualScheduleReminder"("scheduleId", "forDate");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_parentId_idx" ON "PushSubscription"("parentId");

-- AddForeignKey
ALTER TABLE "VisualSchedule" ADD CONSTRAINT "VisualSchedule_createdByParentId_fkey" FOREIGN KEY ("createdByParentId") REFERENCES "Parent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualScheduleUse" ADD CONSTRAINT "VisualScheduleUse_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "VisualSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualScheduleReminder" ADD CONSTRAINT "VisualScheduleReminder_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "VisualSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
