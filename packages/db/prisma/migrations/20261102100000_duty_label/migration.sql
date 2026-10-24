-- DropForeignKey
ALTER TABLE "duty_assignments" DROP CONSTRAINT "duty_assignments_teacherId_fkey";

-- AlterTable
ALTER TABLE "duty_assignments" ADD COLUMN     "label" TEXT,
ALTER COLUMN "teacherId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

