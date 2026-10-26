/**
 * تجميعات التحليلات الإدارية — دوال خادمية مشتركة تقبل نطاقاً موحداً
 * (مدى زمني + اختيارياً مرحلة/صف/مادة) وتُعيد بيانات جاهزة للعرض.
 */
import { prisma } from "@app/db";
import { letterFromPct } from "@app/core";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEKDAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const VIOLATIONS = ["absent", "partial", "late", "excused"] as const;

/** ألوان متباينة بصرياً لسلسلة مخالفات الحضور — أحمر/برتقالي/أصفر/بنفسجي */
export const VIOLATION_SERIES = [
  { key: "غائب", name: "غائب", color: "#dc2626" },
  { key: "جزئي", name: "غياب جزئي", color: "#f97316" },
  { key: "متأخر", name: "متأخر", color: "#eab308" },
  { key: "بعذر", name: "بعذر", color: "#8b5cf6" },
];

export type Scope = {
  from: Date;
  to: Date;
  /** الفترة السابقة بطول النطاق — لمقارنة المؤشرات */
  prevFrom?: Date;
  prevTo?: Date;
  yearId?: string;
  levelId?: string;
  classId?: string;
  subjectId?: string;
};

const fmtDay = (d: Date) => d.toLocaleDateString("ar-OM", { weekday: "short" });
export const toKey = (d: Date) => d.toISOString().slice(0, 10);

/** نطاق الفترة من معاملات URL: مدى (7/30/90) أو فصل دراسي */
export function rangeFromParams(
  sp: { range?: string; term?: string },
  terms: { id: string; name: string; startDate: Date; endDate: Date }[],
  today0: Date,
) {
  const range = sp.range === "7" || sp.range === "90" || sp.range === "term" ? sp.range : "30";
  const termId = sp.term ?? "";
  const chosenTerm = terms.find((t) => t.id === termId);
  let from: Date, to: Date, rangeLabel: string;
  if (range === "term" && chosenTerm) {
    from = chosenTerm.startDate;
    to = chosenTerm.endDate;
    rangeLabel = chosenTerm.name;
  } else {
    const days = range === "7" ? 7 : range === "90" ? 90 : 30;
    to = today0;
    from = new Date(today0.getTime() - (days - 1) * DAY_MS);
    rangeLabel = `آخر ${days} يوماً`;
  }
  const spanDays = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  const prevTo = new Date(from.getTime() - DAY_MS);
  const prevFrom = new Date(prevTo.getTime() - (spanDays - 1) * DAY_MS);
  return { range, termId, from, to, prevFrom, prevTo, rangeLabel };
}

// ─── فلاتر النطاق على علاقات Prisma ───

const enrollSome = (s: Scope) => ({
  ...(s.yearId ? { academicYearId: s.yearId } : {}),
  ...(s.classId ? { classId: s.classId } : s.levelId ? { class: { gradeId: s.levelId } } : {}),
});

/** DailySummary/BehaviorEntry: لا classId مباشر — الترشيح عبر قيد الطالب */
const studentFilter = (s: Scope) =>
  s.classId || s.levelId ? { student: { enrollments: { some: enrollSome(s) } } } : {};

const classSelect = {
  id: true, displayName: true, name: true, gradeId: true,
  grade: { select: { name: true } },
} as const;

const assessWhere = (s: Scope) => ({
  date: { gte: s.from, lte: s.to },
  ...(s.classId ? { classId: s.classId } : {}),
  ...(s.subjectId ? { subjectId: s.subjectId } : {}),
  ...(s.levelId ? { class: { gradeId: s.levelId } } : {}),
});

const sessionWhere = (s: Scope, date?: Date) => ({
  ...(date ? { date } : { date: { gte: s.from, lte: s.to } }),
  ...(s.classId ? { classId: s.classId } : {}),
  ...(s.subjectId ? { subjectId: s.subjectId } : {}),
  ...(s.levelId ? { class: { gradeId: s.levelId } } : {}),
});

// ─── الحضور ───

const pctRate = (rows: { status: string; n: number }[]) => {
  let present = 0, total = 0;
  for (const r of rows) { total += r.n; if (r.status === "present") present += r.n; }
  return total ? Math.round((present / total) * 100) : null;
};

