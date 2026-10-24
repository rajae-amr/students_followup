import { dayName } from "./util";
import type { AssignmentInput, Diagnostic, SolverInput } from "./types";

/**
 * فحوص ما قبل الحل — تكشف أسباب الاستحالة الواضحة قبل تشغيل CP-SAT.
 * تغطي أغلب الحالات الواقعية (مثل "معلم يحتاج 30 حصة وله 25 خانة فقط").
 */
export function preSolveChecks(input: Omit<SolverInput, "constraints"> & { constraints?: SolverInput["constraints"] }): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const { workingDays, periodsPerDay, assignments, unavailable, teacherMaxDaily } = input;
  const C = input.constraints; // قد يكون غير موجود في سياقات الفحص الجزئي
  const periodsOf = (d: number) => periodsPerDay.get(d) ?? [];
  const totalSlots = workingDays.reduce((s, d) => s + periodsOf(d).length, 0);
  const maxP = Math.max(0, ...[...periodsPerDay.values()].map((l) => l.length));

  // تجميع حسب المعلم والشعبة
  const byTeacher = new Map<string, AssignmentInput[]>();
  const bySection = new Map<string, AssignmentInput[]>();
  for (const a of assignments) {
    if (!byTeacher.has(a.teacherId)) byTeacher.set(a.teacherId, []);
    byTeacher.get(a.teacherId)!.push(a);
    if (!bySection.has(a.sectionId)) bySection.set(a.sectionId, []);
    bySection.get(a.sectionId)!.push(a);
  }

  const nameOf = (map: Map<string, string>, id: string) => map.get(id) ?? id;

  // 1) لكل تكليف: هل توجد خانات متاحة كافية؟ وهل يمكن توزيعها ضمن maxPerDay؟
  for (const a of assignments) {
    const un = unavailable.get(a.teacherId);
    // خانات المادة المحظورة تُخصم من المتاح فقط عندما يكون القيد صارمًا
    const subjBlock =
      C?.subjectBlock.mode === "hard" ? input.subjectBlocked?.get(a.subjectId) : undefined;
    let avail = 0;
    for (const d of workingDays) {
      for (const p of periodsOf(d)) {
        if (!un?.has(`${d}-${p}`) && !subjBlock?.has(`${d}-${p}`)) avail++;
      }
    }
    const subj = nameOf(input.subjectNames, a.subjectId);
    const sec = nameOf(input.sectionNames, a.sectionId);
    const t = nameOf(input.teacherNames, a.teacherId);
    if (a.weeklyPeriods <= 0) {
      diags.push({
        severity: "warning",
        code: "ASSIGNMENT_NO_QUOTA",
        message: `تكليف ${subj} (${sec}) للمعلم ${t} بلا نصاب — حدّد «الحصص/الأسبوع» لهذه المادة في هذا الصف من صفحة الأنصبة الأسبوعية`,
      });
      continue;
    }
    if (a.weeklyPeriods > avail) {
      diags.push({
        severity: "error",
        code: "ASSIGNMENT_NO_SLOTS",
        message: `تكليف ${subj} (${sec}) للمعلم ${t} يحتاج ${a.weeklyPeriods} حصص لكن المتاح له ${avail} خانة فقط`,
      });
    }
  }

  // 1ب) حد أدنى أيام المادة لكل شعبة: يكفي الطلب لتغطية الأيام؟ وهل الحد ضمن أيام الدوام؟
  if (input.subjectMinDays && (!C || C.minDaysPerWeek.mode !== "off")) {
    const minDaysHard = !C || C.minDaysPerWeek.mode === "hard";
    const demandByPair = new Map<string, number>();
    for (const a of assignments) {
      const k = `${a.sectionId}|${a.subjectId}`;
      demandByPair.set(k, (demandByPair.get(k) ?? 0) + a.weeklyPeriods);
    }
    for (const [pair, demand] of demandByPair) {
      const subjId = pair.slice(pair.lastIndexOf("|") + 1);
      const minDays = input.subjectMinDays.get(subjId) ?? 0;
      if (minDays <= 0) continue;
      const secId = pair.slice(0, pair.lastIndexOf("|"));
      const subj = nameOf(input.subjectNames, subjId);
      const sec = nameOf(input.sectionNames, secId);
      if (minDays > workingDays.length || demand < minDays) {
        diags.push({
          severity: minDaysHard ? "error" : "warning",
          code: "MIN_DAYS_IMPOSSIBLE",
          message: `مادة ${subj} (${sec}) مطلوبة في ${minDays} أيام على الأقل لكن نصابها ${demand} حصة على ${workingDays.length} أيام دوام — قلّل حد الأيام أو ارفع النصاب`,
        });
      }
    }
  }

  // 2) لكل معلم: الطلب الكلي مقابل الخانات المتاحة
  for (const [teacherId, list] of byTeacher) {
    const demand = list.reduce((s, a) => s + a.weeklyPeriods, 0);
    const un = unavailable.get(teacherId)?.size ?? 0;
    const avail = totalSlots - un;
    const t = nameOf(input.teacherNames, teacherId);
    if (demand > avail) {
      diags.push({
        severity: "error",
        code: "TEACHER_OVERLOAD",
        message: `المعلم ${t} يحتاج ${demand} حصة أسبوعية بينما عدد الخانات المتاحة له ${avail} فقط — قلّل النصاب أو أزل بعض خانات عدم التوفر`,
      });
    } else if (demand > avail * 0.9) {
      diags.push({
        severity: "warning",
        code: "TEACHER_TIGHT",
        message: `المعلم ${t} يحتاج ${demand} حصة من ${avail} خانة متاحة — هامش ضيق جدًا قد يصعّب إيجاد جدول جيد`,
      });
    }

    // 3) الحد اليومي للمعلم مقابل طلبه (خطأ فقط إذا كان القيد صارمًا)
    const maxDaily = teacherMaxDaily.get(teacherId) ?? maxP;
    const weeklyCap = maxDaily * workingDays.length;
    if (demand > weeklyCap && (!C || C.teacherMaxDaily.mode === "hard")) {
      diags.push({
        severity: "error",
        code: "TEACHER_DAILY_CAP",
        message: `المعلم ${t} يحتاج ${demand} حصة لكن حدّه اليومي ${maxDaily}×${workingDays.length} = ${weeklyCap} — ارفع الحد اليومي أو قلّل النصاب`,
      });
    }

    // 3ب) دوام كل الأيام (صارم): الطلب يكفي لتغطية الأيام؟ وهل كل الأيام متاحة؟
    if (C?.teacherEveryDay.mode === "hard") {
      if (demand < workingDays.length) {
        diags.push({
          severity: "error",
          code: "EVERYDAY_SHORT",
          message: `قيد «دوام كل الأيام» صارم لكن المعلم ${t} لديه ${demand} حصة فقط مقابل ${workingDays.length} أيام دوام — مستحيل تغطية كل الأيام`,
        });
      }
      const un2 = unavailable.get(teacherId);
      for (const d of workingDays) {
        if (periodsOf(d).length > 0 && periodsOf(d).every((p) => un2?.has(`${d}-${p}`))) {
          diags.push({
            severity: "error",
            code: "EVERYDAY_BLOCKED",
            message: `قيد «دوام كل الأيام» صارم لكن المعلم ${t} محظور بالكامل يوم ${dayName(d)} — أزل حظره أو خفف القيد`,
          });
        }
      }
    }
  }

  // 3د) حد المادة اليومي مقابل طلبها الأسبوعي لكل شعبة
  if (input.subjectMaxPerDay && (!C || C.maxPerDay.mode !== "off")) {
    const bySecSubj = new Map<string, number>();
    for (const a of assignments) {
      const k = `${a.sectionId}|${a.subjectId}`;
      bySecSubj.set(k, (bySecSubj.get(k) ?? 0) + a.weeklyPeriods);
    }
    for (const [key, demand] of bySecSubj) {
      const [secId, subjId] = key.split("|") as [string, string];
      const cap = input.subjectMaxPerDay.get(subjId);
      if (cap == null) continue;
      const maxSlots = cap * workingDays.length;
      if (demand > maxSlots) {
        diags.push({
          severity: !C || C.maxPerDay.mode === "hard" ? "error" : "warning",
          code: "SUBJECT_DAILY_CAP",
          message: `مادة ${nameOf(input.subjectNames, subjId)} لها حد يومي ${cap} لكن الشعبة ${nameOf(input.sectionNames, secId)} تحتاج ${demand} حصة أسبوعيًا (الأقصى ${maxSlots}) — ارفع حد المادة أو قلّل نصابها`,
        });
      }
    }
  }

  // 4) لكل شعبة: الطلب الكلي مقابل الخانات
  for (const [sectionId, list] of bySection) {
    const demand = list.reduce((s, a) => s + a.weeklyPeriods, 0);
    const sec = nameOf(input.sectionNames, sectionId);
    if (demand > totalSlots) {
      diags.push({
        severity: "error",
        code: "SECTION_OVERLOAD",
        message: `الشعبة ${sec} تحتاج ${demand} حصة بينما اليوم الدراسي يوفر ${totalSlots} خانة فقط`,
      });
    } else if (demand < totalSlots * 0.9) {
      // المفروض أن الشعبة ممتلئة — النقص يعني غالبًا نصابًا ناقصًا أو تكليفًا غير مسنَد
      const empty = totalSlots - demand;
      diags.push({
        severity: "warning",
        code: "SECTION_UNDERFILLED",
        message: `الشعبة ${sec} فيها ${empty} ${empty === 1 ? "خانة فارغة" : "خانات فارغة"} (${demand}/${totalSlots}) — راجع اكتمال أنصبة المواد وتكاليفها`,
      });
    }
  }

  return diags;
}

