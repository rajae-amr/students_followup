/**
 * اشتقاق حالة اليوم من سجلات الحصص — القواعد المعتمدة:
 *
 * - 3 حصص غياب أو أكثر        → غياب يوم (absent)
 * - 3 حصص استئذان أو أكثر     → غائب بعذر (excused)
 * - غياب/استئذان حصة أو حصتين → غياب جزئي (partial)
 * - تأخير في أي حصة (دون غياب) → متأخر (late)
 * - سجلات حضور فقط            → حاضر (present)
 * - لا سجلات مرصودة           → لا حالة (unknown)
 *
 * الاستئذان والتأخير عدّادان مستقلان؛ الاستئذان لا يُحسب غياباً.
 * الحصة غير المرصودة لا تدخل في الحساب إطلاقاً.
 */

export type LessonAttendance = "present" | "absent" | "excused" | "late";

export type DayStatus =
  | "present"
  | "absent"
  | "excused"
  | "partial"
  | "late"
  | "unknown";

export interface DerivePolicy {
  /** عدد حصص الغياب التي تجعل اليوم «غياب يوم» — الافتراضي 3 */
  absentFullDayThreshold: number;
  /** عدد حصص الاستئذان التي تجعل اليوم «غائب بعذر» — الافتراضي 3 */
  excusedFullDayThreshold: number;
}

export const DEFAULT_POLICY: DerivePolicy = {
  absentFullDayThreshold: 3,
  excusedFullDayThreshold: 3,
};

export interface DayDerivation {
  status: DayStatus;
  absentCount: number;
  excusedCount: number;
  lateCount: number;
  presentCount: number;
  /** عدد الحصص المرصودة فعلياً لهذا الطالب */
  recordedCount: number;
}

export function deriveDayStatus(
  records: LessonAttendance[],
  policy: DerivePolicy = DEFAULT_POLICY,
): DayDerivation {
  const counts = { absent: 0, excused: 0, late: 0, present: 0 };
  for (const r of records) counts[r] += 1;

  const recordedCount = records.length;

  let status: DayStatus;
  if (recordedCount === 0) {
    status = "unknown";
  } else if (counts.absent >= policy.absentFullDayThreshold) {
    status = "absent";
  } else if (counts.excused >= policy.excusedFullDayThreshold) {
    status = "excused";
  } else if (counts.absent > 0 || counts.excused > 0) {
    // غياب/استئذان حصة أو حصتين دون بلوغ عتبة اليوم الكامل
    status = "partial";
  } else if (counts.late > 0) {
    status = "late";
  } else {
    status = "present";
  }

  return {
    status,
    absentCount: counts.absent,
    excusedCount: counts.excused,
    lateCount: counts.late,
    presentCount: counts.present,
    recordedCount,
  };
}

/** التسمية العربية لكل حالة يوم */
export const DAY_STATUS_AR: Record<DayStatus, string> = {
  present: "حاضر",
  absent: "غائب",
  excused: "غائب بعذر",
  partial: "غياب جزئي",
  late: "متأخر",
  unknown: "—",
};

/** التسمية العربية لكل حالة حصة */
export const LESSON_STATUS_AR: Record<LessonAttendance, string> = {
  present: "حاضر",
  absent: "غياب",
  excused: "استئذان",
  late: "تأخير",
};