/** اتجاه يومي + نسبة حضور الفترة وسابقتها + نمط أيام الأسبوع */
export async function attendanceStats(s: Scope) {
  const where = { ...studentFilter(s) };
  const [rows, prevRows] = await Promise.all([
    prisma.dailySummary.groupBy({
      by: ["date", "status"], _count: { _all: true },
      where: { date: { gte: s.from, lte: s.to }, ...where },
    }),
    prisma.dailySummary.groupBy({
      by: ["status"], _count: { _all: true },
      where: { date: { gte: s.prevFrom ?? s.from, lte: s.prevTo ?? s.to }, ...where },
    }),
  ]);

  const byDay = new Map<string, Record<string, number>>();
  const wdSum = new Map<number, number>();
  for (const r of rows) {
    const k = toKey(r.date);
    const m = byDay.get(k) ?? {};
    m[r.status] = r._count._all;
    byDay.set(k, m);
    if ((VIOLATIONS as readonly string[]).includes(r.status)) {
      const wd = r.date.getUTCDay();
      if (wd >= 1 && wd <= 5) wdSum.set(wd, (wdSum.get(wd) ?? 0) + r._count._all);
    }
  }
  const trend = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, m]) => ({
    label: fmtDay(new Date(`${k}T12:00:00`)),
    غائب: m.absent ?? 0, جزئي: m.partial ?? 0, متأخر: m.late ?? 0, بعذر: m.excused ?? 0,
  }));

  const wdDays = new Map<number, number>();
  for (let t = s.from.getTime(); t <= s.to.getTime(); t += DAY_MS) {
    const wd = new Date(t).getUTCDay();
    if (wd >= 1 && wd <= 5) wdDays.set(wd, (wdDays.get(wd) ?? 0) + 1);
  }
  const weekdayPattern = [1, 2, 3, 4, 5].map((d) => ({
    label: WEEKDAY_AR[d]!,
    value: wdDays.get(d) ? Math.round(((wdSum.get(d) ?? 0) / wdDays.get(d)!) * 10) / 10 : 0,
  }));

  const flat = rows.map((r) => ({ status: r.status, n: r._count._all }));
  return {
    trend,
    weekdayPattern,
    rate: pctRate(flat),
    prevRate: pctRate(prevRows.map((r) => ({ status: r.status, n: r._count._all }))),
    byDay,
  };
}

/** توزيع حالات يوم محدد */
export async function dayDistribution(date: Date, s: Scope) {
  const rows = await prisma.dailySummary.groupBy({
    by: ["status"], _count: { _all: true }, where: { date, ...studentFilter(s) },
  });
  const map = new Map(rows.map((r) => [r.status, r._count._all]));
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  const present = map.get("present") ?? 0;
  return { map, total, present, rate: total ? Math.round((present / total) * 100) : null };
}

/** صفوف المخالفات (غائب/جزئي/متأخر/بعذر) ببيانات الطالب وصفه ومرحلته */
export async function violationRows(s: Scope) {
  const rows = await prisma.dailySummary.findMany({
    where: { date: { gte: s.from, lte: s.to }, status: { in: [...VIOLATIONS] }, ...studentFilter(s) },
    select: {
      studentId: true, status: true, date: true,
      student: {
        select: {
          fullName: true,
          enrollments: {
            where: s.yearId ? { academicYearId: s.yearId } : {},
            take: 1, select: { class: { select: classSelect } },
          },
        },
      },
    },
  });
  return rows.map((r) => ({
    studentId: r.studentId,
    studentName: r.student.fullName,
    classId: r.student.enrollments[0]?.class.id ?? "",
    className: r.student.enrollments[0]?.class.displayName ?? r.student.enrollments[0]?.class.name ?? "بدون صف",
    gradeId: r.student.enrollments[0]?.class.gradeId ?? "",
  }));
}

/** طلاب تجاوزوا حداً من أيام المخالفات */
export function atRiskStudents(rows: Awaited<ReturnType<typeof violationRows>>, min = 3) {
  const by = new Map<string, { name: string; className: string; classId: string; count: number }>();
  for (const r of rows) {
    const s = by.get(r.studentId) ?? { name: r.studentName, className: r.className, classId: r.classId, count: 0 };
    s.count++;
    by.set(r.studentId, s);
  }
  return [...by.entries()].filter(([, s]) => s.count >= min).sort(([, a], [, b]) => b.count - a.count);
}

/** عدد الطلاب المقيدين لكل صف */
export async function classSizes(yearId: string | undefined, levelId?: string) {
  const rows = await prisma.enrollment.groupBy({
    by: ["classId"], _count: { _all: true },
    where: {
      ...(yearId ? { academicYearId: yearId } : {}),
      ...(levelId ? { class: { gradeId: levelId } } : {}),
    },
  });
  return new Map(rows.map((r) => [r.classId, r._count._all]));
}

// ─── اكتمال الرصد ───

