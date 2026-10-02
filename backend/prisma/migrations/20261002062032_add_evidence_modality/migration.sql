/*
  Warnings:

  - Added the required column `modality` to the `PocLogEvidence` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PocModality" AS ENUM ('VERBAL', 'MANUAL_SIGN', 'AAC', 'WRITTEN', 'GESTURAL', 'UNKNOWN', 'NOT_APPLICABLE');

-- AlterTable
-- Existing rows predate modality extraction, so they backfill to UNKNOWN rather than failing the
-- migration against production's already-populated PocLogEvidence table.
ALTER TABLE "PocLogEvidence" ADD COLUMN     "modality" "PocModality" NOT NULL DEFAULT 'UNKNOWN';
