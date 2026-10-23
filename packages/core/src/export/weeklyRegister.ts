/**
 * كشف الحضور الأسبوعي — نفس بنية كشف المدرسة القديم:
 * حالة اليوم + 8 حصص لكل يوم، اسم المعلم لكل حصة، وإحصائيات أسفل كل صف.
 *
 * البيانات من المخطط الجديد: DailySummary للحالة اليومية،
 * LessonSession+AttendanceEntry لخلايا الحصص، TimetableSlot لأسماء المعلمين.
 */
import ExcelJS from "exceljs";
import { prisma } from "@app/db";

const PERIODS = 8;
// هوية التطبيق: تركوازي (brand) + كهرماني (accent) — تناوب بينهما لتمييز الأيام
const DAY_TINT = ["F0FDFA", "FFFBEB", "F0FDFA", "FFFBEB", "F0FDFA", "FFFBEB", "F0FDFA"];
const DAY_HEAD = ["5EEAD4", "FCD34D", "5EEAD4", "FCD34D", "5EEAD4", "FCD34D", "5EEAD4"];
const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const BRAND_DEEP = "0F766E";   // ترويسة العنوان وفاصل الصفوف
const BRAND_SOFT = "CCFBF1";   // رؤوس الأعمدة الثابتة وملصقات الإحصاء
const ACCENT_SOFT = "FEF3C7";  // كتلة الملخص النهائي
const ACCENT_HEAD = "FDE68A";  // رؤوس أعمدة الإحصاء

const PERIOD_MARK: Record<string, string> = {
  present: "حاضر", absent: "غياب", late: "تأخير", excused: "استئذان",
};
const PERIOD_FONT: Record<string, string> = {
  absent: "B91C1C", late: "6D28D9", excused: "B45309",
};
const DAY_LABEL: Record<string, string> = {
  present: "حاضر", absent: "غائب", excused: "غائب بعذر",
  partial: "غياب جزئي", late: "متأخر",
};
// تلوين دلالي لخلايا حالة اليوم — يبرز الغياب فوراً
const DAY_STATUS_STYLE: Record<string, { fill: string; font: string }> = {
  present: { fill: "D1FAE5", font: "047857" },
  absent: { fill: "FEE2E2", font: "B91C1C" },
  excused: { fill: "FEF3C7", font: "B45309" },
  partial: { fill: "FFEDD5", font: "C2410C" },
  late: { fill: "EDE9FE", font: "6D28D9" },
};

const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

export interface RegisterOptions {
  weekStart: Date;          // تاريخ أول يوم بالأسبوع
  days?: number;            // افتراضي 5
  classId?: string;         // صف واحد أو الكل
  academicYearId: string;
  schoolName: string;
}

