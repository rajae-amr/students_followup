-- DropIndex
DROP INDEX "evaluations_teacherId_subjectId_studentId_termId_category_key";

-- AlterTable
ALTER TABLE "evaluations" ADD COLUMN     "weekStart" DATE;

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_teacherId_subjectId_studentId_termId_weekStart__key" ON "evaluations"("teacherId", "subjectId", "studentId", "termId", "weekStart", "category");
