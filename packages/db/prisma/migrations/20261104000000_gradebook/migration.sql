-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- التقييمات القائمة تُعتبر منشورة — حفاظاً على السلوك الحالي قبل مرحلة المسودات
UPDATE "assessments" SET "publishedAt" = "createdAt";

-- AlterTable
ALTER TABLE "grades" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'normal';

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "gradeWeights" JSONB;
