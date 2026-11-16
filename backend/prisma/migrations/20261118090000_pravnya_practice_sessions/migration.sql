-- CreateEnum
CREATE TYPE "HomeSessionSource" AS ENUM ('THERAPIST', 'PRAVNYA');

-- AlterTable
ALTER TABLE "HomeSession" ADD COLUMN     "source" "HomeSessionSource" NOT NULL DEFAULT 'THERAPIST';

-- CreateIndex
CREATE INDEX "HomeSession_kidId_source_createdAt_idx" ON "HomeSession"("kidId", "source", "createdAt");

