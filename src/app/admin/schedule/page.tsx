import { redirect } from "next/navigation";

// دُمجت هذه الصفحة في «الجدولة الآلية» — التعديل اليدوي للخانات داخلها
export default function ScheduleAdmin() {
  redirect("/admin/timetable");
}
