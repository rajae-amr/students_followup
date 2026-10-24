import type { SolverInput } from "./types";
import { DEFAULT_CONSTRAINTS } from "./types";
import { dayName } from "./util";

/**
 * متحقق مستقل عن الحلّال — كود منفصل تمامًا يفحص القيود الصلبة.
 * مبدأ مهم: التحقق من صحة الجدول لا يجوز أن يشارك منطقًا مع منشئ الجدول.
 */

export type ResolvedEntry = {
  assignmentId: string;
  teacherId: string;
  sectionId: string;
  dayOfWeek: number;
  periodIndex: number;
};

export type Violation = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

function key(d: number, p: number): `${number}-${number}` {
  return `${d}-${p}`;
}

/**
 * يفحص وضع تكليف واحد في خانة (d,p) ضد مجموعة حصص موجودة.
 * يُستخدم للتعديل اليدوي واقتراح الخانات البديلة.
 */
export function checkPlacement(
  input: Pick<SolverInput, "workingDays" | "periodsPerDay" | "unavailable" | "teacherNames" | "sectionNames"> &
    Partial<Pick<SolverInput, "assignments" | "subjectNames" | "subjectBlocked" | "subjectMaxPerDay" | "constraints">>,
  occupied: ResolvedEntry[],
  candidate: ResolvedEntry
): Violation[] {
  const violations: Violation[] = [];

  if (!input.workingDays.includes(candidate.dayOfWeek)) {
    violations.push({
      severity: "error",
      code: "NOT_WORKING_DAY",
      message: `${dayName(candidate.dayOfWeek)} ليس من أيام الدوام`,
    });
  }
  if (!(input.periodsPerDay.get(candidate.dayOfWeek) ?? []).includes(candidate.periodIndex)) {
    violations.push({
      severity: "error",
      code: "BREAK_PERIOD",
      message: "هذه الخانة ليست حصة دراسية في هذا اليوم",
    });
  }
  if (input.unavailable.get(candidate.teacherId)?.has(key(candidate.dayOfWeek, candidate.periodIndex))) {
    violations.push({
      severity: "error",
      code: "TEACHER_UNAVAILABLE",
      message: `المعلم ${input.teacherNames.get(candidate.teacherId) ?? ""} غير متاح في ${dayName(candidate.dayOfWeek)} الحصة ${candidate.periodIndex + 1}`,
    });
  }

  // خانة محظورة على مادة التكليف (إن زُوّدت البيانات)
  const cs = input.constraints ?? DEFAULT_CONSTRAINTS;
  if (cs.subjectBlock.mode !== "off" && input.subjectBlocked && input.assignments) {
    const a = input.assignments.find((x) => x.id === candidate.assignmentId);
    if (a && input.subjectBlocked.get(a.subjectId)?.has(key(candidate.dayOfWeek, candidate.periodIndex))) {
      violations.push({
        severity: cs.subjectBlock.mode === "hard" ? "error" : "warning",
        code: "SUBJECT_SLOT",
        message: `مادة ${input.subjectNames?.get(a.subjectId) ?? ""} محظورة في ${dayName(candidate.dayOfWeek)} الحصة ${candidate.periodIndex + 1}`,
      });
    }
  }

  // حد المادة اليومي على الشعبة — يجمع كل تكاليف المادة مهما كان معلمها
  if (cs.maxPerDay.mode !== "off" && input.subjectMaxPerDay && input.assignments) {
    const aById = new Map(input.assignments.map((x) => [x.id, x]));
    const subj = aById.get(candidate.assignmentId)?.subjectId;
    const cap = subj ? input.subjectMaxPerDay.get(subj) : undefined;
    if (subj && cap != null) {
      // نستبعد المرشَّح نفسه من العد — قد تكون موجودًا في occupied عند فحص الجدول الكامل
      const count = occupied.filter(
        (e) =>
          !(
            e.assignmentId === candidate.assignmentId &&
            e.dayOfWeek === candidate.dayOfWeek &&
            e.periodIndex === candidate.periodIndex
          ) &&
          e.sectionId === candidate.sectionId &&
          e.dayOfWeek === candidate.dayOfWeek &&
          aById.get(e.assignmentId)?.subjectId === subj
      ).length;
      if (count + 1 > cap) {
        violations.push({
          severity: cs.maxPerDay.mode === "hard" ? "error" : "warning",
          code: "MAX_PER_DAY",
          message: `مادة ${input.subjectNames?.get(subj) ?? ""} تتجاوز حدها اليومي (${cap}) لدى الشعبة ${input.sectionNames.get(candidate.sectionId) ?? ""}`,
        });
      }
    }
  }

  for (const e of occupied) {
    if (e.assignmentId === candidate.assignmentId && e.dayOfWeek === candidate.dayOfWeek && e.periodIndex === candidate.periodIndex) {
      continue; // نفس الحصة (عند إعادة تقييم موضعها الحالي)
    }
    if (e.dayOfWeek === candidate.dayOfWeek && e.periodIndex === candidate.periodIndex) {
      if (e.teacherId === candidate.teacherId) {
        violations.push({
          severity: "error",
          code: "TEACHER_CONFLICT",
          message: `المعلم ${input.teacherNames.get(candidate.teacherId) ?? ""} يدرّس الشعبة ${input.sectionNames.get(e.sectionId) ?? ""} في نفس الوقت`,
        });
      }
      if (e.sectionId === candidate.sectionId) {
        violations.push({
          severity: "error",
          code: "SECTION_CONFLICT",
          message: `الشعبة ${input.sectionNames.get(candidate.sectionId) ?? ""} لديها حصة أخرى في نفس الوقت`,
        });
      }
    }
  }
  return violations;
}