/** حصص اليوم: نسبة المسلَّمة + قائمة غير المرصودة بأسماء المعلمين */
export async function sessionStats(s: Scope, today0: Date) {
  const [byStatus, unrecorded] = await Promise.all([
    prisma.lessonSession.groupBy({
      by: ["status"], _count: { _all: true }, where: sessionWhere(s, today0),
    }),
    prisma.lessonSession.findMany({
      where: { ...sessionWhere(s, today0), status: { in: ["planned", "draft", "reopened"] } },
      orderBy: { period: "asc" }, take: 12,
      select: {
        id: true, period: true, teacherId: true,
        class: { select: { displayName: true, name: true } },
        subject: { select: { name: true } },
      },
    }),
  ]);
  const map = new Map(byStatus.map((r) => [r.status, r._count._all]));
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  const done = map.get("submitted") ?? 0;
  const teachers = unrecorded.length
    ? await prisma.user.findMany({
        where: { id: { in: [...new Set(unrecorded.map((r) => r.teacherId))] } },
        select: { id: true, name: true },
      })
    : [];
  const tName = new Map(teachers.map((t) => [t.id, t.name]));
  return {
    total, done,
    rate: total ? Math.round((done / total) * 100) : null,
    unrecorded: unrecorded.map((r) => ({
      id: r.id, period: r.period,
      className: r.class.displayName ?? r.class.name,
      subjectName: r.subject.name,
      teacherName: tName.get(r.teacherId) ?? "",
    })),
  };
}

// ─── الدرجات ───

export async function gradeStats(s: Scope) {
  const [gradeRows, published, drafts, kindCounts] = await Promise.all([
    prisma.grade.findMany({
      where: {
        status: "normal", score: { not: null },
        assessment: { publishedAt: { not: null }, ...assessWhere(s) },
      },
      select: {
        score: true,
        assessment: {
          select: {
            maxScore: true, subjectId: true,
            subject: { select: { name: true } },
            class: { select: classSelect },
          },
        },
      },
    }),
    prisma.assessment.count({ where: { ...assessWhere(s), publishedAt: { not: null } } }),
    prisma.assessment.count({ where: { ...assessWhere(s), publishedAt: null } }),
    prisma.assessment.groupBy({
      by: ["kind"], _count: { _all: true },
      where: { ...assessWhere(s), publishedAt: { not: null } },
    }),
  ]);

  const subjAgg = new Map<string, { name: string; sum: number; max: number }>();
  const classAgg = new Map<string, { name: string; sum: number; max: number }>();
  const levelAgg = new Map<string, { name: string; sum: number; max: number }>();
  const letters = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  let sum = 0, max = 0;

  for (const g of gradeRows) {
    if (!g.assessment.maxScore) continue;
    const pct = (g.score! / g.assessment.maxScore) * 100;
    letters[letterFromPct(pct)]++;
    sum += g.score!; max += g.assessment.maxScore;

    const sa = subjAgg.get(g.assessment.subjectId) ?? { name: g.assessment.subject.name, sum: 0, max: 0 };
    sa.sum += g.score!; sa.max += g.assessment.maxScore;
    subjAgg.set(g.assessment.subjectId, sa);

    const c = g.assessment.class;
    const ca = classAgg.get(c.id) ?? { name: c.displayName ?? c.name, sum: 0, max: 0 };
    ca.sum += g.score!; ca.max += g.assessment.maxScore;
    classAgg.set(c.id, ca);

    if (c.gradeId && c.grade?.name) {
      const la = levelAgg.get(c.gradeId) ?? { name: c.grade.name, sum: 0, max: 0 };
      la.sum += g.score!; la.max += g.assessment.maxScore;
      levelAgg.set(c.gradeId, la);
    }
  }

  const avg = (a: { sum: number; max: number }) => (a.max ? Math.round((a.sum / a.max) * 100) : 0);
  return {
    count: gradeRows.length, published, drafts,
    overallAvg: max ? Math.round((sum / max) * 100) : null,
    subjectAvgs: [...subjAgg.entries()].map(([id, a]) => ({ id, label: a.name, value: avg(a) })).sort((a, b) => b.value - a.value),
    classAvgs: [...classAgg.entries()].map(([id, a]) => ({ id, label: a.name, value: avg(a) })).sort((a, b) => b.value - a.value),
    levelAvgs: [...levelAgg.entries()].map(([id, a]) => ({ id, label: a.name, value: avg(a) })).sort((a, b) => b.value - a.value),
    /** مجمّع خام بمعرّف المرحلة — لجدول المقارنة */
    levelRaw: levelAgg,
    letters,
    kindCounts: kindCounts.map((k) => ({ kind: k.kind, count: k._count._all })).sort((a, b) => b.count - a.count),
  };
}

// ─── السلوك ───