export async function buildWeeklyRegister(opts: RegisterOptions): Promise<Buffer> {
  const days = opts.days ?? 5;
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(opts.weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
  const dateStrs = dates.map(toDateStr);
  const end = dates[dates.length - 1]!;

  // الطلاب المسجلون (كل صف أو الصف المطلوب) — مصطفّون بالصف ثم الاسم
  const enrollments = await prisma.enrollment.findMany({
    where: {
      academicYearId: opts.academicYearId,
      ...(opts.classId ? { classId: opts.classId } : {}),
    },
    include: { student: true, class: true },
    orderBy: [{ class: { name: "asc" } }, { student: { fullName: "asc" } }],
  });
  const students = enrollments.map((e) => ({
    id: e.studentId,
    name: e.student.fullName,
    classId: e.classId,
    className: e.class.displayName ?? e.class.name,
  }));
  const studentIds = students.map((s) => s.id);

  // الحالات اليومية المشتقة
  const daily = await prisma.dailySummary.findMany({
    where: { studentId: { in: studentIds }, date: { in: dates } },
  });
  const dailyMap = new Map(daily.map((d) => [`${d.studentId}|${toDateStr(d.date)}`, d.status]));

  // خلايا الحصص: الجلسات بهذه الصفوف والتواريخ + سجلاتها
  const classIds = [...new Set(students.map((s) => s.classId))];
  const sessions = await prisma.lessonSession.findMany({
    where: { classId: { in: classIds }, date: { in: dates } },
    include: { entries: { where: { studentId: { in: studentIds } } } },
  });
  const periodMap = new Map<string, string>(); // student|date|period → status
  for (const s of sessions)
    for (const e of s.entries)
      periodMap.set(`${e.studentId}|${toDateStr(s.date)}|${s.period}`, e.status);

  // أسماء المعلمين لكل حصة مجدولة
  const slots = await prisma.timetableSlot.findMany({
    where: { classId: { in: classIds } },
  });
  const teacherNames = new Map(
    (await prisma.user.findMany({
      where: { id: { in: [...new Set(slots.map((s) => s.teacherId))] } },
      select: { id: true, name: true },
    })).map((u) => [u.id, u.name] as const),
  );
  const teacherAt = (classId: string, weekday: number, period: number) =>
    slots.filter((s) => s.classId === classId && s.weekday === weekday && s.period === period)
      .map((s) => teacherNames.get(s.teacherId) ?? "").filter(Boolean).join("، ");

  // ---------- بناء الملف ----------
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("كشف الحضور", { views: [{ rightToLeft: true }] });

  const nFixed = 2;                 // #، الاسم
  const perDay = 1 + PERIODS;       // حالة اليوم + الحصص
  const nSummary = 5;               // حاضر/غياب/تأخير/عذر حصص + أيام غياب
  const lastCol = nFixed + days * perDay + nSummary;

  const thin = { style: "thin" as const, color: { argb: "FFB0BDBD" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const center = { horizontal: "center" as const, vertical: "middle" as const, wrapText: true };

  const cell = (r: number, c: number, val: string | number,
                o: { bold?: boolean; fill?: string; size?: number; fontColor?: string } = {}) => {
    const cl = ws.getCell(r, c);
    cl.value = val;
    cl.alignment = center;
    cl.border = border;
    cl.font = { name: "Calibri", bold: o.bold ?? false, size: o.size ?? 11,
                ...(o.fontColor ? { color: { argb: `FF${o.fontColor}` } } : {}) };
    if (o.fill) cl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${o.fill}` } };
    return cl;
  };

  // الترويسة — شريط تركوازي داكن بهوية التطبيق
  ws.mergeCells(1, 1, 1, lastCol);
  cell(1, 1, `${opts.schoolName} — كشف الحضور والغياب`,
    { bold: true, size: 15, fill: BRAND_DEEP, fontColor: "FFFFFF" });
  ws.mergeCells(2, 1, 2, lastCol);
  const clsLabel = opts.classId ? students[0]?.className ?? "" : "كل الصفوف";
  cell(2, 1, `الأسبوع: ${dateStrs[0]} إلى ${toDateStr(end)} — ${clsLabel}`,
    { bold: true, size: 11, fill: BRAND_SOFT, fontColor: "134E4A" });

  const dateRow = 4, dowRow = 5, headRow = 6;
  for (let i = 0; i < days; i++) {
    const c0 = nFixed + i * perDay + 1;
    ws.mergeCells(dateRow, c0, dateRow, c0 + perDay - 1);
    cell(dateRow, c0, dateStrs[i]!, { bold: true, fill: DAY_HEAD[i % 7]! });
    ws.mergeCells(dowRow, c0, dowRow, c0 + perDay - 1);
    cell(dowRow, c0, DAY_NAMES[dates[i]!.getUTCDay()]!, { bold: true, fill: DAY_HEAD[i % 7]! });
    cell(headRow, c0, "الحالة", { bold: true, fill: DAY_HEAD[i % 7]!, size: 10 });
    for (let p = 1; p <= PERIODS; p++)
      cell(headRow, c0 + p, p, { bold: true, fill: DAY_TINT[i % 7]!, size: 10 });
  }
  cell(headRow, 1, "#", { bold: true, fill: BRAND_SOFT });
  cell(headRow, 2, "اسم الطالب", { bold: true, fill: BRAND_SOFT });
  ["حاضر (حصص)", "غائب (حصص)", "متأخر (حصص)", "بعذر (حصص)", "أيام غياب"].forEach((l, i) =>
    cell(headRow, nFixed + days * perDay + 1 + i, l, { bold: true, fill: ACCENT_HEAD, size: 10 }));

  // ---------- صفوف الطلاب مجمّعة بالصف ----------
  const classesInFile = [...new Map(students.map((s) => [s.classId, s.className])).entries()];
  const multi = classesInFile.length > 1;
  let row = headRow;

  for (const [classId, className] of classesInFile) {
    const clsStudents = students.filter((s) => s.classId === classId);
    if (multi) {
      row++;
      ws.mergeCells(row, 1, row, lastCol);
      cell(row, 1, `◆ ${className}`, { bold: true, fill: BRAND_DEEP, size: 12, fontColor: "FFFFFF" });
    }
    clsStudents.forEach((s, idx) => {
      row++;
      cell(row, 1, idx + 1);
      cell(row, 2, s.name).alignment = { horizontal: "right", vertical: "middle" };

      const totals = { present: 0, absent: 0, late: 0, excused: 0 };
      let absentDays = 0;
      for (let i = 0; i < days; i++) {
        const c0 = nFixed + i * perDay + 1;
        const ds = dateStrs[i]!;
        const dayStatus = dailyMap.get(`${s.id}|${ds}`);
        const label = dayStatus ? DAY_LABEL[dayStatus] ?? "" : "";
        const stStyle = dayStatus ? DAY_STATUS_STYLE[dayStatus] : undefined;
        cell(row, c0, label, {
          fill: stStyle?.fill ?? DAY_TINT[i % 7]!,
          bold: !!dayStatus,
          ...(stStyle ? { fontColor: stStyle.font } : {}),
        });
        if (dayStatus === "absent" || dayStatus === "excused") absentDays++;
        for (let p = 1; p <= PERIODS; p++) {
          const st = periodMap.get(`${s.id}|${ds}|${p}`);
          if (st && st in totals) totals[st as keyof typeof totals]++;
          cell(row, c0 + p, st ? PERIOD_MARK[st] ?? "" : "", {
            fill: DAY_TINT[i % 7]!,
            size: 9,
            ...(st && PERIOD_FONT[st] ? { fontColor: PERIOD_FONT[st]!, bold: true } : {}),
          });
        }
      }
      const base = nFixed + days * perDay + 1;
      cell(row, base, totals.present || "");
      cell(row, base + 1, totals.absent || "");
      cell(row, base + 2, totals.late || "");
      cell(row, base + 3, totals.excused || "");
      cell(row, base + 4, absentDays || "");
    });

    // ---------- كتلة إحصائيات الصف ----------
    row++;
    cell(row, 1, "", { fill: BRAND_SOFT });
    cell(row, 2, "اسم المعلم", { bold: true, fill: BRAND_SOFT, size: 10 });
    for (let i = 0; i < days; i++) {
      const c0 = nFixed + i * perDay + 1;
      cell(row, c0, "", { fill: DAY_HEAD[i % 7]! });
      for (let p = 1; p <= PERIODS; p++)
        cell(row, c0 + p, teacherAt(classId, dates[i]!.getUTCDay(), p),
             { fill: DAY_TINT[i % 7]!, size: 8 });
    }

    const dayStatusOf = (sid: string, ds: string) => dailyMap.get(`${sid}|${ds}`);
    const dayKeyFor = (st: string) => st === "excused" ? "excused" : st; // غائب بعذر يقابل excused
    for (const [label, stKey] of [
      ["مجموع الحضور", "present"], ["مجموع الغياب", "absent"],
      ["مجموع الاستئذان", "excused"], ["مجموع التأخير", "late"],
    ] as const) {
      row++;
      cell(row, 1, "", { fill: BRAND_SOFT });
      cell(row, 2, label, { bold: true, fill: BRAND_SOFT, size: 10 });
      for (let i = 0; i < days; i++) {
        const c0 = nFixed + i * perDay + 1;
        const ds = dateStrs[i]!;
        cell(row, c0,
          clsStudents.filter((s) => dayStatusOf(s.id, ds) === stKey).length || "",
          { fill: DAY_TINT[i % 7]!, size: 10 });
        for (let p = 1; p <= PERIODS; p++)
          cell(row, c0 + p,
            clsStudents.filter((s) => periodMap.get(`${s.id}|${ds}|${p}`) === stKey).length || "",
            { fill: DAY_TINT[i % 7]!, size: 10 });
      }
      for (let c = nFixed + days * perDay + 1; c <= lastCol; c++)
        cell(row, c, "", { fill: BRAND_SOFT });
    }

    // ملخص يومي
    row += 2;
    for (const label of ["متوسط الحضور", "نسبة الحضور", "الغياب بعذر", "الغياب بدون عذر"]) {
      cell(row, 1, "", { fill: ACCENT_SOFT });
      cell(row, 2, label, { bold: true, fill: ACCENT_SOFT, size: 10 });
      for (let i = 0; i < days; i++) {
        const c0 = nFixed + i * perDay + 1;
        const ds = dateStrs[i]!;
        ws.mergeCells(row, c0, row, c0 + perDay - 1);
        let v: string | number = "";
        if (label === "متوسط الحضور") {
          const marked = Array.from({ length: PERIODS }, (_, k) => k + 1)
            .filter((p) => clsStudents.some((s) => periodMap.get(`${s.id}|${ds}|${p}`)))
            .map((p) => clsStudents.filter((s) => periodMap.get(`${s.id}|${ds}|${p}`) === "present").length);
          if (marked.length) v = (marked.reduce((a, b) => a + b, 0) / marked.length).toFixed(1);
        } else if (label === "نسبة الحضور") {
          let rec = 0, pres = 0;
          for (const s of clsStudents) for (let p = 1; p <= PERIODS; p++) {
            const st = periodMap.get(`${s.id}|${ds}|${p}`);
            if (st) { rec++; if (st === "present") pres++; }
          }
          if (rec) v = `${Math.round((100 * pres) / rec)}%`;
        } else {
          const want = label === "الغياب بعذر" ? "excused" : "absent";
          v = clsStudents.filter((s) => dayStatusOf(s.id, ds) === want).length || "";
        }
        cell(row, c0, v, { bold: true, fill: DAY_HEAD[i % 7]!, size: 10 });
      }
      row++;
    }
    row--;
  }

  // الأبعاد
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 30;
  for (let c = nFixed + 1; c <= nFixed + days * perDay; c++)
    ws.getColumn(c).width = (c - nFixed - 1) % perDay === 0 ? 11 : 8;
  for (let c = nFixed + days * perDay + 1; c <= lastCol; c++)
    ws.getColumn(c).width = 11;
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: headRow, xSplit: 2 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}