/** سياق التحقق الكامل — الحقول الإضافية اختيارية حتى تعمل الفحوص البنيوية بدونها */
export type ValidationInput = Pick<
  SolverInput,
  "workingDays" | "periodsPerDay" | "unavailable" | "assignments" | "teacherNames" | "sectionNames" | "subjectNames"
> &
  Partial<
    Pick<
      SolverInput,
      "constraints" | "teacherMaxDaily" | "teacherMaxConsec" | "subjectPreferEarly" | "subjectBlocked" | "subjectMaxPerDay" | "subjectMinDays"
    >
  >;

/**
 * يفحص جدولًا كاملًا: تعارضات ثنائية + اكتمال عدد الحصص لكل تكليف
 * + القيود المفعّلة (صارم → error، مفضّل → warning).
 */
export function validateTimetable(
  input: ValidationInput,
  entries: ResolvedEntry[]
): Violation[] {
  const violations: Violation[] = [];

  // 1) فحص كل حصة منفردة
  for (const e of entries) {
    violations.push(...checkPlacement(input, entries, e));
  }
  // إزالة التكرار (كل تعارض ثنائي يُحصى مرتين)
  const seen = new Set<string>();
  const unique = violations.filter((v) => {
    const k = `${v.code}:${v.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // 2) اكتمال عدد الحصص لكل تكليف
  const countByAssignment = new Map<string, number>();
  for (const e of entries) {
    countByAssignment.set(e.assignmentId, (countByAssignment.get(e.assignmentId) ?? 0) + 1);
  }
  for (const a of input.assignments) {
    const got = countByAssignment.get(a.id) ?? 0;
    if (got !== a.weeklyPeriods) {
      unique.push({
        severity: "error",
        code: "ASSIGNMENT_COUNT",
        message: `تكليف ${input.subjectNames.get(a.subjectId) ?? ""} (${input.sectionNames.get(a.sectionId) ?? ""}) مجدول ${got}/${a.weeklyPeriods} حصة`,
      });
    }
  }

  // 3) القيود القابلة للتخصيص — بحسب إعدادات المدرسة
  const C = input.constraints ?? DEFAULT_CONSTRAINTS;
  const maxP = Math.max(0, ...[...input.periodsPerDay.values()].map((l) => l.length));
  const sev = (kind: keyof typeof C) => (C[kind].mode === "hard" ? "error" : "warning") as Violation["severity"];

  // تجميع حسب (شعبة+مادة، يوم) و(معلم، يوم)
  const bySecSubjDay = new Map<string, number>();
  const byTeacherDay = new Map<string, number>();
  const daysBySecSubj = new Map<string, Set<number>>();
  const daysByTeacher = new Map<string, Set<number>>();
  const aById = new Map(input.assignments.map((a) => [a.id, a]));
  for (const e of entries) {
    pushNum(byTeacherDay, `${e.teacherId}-${e.dayOfWeek}`);
    addToSet(daysByTeacher, e.teacherId, e.dayOfWeek);
    const subj = aById.get(e.assignmentId)?.subjectId;
    if (subj) {
      pushNum(bySecSubjDay, `${e.sectionId}|${subj}|${e.dayOfWeek}`);
      addToSet(daysBySecSubj, `${e.sectionId}|${subj}`, e.dayOfWeek);
    }
  }

  // حد المادة اليومي على الشعبة
  if (C.maxPerDay.mode !== "off") {
    if (input.subjectMaxPerDay) {
      for (const [key, count] of bySecSubjDay) {
        const [secId, subjId, d] = key.split("|") as [string, string, string];
        const cap = input.subjectMaxPerDay.get(subjId);
        if (cap != null && count > cap) {
          unique.push({
            severity: sev("maxPerDay"),
            code: "MAX_PER_DAY",
            message: `مادة ${input.subjectNames.get(subjId) ?? ""} مجدولة ${count} مرات يوم ${dayName(Number(d))} للشعبة ${input.sectionNames.get(secId) ?? ""} (الحد ${cap})`,
          });
        }
      }
    }
  }

  // حد أدنى لأيام ظهور المادة لكل شعبة — يجمع كل تكاليف المادة للشعبة
  if (C.minDaysPerWeek.mode !== "off" && input.subjectMinDays) {
    const pairs = new Set(input.assignments.map((a) => `${a.sectionId}|${a.subjectId}`));
    for (const pair of pairs) {
      const subjId = pair.slice(pair.lastIndexOf("|") + 1);
      const minDays = input.subjectMinDays.get(subjId) ?? 0;
      if (minDays <= 0) continue;
      const secId = pair.slice(0, pair.lastIndexOf("|"));
      const used = daysBySecSubj.get(pair)?.size ?? 0;
      if (used < minDays) {
        unique.push({
          severity: sev("minDaysPerWeek"),
          code: "MIN_DAYS",
          message: `مادة ${input.subjectNames.get(subjId) ?? ""} (${input.sectionNames.get(secId) ?? ""}) ظهرت في ${used} أيام فقط (المطلوب ${minDays})`,
        });
      }
    }
  }

  // الحد اليومي وحد أيام الدوام للمعلم + الحصة الأخيرة
  for (const [key, count] of byTeacherDay) {
    const teacherId = key.slice(0, key.lastIndexOf("-"));
    const day = Number(key.slice(key.lastIndexOf("-") + 1));
    const max = input.teacherMaxDaily?.get(teacherId) ?? maxP;
    if (C.teacherMaxDaily.mode !== "off" && count > max) {
      unique.push({
        severity: sev("teacherMaxDaily"),
        code: "TEACHER_DAILY",
        message: `المعلم ${input.teacherNames.get(teacherId) ?? ""} لديه ${count} حصص يوم ${dayName(day)} (الحد ${max})`,
      });
    }
    // أقصى حصص متتالية للمعلم في اليوم
    const maxConsec = C.teacherMaxConsec.mode !== "off" ? input.teacherMaxConsec?.get(teacherId) : undefined;
    if (maxConsec != null && maxConsec > 0 && count > maxConsec) {
      const lps = input.periodsPerDay.get(day) ?? [];
      const positions = entries
        .filter((e) => e.teacherId === teacherId && e.dayOfWeek === day)
        .map((e) => lps.indexOf(e.periodIndex))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b);
      let run = 1;
      let worst = positions.length > 0 ? 1 : 0;
      for (let i = 1; i < positions.length; i++) {
        run = positions[i]! === positions[i - 1]! + 1 ? run + 1 : 1;
        if (run > worst) worst = run;
      }
      if (worst > maxConsec) {
        unique.push({
          severity: sev("teacherMaxConsec"),
          code: "MAX_CONSEC",
          message: `المعلم ${input.teacherNames.get(teacherId) ?? ""} لديه ${worst} حصص متتالية يوم ${dayName(day)} (الحد ${maxConsec})`,
        });
      }
    }
  }
  // دوام المعلم كل الأيام — لا يوم بلا حصة
  if (C.teacherEveryDay.mode !== "off") {
    for (const teacherId of new Set(input.assignments.map((a) => a.teacherId))) {
      const empty = input.workingDays.length - (daysByTeacher.get(teacherId)?.size ?? 0);
      if (empty > 0) {
        unique.push({
          severity: sev("teacherEveryDay"),
          code: "TEACHER_EMPTY_DAY",
          message: `المعلم ${input.teacherNames.get(teacherId) ?? ""} لديه ${empty} ${empty === 1 ? "يوم بلا حصص" : "أيام بلا حصص"}`,
        });
      }
    }
  }

  // توازن الحمل اليومي — حصص فوق ⌈حمل المعلم/أيام الدوام⌉
  if (C.dailyBalance.mode !== "off") {
    const demandOf = new Map<string, number>();
    for (const a of input.assignments) {
      demandOf.set(a.teacherId, (demandOf.get(a.teacherId) ?? 0) + a.weeklyPeriods);
    }
    for (const [key, count] of byTeacherDay) {
      const teacherId = key.slice(0, key.lastIndexOf("-"));
      const day = Number(key.slice(key.lastIndexOf("-") + 1));
      const base = Math.ceil((demandOf.get(teacherId) ?? 0) / input.workingDays.length);
      if (base > 0 && count > base) {
        unique.push({
          severity: sev("dailyBalance"),
          code: "DAILY_IMBALANCE",
          message: `المعلم ${input.teacherNames.get(teacherId) ?? ""} لديه ${count} حصص يوم ${dayName(day)} — نصيبه العادل ${base} حصة/يوم`,
        });
      }
    }
  }

  // عدالة الحصة الأخيرة — معلم يتجاوز نصيبه العادل من خانات نهاية اليوم
  if (C.fairLastPeriod.mode !== "off") {
    const sectionIds = new Set(input.assignments.map((a) => a.sectionId));
    const tIds = new Set(input.assignments.map((a) => a.teacherId));
    const share = Math.max(1, Math.ceil((sectionIds.size * input.workingDays.length) / tIds.size));
    const lastByTeacher = new Map<string, number>();
    for (const e of entries) {
      const lps = input.periodsPerDay.get(e.dayOfWeek) ?? [];
      if (lps.length === 0 || e.periodIndex !== lps[lps.length - 1]) continue;
      lastByTeacher.set(e.teacherId, (lastByTeacher.get(e.teacherId) ?? 0) + 1);
    }
    for (const [t, n] of lastByTeacher) {
      if (n > share) {
        unique.push({
          severity: sev("fairLastPeriod"),
          code: "FAIR_LAST_PERIOD",
          message: `المعلم ${input.teacherNames.get(t) ?? ""} لديه ${n} حصص أخيرة في الأسبوع — النصيب العادل بين المعلمين ${share}`,
        });
      }
    }
  }

  return unique;
}

function pushNum(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}
function addToSet(map: Map<string, Set<number>>, key: string, val: number) {
  const set = map.get(key) ?? new Set<number>();
  set.add(val);
  map.set(key, set);
}

export type SlotSuggestion = {
  dayOfWeek: number;
  periodIndex: number;
  status: "free" | "conflict";
  reasons: string[];
};

/**
 * يقترح كل الخانات الصالحة لتكليف معيّن — لميزة «أماكن مقترحة».
 */
export function suggestSlots(
  input: Pick<
    SolverInput,
    "workingDays" | "periodsPerDay" | "unavailable" | "assignments" | "teacherNames" | "sectionNames"
  > &
    Partial<Pick<SolverInput, "subjectNames" | "subjectBlocked" | "constraints">>,
  occupied: ResolvedEntry[],
  assignmentId: string
): SlotSuggestion[] {
  const assignment = input.assignments.find((a) => a.id === assignmentId);
  if (!assignment) return [];

  const suggestions: SlotSuggestion[] = [];
  for (const dayOfWeek of input.workingDays) {
    for (const periodIndex of input.periodsPerDay.get(dayOfWeek) ?? []) {
      const violations = checkPlacement(
        input,
        occupied,
        { assignmentId, teacherId: assignment.teacherId, sectionId: assignment.sectionId, dayOfWeek, periodIndex }
      );
      suggestions.push({
        dayOfWeek,
        periodIndex,
        status: violations.length === 0 ? "free" : "conflict",
        reasons: violations.map((v) => v.message),
      });
    }
  }
  return suggestions;
}
