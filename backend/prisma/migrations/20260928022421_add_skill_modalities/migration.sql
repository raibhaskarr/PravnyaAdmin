-- AlterTable
ALTER TABLE "CanonicalSkill" ADD COLUMN     "supportedModalities" "Modality"[] DEFAULT ARRAY[]::"Modality"[];
