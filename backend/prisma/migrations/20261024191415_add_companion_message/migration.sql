-- CreateEnum
CREATE TYPE "CompanionMessageRole" AS ENUM ('PARENT', 'ASSISTANT');

-- CreateTable
CREATE TABLE "CompanionMessage" (
    "id" UUID NOT NULL,
    "kidId" UUID NOT NULL,
    "role" "CompanionMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanionMessage_kidId_createdAt_idx" ON "CompanionMessage"("kidId", "createdAt");

-- AddForeignKey
ALTER TABLE "CompanionMessage" ADD CONSTRAINT "CompanionMessage_kidId_fkey" FOREIGN KEY ("kidId") REFERENCES "Kid"("id") ON DELETE CASCADE ON UPDATE CASCADE;
