-- CreateTable
CREATE TABLE "SkillHomeGuide" (
    "id" UUID NOT NULL,
    "canonicalSkillId" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "aiDrafted" BOOLEAN NOT NULL DEFAULT true,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillHomeGuide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SkillHomeGuide_canonicalSkillId_key" ON "SkillHomeGuide"("canonicalSkillId");

-- AddForeignKey
ALTER TABLE "SkillHomeGuide" ADD CONSTRAINT "SkillHomeGuide_canonicalSkillId_fkey" FOREIGN KEY ("canonicalSkillId") REFERENCES "CanonicalSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillHomeGuide" ADD CONSTRAINT "SkillHomeGuide_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

