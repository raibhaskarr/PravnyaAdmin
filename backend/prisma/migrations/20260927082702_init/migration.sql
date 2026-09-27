-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPERADMIN', 'TENANT_ADMIN', 'THERAPIST', 'VIEWER');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SkillSource" AS ENUM ('PROD', 'FRAMEWORK');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "Modality" AS ENUM ('VERBAL', 'MANUAL_SIGN', 'AAC', 'WRITTEN', 'GESTURAL');

-- CreateEnum
CREATE TYPE "KidStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalDomain" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalDiscipline" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalDiscipline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalSkill" (
    "id" UUID NOT NULL,
    "domainId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultDisciplineId" UUID,
    "supportsItems" BOOLEAN NOT NULL DEFAULT false,
    "sourceTag" "SkillSource" NOT NULL DEFAULT 'FRAMEWORK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalSkillItem" (
    "id" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "semanticGroup" TEXT NOT NULL DEFAULT 'OTHER',
    "aliases" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalSkillItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantDiscipline" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "disciplineId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantDiscipline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Therapist" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "disciplineIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Therapist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kid" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dob" TIMESTAMP(3),
    "status" "KidStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KidTherapist" (
    "id" UUID NOT NULL,
    "kidId" UUID NOT NULL,
    "therapistId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KidTherapist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kidId" UUID NOT NULL,
    "canonicalSkillId" UUID NOT NULL,
    "disciplineId" UUID NOT NULL,
    "modality" "Modality" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalDomain_key_key" ON "CanonicalDomain"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalDiscipline_key_key" ON "CanonicalDiscipline"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalSkill_key_key" ON "CanonicalSkill"("key");

-- CreateIndex
CREATE INDEX "CanonicalSkill_domainId_idx" ON "CanonicalSkill"("domainId");

-- CreateIndex
CREATE INDEX "CanonicalSkillItem_skillId_idx" ON "CanonicalSkillItem"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalSkillItem_skillId_key_key" ON "CanonicalSkillItem"("skillId", "key");

-- CreateIndex
CREATE INDEX "TenantDiscipline_tenantId_idx" ON "TenantDiscipline"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantDiscipline_tenantId_disciplineId_key" ON "TenantDiscipline"("tenantId", "disciplineId");

-- CreateIndex
CREATE UNIQUE INDEX "Therapist_userId_key" ON "Therapist"("userId");

-- CreateIndex
CREATE INDEX "Therapist_tenantId_idx" ON "Therapist"("tenantId");

-- CreateIndex
CREATE INDEX "Kid_tenantId_idx" ON "Kid"("tenantId");

-- CreateIndex
CREATE INDEX "KidTherapist_therapistId_idx" ON "KidTherapist"("therapistId");

-- CreateIndex
CREATE UNIQUE INDEX "KidTherapist_kidId_therapistId_key" ON "KidTherapist"("kidId", "therapistId");

-- CreateIndex
CREATE INDEX "Goal_tenantId_kidId_idx" ON "Goal"("tenantId", "kidId");

-- CreateIndex
CREATE INDEX "Goal_canonicalSkillId_idx" ON "Goal"("canonicalSkillId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalSkill" ADD CONSTRAINT "CanonicalSkill_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "CanonicalDomain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalSkill" ADD CONSTRAINT "CanonicalSkill_defaultDisciplineId_fkey" FOREIGN KEY ("defaultDisciplineId") REFERENCES "CanonicalDiscipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalSkillItem" ADD CONSTRAINT "CanonicalSkillItem_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "CanonicalSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantDiscipline" ADD CONSTRAINT "TenantDiscipline_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantDiscipline" ADD CONSTRAINT "TenantDiscipline_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "CanonicalDiscipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Therapist" ADD CONSTRAINT "Therapist_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Therapist" ADD CONSTRAINT "Therapist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kid" ADD CONSTRAINT "Kid_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KidTherapist" ADD CONSTRAINT "KidTherapist_kidId_fkey" FOREIGN KEY ("kidId") REFERENCES "Kid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KidTherapist" ADD CONSTRAINT "KidTherapist_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_kidId_fkey" FOREIGN KEY ("kidId") REFERENCES "Kid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_canonicalSkillId_fkey" FOREIGN KEY ("canonicalSkillId") REFERENCES "CanonicalSkill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "CanonicalDiscipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
