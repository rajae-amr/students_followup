-- الخطة الأسبوعية: إدخال لكل معلم/مادة + لقطة موحّدة للصف
CREATE TABLE "weekly_plans" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "weekly_plan_entries" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "lessonTitle" TEXT,
    "textbook" TEXT,
    "platforms" TEXT,
    "tests" TEXT,
    "notes" TEXT,

    CONSTRAINT "weekly_plan_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "class_plan_publications" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "contentJson" JSONB NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifyCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "class_plan_publications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weekly_plans_teacherId_classId_subjectId_weekStart_key" ON "weekly_plans"("teacherId", "classId", "subjectId", "weekStart");
CREATE UNIQUE INDEX "weekly_plan_entries_planId_weekday_key" ON "weekly_plan_entries"("planId", "weekday");

ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weekly_plan_entries" ADD CONSTRAINT "weekly_plan_entries_planId_fkey" FOREIGN KEY ("planId") REFERENCES "weekly_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_plan_publications" ADD CONSTRAINT "class_plan_publications_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