export async function behaviorStats(s: Scope) {
  const [byCat, byDay, rows] = await Promise.all([
    prisma.behaviorEntry.groupBy({
      by: ["category"], _count: { _all: true },
      where: { date: { gte: s.from, lte: s.to }, ...studentFilter(s) },
    }),
    prisma.behaviorEntry.groupBy({
      by: ["date"], _count: { _all: true },
      where: { date: { gte: s.from, lte: s.to }, ...studentFilter(s) },
    }),
    prisma.behaviorEntry.findMany({
      where: { date: { gte: s.from, lte: s.to }, ...studentFilter(s) },
      select: {
        student: {
          select: {
            enrollments: {
              where: s.yearId ? { academicYearId: s.yearId } : {},
              take: 1, select: { class: { select: classSelect } },
            },
          },
        },
      },
    }),
  ]);
  const byClass = new Map<string, { name: string; count: number }>();
  const byLevel = new Map<string, number>();
  for (const r of rows) {
    const c = r.student.enrollments[0]?.class;
    const cn = c?.displayName ?? c?.name ?? "بدون صف";
    const e = byClass.get(c?.id ?? "") ?? { name: cn, count: 0 };
    e.count++;
    byClass.set(c?.id ?? "", e);
    if (c?.gradeId) byLevel.set(c.gradeId, (byLevel.get(c.gradeId) ?? 0) + 1);
  }
  return {
    total: rows.length,
    cats: byCat.map((b) => ({ cat: b.category ?? "", count: b._count._all })).sort((a, b) => b.count - a.count),
    trend: [...byDay.map((b) => ({ k: toKey(b.date), v: b._count._all }))]
      .sort((a, b) => a.k.localeCompare(b.k))
      .map((b) => ({ label: fmtDay(new Date(`${b.k}T12:00:00`)), value: b.v })),
    byClass: [...byClass.entries()].map(([id, b]) => ({ id, label: b.name, value: b.count })).sort((a, b) => b.value - a.value),
    byLevel,
  };
}

// ─── التشغيل والتوصيل ───

export async function opsStats(from: Date, to: Date) {
  const toEnd = new Date(to.getTime() + DAY_MS);
  const [outStatus, outChannel, sentSnaps, viewEvents] = await Promise.all([
    prisma.outboxEvent.groupBy({ by: ["status"], _count: { _all: true }, where: { createdAt: { gte: from, lte: toEnd } } }),
    prisma.outboxEvent.groupBy({ by: ["channel"], _count: { _all: true }, where: { createdAt: { gte: from, lte: toEnd } } }),
    prisma.reportSnapshot.count({ where: { status: "sent", createdAt: { gte: from, lte: toEnd } } }),
    prisma.reportViewEvent.count({ where: { viewedAt: { gte: from, lte: toEnd } } }),
  ]);
  const done = outStatus.find((r) => r.status === "done")?._count._all ?? 0;
  const failed = outStatus.find((r) => r.status === "failed")?._count._all ?? 0;
  const df = done + failed;
  return {
    outStatus: outStatus.map((r) => ({ status: r.status, count: r._count._all })),
    failed, done,
    successRate: df ? Math.round((done / df) * 100) : null,
    channels: outChannel.map((r) => ({ channel: r.channel, count: r._count._all })),
    sentSnaps, viewEvents,
    readRate: sentSnaps ? Math.round((viewEvents / sentSnaps) * 100) : null,
  };
}

// ─── جدول مقارنة المراحل ───

/**
 * يبني جدول المراحل من مجمّعات محسوبة مسبقاً (تمرَّر من الصفحة لتفادي استعلامات مكررة)
 * + نسبة حضور لكل مرحلة (groupBy لكل مرحلة — قليلة العدد).
 */
export async function levelsTable(
  s: Scope,
  agg: {
    viol: Map<string, number>;
    behav: Map<string, number>;
    grades: Map<string, { sum: number; max: number }>;
  },
) {
  const levels = await prisma.gradeLevel.findMany({
    orderBy: { order: "asc" },
    select: {
      id: true, name: true,
      classes: {
        where: { ...(s.yearId ? { academicYearId: s.yearId } : {}), isActive: true },
        select: { id: true, _count: { select: { students: true } } },
      },
    },
  });
  const rates = await Promise.all(
    levels.map(async (l) => {
      const rows = await prisma.dailySummary.groupBy({
        by: ["status"], _count: { _all: true },
        where: {
          date: { gte: s.from, lte: s.to },
          student: { enrollments: { some: { ...(s.yearId ? { academicYearId: s.yearId } : {}), class: { gradeId: l.id } } } },
        },
      });
      return [l.id, pctRate(rows.map((r) => ({ status: r.status, n: r._count._all })))] as const;
    }),
  );
  const rateBy = new Map(rates);
  return levels.map((l) => {
    const students = l.classes.reduce((a, c) => a + c._count.students, 0);
    const g = agg.grades.get(l.id);
    return {
      id: l.id, name: l.name,
      classes: l.classes.length, students,
      rate: rateBy.get(l.id) ?? null,
      viol: agg.viol.get(l.id) ?? 0,
      behav: agg.behav.get(l.id) ?? 0,
      avg: g?.max ? Math.round((g.sum / g.max) * 100) : null,
    };
  });
}
