/**
 * استيراد بيانات SQLite القديمة إلى PostgreSQL — تعيين صريح لكل جدول.
 *
 * مبادئ:
 * - يفتح النسخة الاحتياطية فقط (readonly) — لا يمس القاعدة الحية إطلاقاً.
 * - كل سجل مستورد يُسجَّل في LegacyRecordMap للمصالحة.
 * - البيانات الملتبسة (بلا معلم/مادة/مصدر) تُحفظ كموروثة مع ReviewIssue.
 * - --dry: جرد فقط بلا أي كتابة.
 *
 * الاستخدام:
 *   npx tsx tools/legacy/import.ts <snapshot.db> [--dry]
 *   DATABASE_URL=... npx tsx tools/legacy/import.ts snapshot.db
 */

import Database from "better-sqlite3";
import { prisma } from "@app/db";
import { Prisma } from "@prisma/client";

const dbPath = process.argv[2];
const DRY = process.argv.includes("--dry");
if (!dbPath) {
  console.error("الاستخدام: import.ts <snapshot.db> [--dry]");
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const rows = <T>(sql: string, ...args: unknown[]) =>
  db.prepare(sql).all(...(args as never[])) as T[];

// خرائط النصوص العربية القديمة → قيم النظام الجديد
const ATT_MAP: Record<string, "present" | "absent" | "excused" | "late"> = {
  "حاضر": "present", "ح": "present",
  "غائب": "absent", "غ": "absent",
  "غائب بعذر": "excused", "استئذان": "excused", "ع": "excused",
  "متأخر": "late", "تأخير": "late", "م": "late",
};
const DAY_MAP: Record<string, "present" | "absent" | "excused" | "partial" | "late" | "unknown"> = {
  "حاضر": "present", "غائب": "absent", "غائب بعذر": "excused",
  "متأخر": "late", "غياب جزئي": "partial",
};
const BEH_MAP: Record<string, "excellent" | "committed" | "needs_followup"> = {
  "ممتاز": "excellent", "ملتزم": "committed", "يحتاج متابعة": "needs_followup",
};

const parseDate = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
const weekdayOf = (dateStr: string) => parseDate(dateStr).getUTCDay();

interface Issue {
  severity: "info" | "warning" | "blocking";
  message: string;
}
const issues: Issue[] = [];
const stats: Record<string, number> = {};
const count = (k: string, n = 1) => (stats[k] = (stats[k] ?? 0) + n);

async function main() {
  // ---------- جرد أولي ----------
  const legacyUsers = rows<{ id: number; username: string; display_name: string; role: string; subject: string; telegram_chat_id: number | null; active: number }>(
    "SELECT id, username, display_name, role, subject, telegram_chat_id, active FROM users",
  );
  const legacyClasses = rows<{ id: number; name: string }>("SELECT id, name FROM classes");
  const legacyStudents = rows<{ id: number; name: string; class_name: string; parent_name: string; parent_phone: string; telegram_chat_id: number | null; teacher_id: number | null }>(
    "SELECT id, name, class_name, parent_name, parent_phone, telegram_chat_id, teacher_id FROM students",
  );
  const teacherClasses = rows<{ teacher_id: number; class_name: string }>("SELECT * FROM teacher_classes");
  const teacherPeriods = rows<{ teacher_id: number; class_name: string; weekday: number; period: number }>(
    "SELECT * FROM teacher_periods",
  );
  const periodAtt = rows<{ student_id: number; date: string; period: number; status: string; behavior: string }>(
    "SELECT * FROM period_attendance",
  );
  const dailyAtt = rows<{ student_id: number; date: string; status: string; behavior: string }>(
    "SELECT * FROM attendance",
  );
  const legacyGrades = rows<{ id: number; student_id: number; subject: string; assessment_type: string; score: number | null; max_score: number | null; date: string; title: string }>(
    "SELECT * FROM grades",
  );
  const legacyBehavior = rows<{ id: number; student_id: number; date: string; kind: string; description: string }>(
    "SELECT * FROM behavior",
  );
  const legacyNotes = rows<{ id: number; student_id: number; date: string; note: string }>("SELECT * FROM notes");
  const legacyEvals = rows<{ student_id: number; period: string; academic_score: number | null; academic_letter: string | null; participation: string | null; alef: string | null; books: string | null }>(
    "SELECT * FROM evaluations",
  );
  const studentLinks = rows<{ student_id: number; chat_id: number }>("SELECT * FROM student_links");
  const reportLog = rows<{ id: number }>("SELECT id FROM report_log");

  if (DRY) {
    console.log("== وضع الجرد (--dry) — لا كتابة ==");
    console.log(`مستخدمون: ${legacyUsers.length} | صفوف: ${legacyClasses.length} | طلاب: ${legacyStudents.length}`);
    console.log(`إسنادات صفوف: ${teacherClasses.length} | حصص مجدولة: ${teacherPeriods.length}`);
    console.log(`حضور حصص: ${periodAtt.length} | حضور يومي: ${dailyAtt.length}`);
    console.log(`درجات: ${legacyGrades.length} | سلوك: ${legacyBehavior.length} | ملاحظات: ${legacyNotes.length}`);
    console.log(`تقييمات: ${legacyEvals.length} | روابط أولياء: ${studentLinks.length} | سجل تقارير: ${reportLog.length}`);
    // فحوص جودة
    const noClass = legacyStudents.filter((s) => !legacyClasses.some((c) => c.name === s.class_name));
    if (noClass.length) console.log(`⚠ طلاب بصفوف غير معرفة: ${noClass.length}`);
    const badStatus = periodAtt.filter((p) => p.status && !ATT_MAP[p.status]);
    if (badStatus.length) console.log(`⚠ حالات حضور غير معروفة: ${new Set(badStatus.map((b) => b.status)).size}`);
    const noTeacher = legacyStudents.filter((s) => !s.teacher_id);
    if (noTeacher.length) console.log(`⚠ طلاب بلا معلم: ${noTeacher.length}`);
    db.close();
    return;
  }

  // ---------- الاستيراد ----------
  const batch = await prisma.importBatch.create({
    data: { kind: "legacy_full", status: "review", summary: { source: dbPath } },
  });
  const map = async (
    legacyTable: string,
    legacyId: string | number,
    newEntityType: string | null,
    newEntityId: string | null,
  ) =>
    prisma.legacyRecordMap.create({
      data: {
        importBatchId: batch.id,
        legacyTable,
        legacyId: String(legacyId),
        newEntityType,
        newEntityId,
      },
    });
  const review = (entityType: string, entityId: string | null, severity: Issue["severity"], message: string) =>
    prisma.reviewIssue.create({ data: { entityType, entityId, severity, message } });

  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  if (!year) throw new Error("شغّل bootstrap أولاً — لا يوجد عام دراسي حالي");

  // حساب «موروث» لسجلات بلا معلم موثوق
  let legacyTeacher = await prisma.user.findUnique({ where: { username: "legacy_import" } });
  if (!legacyTeacher) {
    legacyTeacher = await prisma.user.create({
      data: {
        name: "سجلات موروثة (غير موثقة المصدر)",
        username: "legacy_import",
        role: "teacher",
        isActive: false,
      },
    });
  }

  // 1) المستخدمون → User (بلا كلمات مرور — التفعيل عبر دعوات)
  const userMap = new Map<number, string>();
  for (const u of legacyUsers) {
    const existing = await prisma.user.findUnique({ where: { username: u.username } });
    const user =
      existing ??
      (await prisma.user.create({
        data: {
          username: u.username,
          name: u.display_name || u.username,
          role: u.role === "admin" ? "admin" : "teacher",
          isActive: u.active === 1,
          telegramChatId: u.telegram_chat_id ? String(u.telegram_chat_id) : null,
        },
      }));
    userMap.set(u.id, user.id);
    if (!existing) {
      await prisma.teacherProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, defaultSubject: u.subject || null },
        update: {},
      });
      await review("User", user.id, "info", `حساب ${u.username} يحتاج دعوة لتعيين كلمة مرور جديدة`);
    }
    await map("users", u.id, "User", user.id);
    count("users");
  }

  // 2) المواد — من مواد المعلمين ومواد الدرجات
  const subjectNames = new Set<string>();
  for (const u of legacyUsers) if (u.subject?.trim()) subjectNames.add(u.subject.trim());
  for (const g of legacyGrades) if (g.subject?.trim()) subjectNames.add(g.subject.trim());
  subjectNames.add("عام");
  const subjectMap = new Map<string, string>();
  for (const name of subjectNames) {
    const s = await prisma.subject.upsert({ where: { name }, create: { name }, update: {} });
    subjectMap.set(name, s.id);
    count("subjects");
  }
  const userSubject = new Map(legacyUsers.map((u) => [u.id, u.subject?.trim() || "عام"]));

  // 3) الصفوف
  const classMap = new Map<string, string>();
  for (const c of legacyClasses) {
    const cls = await prisma.classGroup.upsert({
      where: { academicYearId_name: { academicYearId: year.id, name: c.name } },
      create: { name: c.name, displayName: c.name, academicYearId: year.id },
      update: {},
    });
    classMap.set(c.name, cls.id);
    await map("classes", c.id, "ClassGroup", cls.id);
    count("classes");
  }

  // 4) الطلاب + التسجيل
  const studentMap = new Map<number, string>();
  const guardianPhones: Record<string, { name: string; phone: string; telegram?: number }> = {};
  for (const s of legacyStudents) {
    const student = (await prisma.student.findFirst({ where: { legacyId: s.id } })) ??
      (await prisma.student.create({
        data: { fullName: s.name, legacyId: s.id },
      }));
    studentMap.set(s.id, student.id);
    const classId = classMap.get(s.class_name);
    if (classId) {
      await prisma.enrollment.upsert({
        where: { id: `${student.id}:${classId}:${year.id}` },
        create: { id: `${student.id}:${classId}:${year.id}`, studentId: student.id, classId, academicYearId: year.id },
        update: {},
      });
    } else {
      await review("Student", student.id, "warning", `طالب بلا صف صالح: "${s.class_name}"`);
    }
    if (s.parent_phone?.trim() || s.telegram_chat_id) {
      guardianPhones[String(s.id)] = {
        name: s.parent_name || "ولي الأمر",
        phone: s.parent_phone ?? "",
        ...(s.telegram_chat_id ? { telegram: s.telegram_chat_id } : {}),
      };
    }
    await map("students", s.id, "Student", student.id);
    count("students");
  }

  // 5) إسنادات الصفوف + الحصص المجدولة
  for (const tc of teacherClasses) {
    const teacherId = userMap.get(tc.teacher_id);
    const classId = classMap.get(tc.class_name);
    if (!teacherId || !classId) continue;
    const subjectId = subjectMap.get(userSubject.get(tc.teacher_id) ?? "عام")!;
    await prisma.teachingAssignment.upsert({
      where: {
        teacherId_classId_subjectId_academicYearId: {
          teacherId, classId, subjectId, academicYearId: year.id,
        },
      },
      create: { teacherId, classId, subjectId, academicYearId: year.id },
      update: {},
    });
    count("assignments");
  }
  const slotByKey = new Map<string, string>(); // teacher:class:weekday:period → slotId
  for (const tp of teacherPeriods) {
    const teacherId = userMap.get(tp.teacher_id);
    const classId = classMap.get(tp.class_name);
    if (!teacherId || !classId) continue;
    const subjectId = subjectMap.get(userSubject.get(tp.teacher_id) ?? "عام")!;
    const slot = await prisma.timetableSlot.create({
      data: {
        teacherId, classId, subjectId,
        weekday: tp.weekday, period: tp.period,
        effectiveFrom: year.startDate,
      },
    });
    slotByKey.set(`${tp.teacher_id}:${tp.class_name}:${tp.weekday}:${tp.period}`, slot.id);
    await map("teacher_periods", `${tp.teacher_id}-${tp.class_name}-${tp.weekday}-${tp.period}`, "TimetableSlot", slot.id);
    count("slots");
  }

  // 6) حضور الحصص → LessonSession + AttendanceEntry (جلسات تاريخية "submitted")
  // تجميع بحسب (صف الطالب، تاريخ، حصة)
  const studentInfo = new Map(legacyStudents.map((s) => [s.id, s]));
  const sessionKey = (className: string, date: string, period: number) => `${className}|${date}|${period}`;
  const sessionIds = new Map<string, string>();
  for (const p of periodAtt) {
    const st = studentInfo.get(p.student_id);
    if (!st) { await review("period_attendance", null, "blocking", `سجل لطالب محذوف ${p.student_id}`); continue; }
    const classId = classMap.get(st.class_name);
    const studentId = studentMap.get(p.student_id);
    if (!classId || !studentId) continue;
    const status = ATT_MAP[p.status];
    if (!status) { await review("AttendanceEntry", null, "warning", `حالة غير معروفة "${p.status}" لطالب ${p.student_id} يوم ${p.date}`); continue; }

    const key = sessionKey(st.class_name, p.date, p.period);
    let sessionId = sessionIds.get(key);
    if (!sessionId) {
      // المعلم من جدول الحصص إن طابق، وإلا «موروث»
      const wd = weekdayOf(p.date);
      const teacherIdLegacy = teacherPeriods.find(
        (tp) => tp.class_name === st.class_name && tp.weekday === wd && tp.period === p.period,
      )?.teacher_id;
      const teacherId = teacherIdLegacy ? userMap.get(teacherIdLegacy) : undefined;
      const subjectId = subjectMap.get(
        teacherIdLegacy ? (userSubject.get(teacherIdLegacy) ?? "عام") : "عام",
      )!;
      if (!teacherId) {
        await review("LessonSession", null, "warning", `حصة موروثة بلا معلم موثوق: ${st.class_name} ${p.date} حصة ${p.period}`);
      }
      const session = await prisma.lessonSession.upsert({
        where: { classId_date_period: { classId, date: parseDate(p.date), period: p.period } },
        create: {
          date: parseDate(p.date), period: p.period, classId, subjectId,
          teacherId: teacherId ?? legacyTeacher.id,
          status: "submitted",
        },
        update: {},
      });
      sessionId = session.id;
      sessionIds.set(key, sessionId);
      count("sessions");
    }

    const entry = await prisma.attendanceEntry.upsert({
      where: { lessonSessionId_studentId: { lessonSessionId: sessionId, studentId } },
      create: {
        lessonSessionId: sessionId, studentId, status,
        isAssumed: false, recordedById: null, legacyId: p.student_id,
      },
      update: {},
    });
    await map("period_attendance", `${p.student_id}-${p.date}-${p.period}`, "AttendanceEntry", entry.id);
    count("period_attendance");

    if (p.behavior?.trim()) {
      await prisma.behaviorEntry.create({
        data: {
          studentId, date: parseDate(p.date), period: p.period,
          lessonSessionId: sessionId,
          teacherId: legacyTeacher.id,
          category: BEH_MAP[p.behavior.trim()] ?? null,
          text: p.behavior.trim(),
          audience: "internal",
        },
      });
      count("behavior_from_period");
    }
  }

  // 7) الحضور اليومي → DailySummary (policyVersion=0 = موروث، لا إعادة اشتقاق)
  for (const a of dailyAtt) {
    const studentId = studentMap.get(a.student_id);
    const status = DAY_MAP[a.status];
    if (!studentId || !status) continue;
    await prisma.dailySummary.upsert({
      where: { studentId_date: { studentId, date: parseDate(a.date) } },
      create: {
        studentId, date: parseDate(a.date), status,
        recordedCount: 0, expectedCount: 0, policyVersion: 0,
      },
      update: {},
    });
    count("daily_attendance");
  }

  // 8) الدرجات → Assessment (مجمّعة بالهوية) + Grade
  const assessmentCache = new Map<string, string>();
  for (const g of legacyGrades) {
    const studentId = studentMap.get(g.student_id);
    const st = studentInfo.get(g.student_id);
    if (!studentId || !st) continue;
    const classId = classMap.get(st.class_name);
    if (!classId) continue;
    const subjectId = subjectMap.get(g.subject?.trim() || "عام")!;
    const teacherId = st.teacher_id ? userMap.get(st.teacher_id) : undefined;
    const title = (g.title?.trim() || g.assessment_type?.trim() || "تقييم موروث");
    const maxScore = g.max_score ?? 10;
    const aKey = `${teacherId ?? "legacy"}|${subjectId}|${classId}|${title}|${g.date}|${maxScore}`;
    let assessmentId = assessmentCache.get(aKey);
    if (!assessmentId) {
      const a = await prisma.assessment.create({
        data: {
          teacherId: teacherId ?? legacyTeacher.id,
          classId, subjectId, title,
          kind: g.assessment_type?.trim() || "quiz",
          date: parseDate(g.date), maxScore,
        },
      });
      assessmentId = a.id;
      assessmentCache.set(aKey, a.id);
      count("assessments");
      if (!teacherId) await review("Assessment", a.id, "warning", `تقييم موروث بلا معلم: "${title}" ${g.date}`);
    }
    await prisma.grade.upsert({
      where: { assessmentId_studentId: { assessmentId, studentId } },
      create: { assessmentId, studentId, score: g.score },
      update: {},
    });
    await map("grades", g.id, "Grade", assessmentId);
    count("grades");
  }

  // 9) السلوك والملاحظات
  for (const b of legacyBehavior) {
    const studentId = studentMap.get(b.student_id);
    const st = studentInfo.get(b.student_id);
    if (!studentId) continue;
    const teacherId = st?.teacher_id ? userMap.get(st.teacher_id) : undefined;
    await prisma.behaviorEntry.create({
      data: {
        studentId, date: parseDate(b.date),
        teacherId: teacherId ?? legacyTeacher.id,
        category: BEH_MAP[b.kind?.trim()] ?? null,
        text: b.description || b.kind,
        audience: "internal",
      },
    });
    await map("behavior", b.id, "BehaviorEntry", null);
    count("behavior");
  }
  for (const n of legacyNotes) {
    const studentId = studentMap.get(n.student_id);
    const st = studentInfo.get(n.student_id);
    if (!studentId) continue;
    await prisma.note.create({
      data: {
        studentId, date: parseDate(n.date), text: n.note,
        category: "free", audience: "internal",
        authorId: (st?.teacher_id ? userMap.get(st.teacher_id) : null) ?? null,
      },
    });
    await map("notes", n.id, "Note", null);
    count("notes");
  }

  // 10) التقييمات → Evaluation (بند لكل حقل غير فارغ)
  const evalFields = [
    ["academic_score", "الدرجة الأكاديمية"],
    ["academic_letter", "التقدير"],
    ["participation", "المشاركة"],
    ["alef", "كتاب أ"],
    ["books", "الكتب"],
  ] as const;
  for (const e of legacyEvals) {
    const studentId = studentMap.get(e.student_id);
    const st = studentInfo.get(e.student_id);
    if (!studentId) continue;
    const teacherId = st?.teacher_id ? userMap.get(st.teacher_id) : undefined;
    const subjectId = subjectMap.get(
      st?.teacher_id ? (userSubject.get(st.teacher_id) ?? "عام") : "عام",
    )!;
    for (const [field, label] of evalFields) {
      const v = e[field as keyof typeof e];
      if (v === null || v === undefined || String(v).trim() === "") continue;
      await prisma.evaluation.create({
        data: {
          teacherId: teacherId ?? legacyTeacher.id,
          subjectId, studentId,
          category: `${e.period}:${label}`,
          value: String(v),
        },
      });
      count("evaluations");
    }
    await map("evaluations", `${e.student_id}-${e.period}`, "Evaluation", null);
  }

  // 11) روابط أولياء الأمور → ReviewIssue (لا حسابات بلا دعوات)
  for (const l of studentLinks) {
    const studentId = studentMap.get(l.student_id);
    await review(
      "GuardianStudent", studentId ?? null, "info",
      `رابط تيليجرام قديم للطالب (chat ${l.chat_id}) — يحتاج دعوة وتحقق جديدين`,
    );
    await map("student_links", `${l.student_id}-${l.chat_id}`, null, null);
    count("student_links");
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      summary: {
        source: dbPath,
        stats,
        guardianPhones,
        reportLogRows: reportLog.length,
        importedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  console.log("== اكتمل الاستيراد ==");
  console.log(JSON.stringify(stats, null, 2));
  console.log(`قضايا مراجعة: ${issues.length} (راجع جدول review_issues)`);
  console.log(`أرقام هواتف أولياء الأمور محفوظة في ImportBatch.summary للدعوات اللاحقة`);
  db.close();
}

main().catch((e) => {
  console.error("فشل الاستيراد:", e);
  db.close();
  process.exit(1);
});