/**
 * عند فشل الحل: نجرب سلّم تراخيص لتحديد عائلة القيود المسببة.
 * يعيد قائمة الاسترخاءات التي أعادت الحل + وصفها بالعربية.
 */
export type RelaxationStep = {
  id: "DROP_MAX_PER_DAY" | "DROP_TEACHER_CONSEC" | "DROP_TEACHER_DAILY" | "DROP_AVAILABILITY" | "DROP_SPREAD_RULES" | "ALLOW_SHORTFALL";
  label: string;
  apply: (input: SolverInput) => SolverInput;
};

export const RELAXATION_LADDER: RelaxationStep[] = [
  {
    id: "DROP_MAX_PER_DAY",
    label: "إزالة قيد «أقصى حصص يومية للمادة»",
    apply: (input) => ({
      ...input,
      subjectMaxPerDay: new Map(),
    }),
  },
  {
    id: "DROP_TEACHER_CONSEC",
    label: "إزالة قيد «أقصى حصص متتالية للمعلم»",
    apply: (input) => ({
      ...input,
      constraints: {
        ...input.constraints,
        teacherMaxConsec: { ...input.constraints.teacherMaxConsec, mode: "off" },
      },
    }),
  },
  {
    id: "DROP_TEACHER_DAILY",
    label: "إزالة قيد «الحد اليومي لحصص المعلم»",
    apply: (input) => ({
      ...input,
      constraints: {
        ...input.constraints,
        teacherMaxDaily: { ...input.constraints.teacherMaxDaily, mode: "off" },
      },
    }),
  },
  {
    id: "DROP_SPREAD_RULES",
    label: "إزالة قواعد التوزيع (حد أدنى أيام التكليف ودوام كل الأيام وعدالة الجدول)",
    apply: (input) => ({
      ...input,
      subjectMinDays: new Map(),
      constraints: {
        ...input.constraints,
        teacherEveryDay: { ...input.constraints.teacherEveryDay, mode: "off" },
        dailyBalance: { ...input.constraints.dailyBalance, mode: "off" },
        fairLastPeriod: { ...input.constraints.fairLastPeriod, mode: "off" },
      },
    }),
  },
  {
    id: "DROP_AVAILABILITY",
    label: "تجاهل خانات عدم توفر المعلمين",
    apply: (input) => ({ ...input, unavailable: new Map() }),
  },
  {
    id: "ALLOW_SHORTFALL",
    label: "السماح بنقص الحصص عن النصاب المطلوب",
    apply: (input) => input, // يُعالَج داخل باني النموذج عبر راية خاصة
  },
];
