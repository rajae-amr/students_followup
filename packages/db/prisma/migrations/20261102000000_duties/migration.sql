-- CreateTable
CREATE TABLE "duty_locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "duty_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_assignments" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "locationId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duty_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "duty_assignments_teacherId_weekStart_idx" ON "duty_assignments"("teacherId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "duty_assignments_weekStart_dayOfWeek_locationId_key" ON "duty_assignments"("weekStart", "dayOfWeek", "locationId");

-- AddForeignKey
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "duty_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

