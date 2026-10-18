-- AlterTable
ALTER TABLE "Kid" ADD COLUMN     "parentId" UUID;

-- CreateTable
CREATE TABLE "Parent" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "fatherName" TEXT,
    "motherName" TEXT,
    "mobile" TEXT NOT NULL,
    "addressLine1" TEXT,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Parent_email_key" ON "Parent"("email");

-- CreateIndex
CREATE INDEX "Kid_parentId_idx" ON "Kid"("parentId");

-- AddForeignKey
ALTER TABLE "Kid" ADD CONSTRAINT "Kid_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
