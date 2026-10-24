-- AlterTable
ALTER TABLE "class_groups" ADD COLUMN     "gradeId" TEXT;

-- AlterTable
ALTER TABLE "school_settings" ADD COLUMN     "constraintsJson" TEXT;

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "code" TEXT,
ADD COLUMN     "color" TEXT DEFAULT '#8b5cf6',
ADD COLUMN     "maxPerDay" INTEGER,
ADD COLUMN     "minDaysPerWeek" INTEGER,
ADD COLUMN     "preferEarly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "teacher_profiles" ADD COLUMN     "avoidLastPeriod" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#3b82f6',
ADD COLUMN     "employeeNo" TEXT,
ADD COLUMN     "maxConsecutive" INTEGER,
ADD COLUMN     "maxDailyLessons" INTEGER,
ADD COLUMN     "maxWorkingDays" INTEGER,
ADD COLUMN     "specialization" TEXT,
ADD COLUMN     "weeklyLessons" INTEGER NOT NULL DEFAULT 22;

-- CreateTable
CREATE TABLE "grade_levels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "grade_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_grade_quotas" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "weeklyPeriods" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subject_grade_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_unavailabilities" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "periodIndex" INTEGER NOT NULL,

    CONSTRAINT "teacher_unavailabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_unavailabilities" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "periodIndex" INTEGER NOT NULL,

    CONSTRAINT "subject_unavailabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_period_defs" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "start" TEXT,
    "end" TEXT,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "day_period_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_timetables" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'الجدول الرئيسي',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "qualityScore" DOUBLE PRECISION,
    "statsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_timetables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_timetable_entries" (
    "id" TEXT NOT NULL,
    "timetableId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "assignmentId" TEXT NOT NULL,

    CONSTRAINT "generated_timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_jobs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "logJson" TEXT,
    "diagnosticsJson" TEXT,
    "timetableId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "timetable_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grade_levels_name_key" ON "grade_levels"("name");

-- CreateIndex
CREATE UNIQUE INDEX "subject_grade_quotas_subjectId_gradeId_key" ON "subject_grade_quotas"("subjectId", "gradeId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_unavailabilities_teacherId_dayOfWeek_periodIndex_key" ON "teacher_unavailabilities"("teacherId", "dayOfWeek", "periodIndex");

-- CreateIndex
CREATE UNIQUE INDEX "subject_unavailabilities_subjectId_dayOfWeek_periodIndex_key" ON "subject_unavailabilities"("subjectId", "dayOfWeek", "periodIndex");

-- CreateIndex
CREATE UNIQUE INDEX "day_period_defs_dayOfWeek_index_key" ON "day_period_defs"("dayOfWeek", "index");

-- CreateIndex
CREATE INDEX "generated_timetable_entries_assignmentId_idx" ON "generated_timetable_entries"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "generated_timetable_entries_timetableId_dayOfWeek_periodInd_key" ON "generated_timetable_entries"("timetableId", "dayOfWeek", "periodIndex", "assignmentId");

-- AddForeignKey
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "grade_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_grade_quotas" ADD CONSTRAINT "subject_grade_quotas_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_grade_quotas" ADD CONSTRAINT "subject_grade_quotas_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "grade_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_unavailabilities" ADD CONSTRAINT "teacher_unavailabilities_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teacher_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_unavailabilities" ADD CONSTRAINT "subject_unavailabilities_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_timetable_entries" ADD CONSTRAINT "generated_timetable_entries_timetableId_fkey" FOREIGN KEY ("timetableId") REFERENCES "generated_timetables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_timetable_entries" ADD CONSTRAINT "generated_timetable_entries_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "teaching_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_jobs" ADD CONSTRAINT "timetable_jobs_timetableId_fkey" FOREIGN KEY ("timetableId") REFERENCES "generated_timetables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
