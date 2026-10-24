/**
 * كشف الحضور الأسبوعي — يطابق بنية ملف المدرسة المرجعي (xlsm):
 * ورقة لكل مستوى صفي (خامس/سادس/سابع/ثامن)، وداخلها بلوك لكل شعبة:
 *   ترويسة المدرسة → التواريخ → أسماء الأيام → رؤوس الأعمدة → صفوف الطلاب
 *   → صف المعلمين → مجاميع لكل حصة → متوسط/نسبة/عذر/بدون لكل يوم
 * ثم ورقة «التقرير» تلخص المدرسة كاملة بصيغ تشير لخلايا الأوراق.
 * الخلايا الفارغة = حضور؛ العلامات: غياب/تأخير/استئذان + عمود «نوع الغياب» (بعذر/بدون) لكل يوم.
 * كل المجاميع صيغ Excel حية (مع نتائج مخزّنة) — تعديل أي خلية يحدّث الكشف تلقائياً.
 */
import ExcelJS from "exceljs";
import { prisma } from "@app/db";

const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const MONTH_NAMES = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

// هوية التطبيق: ترويسات تركوازية/كهرمانية خفيفة على بنية الملف الأصلي
const HEAD_FILL = "FDE68A";   // رؤوس أعمدة الحصص
const STAT_FILL = "FEF3C7";   // خلايا إحصاء البلوك
const MARK_FONT: Record<string, string> = { غياب: "B91C1C", تأخير: "6D28D9", استئذان: "B45309" };

const PERIOD_MARK: Record<string, string> = {
  present: "", absent: "غياب", late: "تأخير", excused: "استئذان",
};

const col = (n: number) => {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = ((n - 1) / 26) | 0; }
  return s;
};
const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
/** "الصف السادس - شعبة 3" → "سادس 3" */
const shortClass = (d: string) =>
  d.replace(/الصف\s*/u, "").replace(/\s*[-–]\s*شعبة\s*/u, " ").replace(/^ال/u, "").trim();
const shortGrade = (n: string) => n.replace(/الصف\s*/u, "").replace(/^ال/u, "").trim();

export interface RegisterOptions {
  weekStart: Date;          // أول يوم دوام بالأسبوع (الاثنين)
  classId?: string;
  academicYearId: string;
  schoolName: string;
}

interface DayInfo { weekday: number; periods: number; col0: number; typeCol: number; date: Date; dateStr: string; }
interface BlockMeta {
  sheet: string; totalCell: string;
  // لكل يوم: خلية مجموع غياب اليوم + خليتا بعذر/بدون المدموجتان + خليتا مجموع التأخير/الاستئذان اليومي
  days: { absentTot: string; exc: string; unx: string; lateTot: string; leaveTot: string }[];
  gradeKey: string;
}
interface GradeMeta { sheet: string; name: string; short: string; totalFormula: string; total: number; blocks: BlockMeta[]; }

export async function buildWeeklyRegister(opts: RegisterOptions): Promise<Buffer> {
  // ---------- الأيام وعدد الحصص من تعريفات اليوم (الجمعة أقصر) ----------
  const defs = await prisma.dayPeriodDef.findMany();
  const periodCount = new Map<number, number>();
  for (const d of defs)
    if (!d.isBreak) periodCount.set(d.dayOfWeek, (periodCount.get(d.dayOfWeek) ?? 0) + 1);

  // ---------- الطلاب والصفوف ----------
  const enrollments = await prisma.enrollment.findMany({
    where: {
      academicYearId: opts.academicYearId,
      ...(opts.classId ? { classId: opts.classId } : {}),
      class: { isActive: true },
      student: { isActive: true },
    },
    include: { student: true, class: { include: { grade: true } } },
    orderBy: [{ class: { name: "asc" } }, { student: { fullName: "asc" } }],
  });
  const classIds = [...new Set(enrollments.map((e) => e.classId))];

  // خطة بديلة لعدد الحصص من خانات الجدول السارية إن غابت التعريفات
  const slots = await prisma.timetableSlot.findMany({
    where: { classId: { in: classIds }, effectiveTo: null },
  });
  if (!periodCount.size)
    for (const s of slots)
      periodCount.set(s.weekday, Math.max(periodCount.get(s.weekday) ?? 0, s.period));

  // الأيام الفعلية = تعريفات لها خانات منشورة فعلاً (تستبعد تعريفات يتيمة كالأحد)
  const slotDays = new Set(slots.map((s) => s.weekday));
  let weekdays = [...periodCount.keys()].filter((d) => slotDays.has(d));
  if (!weekdays.length) weekdays = [...periodCount.keys()].sort((a, b) => a - b);
  if (!weekdays.length) weekdays.push(1, 2, 3, 4, 5);
  const wsDow = opts.weekStart.getUTCDay();
  weekdays.sort((a, b) => ((a - wsDow + 7) % 7) - ((b - wsDow + 7) % 7));

  const year = await prisma.academicYear.findUnique({ where: { id: opts.academicYearId } });

  // تاريخ كل يوم دوام داخل أسبوع weekStart
  const days: DayInfo[] = [];
  let c0 = 4; // العمود D
  for (const wd of weekdays) {
    const date = new Date(opts.weekStart);
    date.setUTCDate(date.getUTCDate() + ((wd - wsDow + 7) % 7));
    const n = periodCount.get(wd) ?? 8;
    days.push({ weekday: wd, periods: n, col0: c0, typeCol: c0 + n, date, dateStr: toDateStr(date) });
    c0 += n + 1; // + عمود «نوع الغياب»
  }
  const lastDataCol = c0 - 1;
  const sumBase = lastDataCol + 1; // مجموع الحضور .. بدون عذر (6 أعمدة)
  const dataRange = (r: number) => `D${r}:${col(lastDataCol)}${r}`;
  const periodRanges = (r: number) =>
    days.map((d) => `${col(d.col0)}${r}:${col(d.typeCol - 1)}${r}`);

  // ---------- بيانات الحضور ----------
  const students = enrollments.map((e) => ({
    id: e.studentId, name: e.student.fullName, classId: e.classId,
    className: e.class.displayName, gradeKey: e.class.gradeId ?? "_", gradeName: e.class.grade?.name ?? "أخرى",
    gradeOrder: e.class.grade?.order ?? 999,
  }));
  const studentIds = students.map((s) => s.id);
  const dateObjs = days.map((d) => d.date);

  const daily = await prisma.dailySummary.findMany({
    where: { studentId: { in: studentIds }, date: { in: dateObjs } },
  });
  const dailyMap = new Map(daily.map((d) => [`${d.studentId}|${toDateStr(d.date)}`, d.status]));
  const sessions = await prisma.lessonSession.findMany({
    where: { classId: { in: classIds }, date: { in: dateObjs } },
    include: { entries: { where: { studentId: { in: studentIds } } } },
  });
  const periodMap = new Map<string, string>();
  for (const s of sessions)
    for (const e of s.entries) periodMap.set(`${e.studentId}|${toDateStr(s.date)}|${s.period}`, e.status);

  const teacherNames = new Map(
    (await prisma.user.findMany({
      where: { id: { in: [...new Set(slots.map((s) => s.teacherId))] } },
      select: { id: true, name: true },
    })).map((u) => [u.id, u.name] as const),
  );
  const teacherAt = (classId: string, weekday: number, period: number) =>
    slots.filter((s) => s.classId === classId && s.weekday === weekday && s.period === period)
      .map((s) => teacherNames.get(s.teacherId) ?? "").filter(Boolean).join("، ");

  // ---------- بناء المصنف ----------
  const wb = new ExcelJS.Workbook();
  const thin = { style: "thin" as const, color: { argb: "FF9AA5A5" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  // تجميع الشُّعب بمستواها الصفي — ورقة لكل مستوى
  const gradeMap = new Map<string, { name: string; short: string; order: number; classes: Map<string, { name: string; students: typeof students }> }>();
  for (const s of students) {
    let g = gradeMap.get(s.gradeKey);
    if (!g) { g = { name: s.gradeName, short: shortGrade(s.gradeName), order: s.gradeOrder, classes: new Map() }; gradeMap.set(s.gradeKey, g); }
    let cl = g.classes.get(s.classId);
    if (!cl) { cl = { name: s.className, students: [] }; g.classes.set(s.classId, cl); }
    cl.students.push(s);
  }
  const grades = [...gradeMap.entries()].sort((a, b) => a[1].order - b[1].order);
  const usedSheetNames = new Set<string>();
  const gradesMeta: GradeMeta[] = [];

  for (const [gKey, g] of grades) {
    let sheetName = g.short || "عام";
    let k = 2;
    while (usedSheetNames.has(sheetName)) sheetName = `${g.short}${k++}`;
    usedSheetNames.add(sheetName);
    const ws = wb.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
    ws.getColumn(1).width = 5.8;
    ws.getColumn(2).width = 13.7;
    ws.getColumn(3).width = 35.3;
    for (let c = 4; c <= lastDataCol; c++) ws.getColumn(c).width = 5.8;
    for (let c = sumBase; c <= sumBase + 5; c++) ws.getColumn(c).width = 9;

    const cell = (r: number, c: number, val: unknown,
                  o: { bold?: boolean; fill?: string; size?: number; fontColor?: string; wrap?: boolean; numfmt?: string } = {}) => {
      const cl = ws.getCell(r, c);
      cl.value = val as ExcelJS.CellValue;
      cl.alignment = { horizontal: "center", vertical: "middle", ...(o.wrap ? { wrapText: true } : {}) };
      cl.border = border;
      cl.font = { name: "Calibri", bold: o.bold ?? false, size: o.size ?? 11,
                  ...(o.fontColor ? { color: { argb: `FF${o.fontColor}` } } : {}) };
      if (o.fill) cl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${o.fill}` } };
      if (o.numfmt) cl.numFmt = o.numfmt;
      return cl;
    };

    let row = 3;
    const gMeta: GradeMeta = { sheet: sheetName, name: g.name, short: g.short, totalFormula: "", total: 0, blocks: [] };

    for (const [classId, cls] of g.classes) {
      if (!cls.students.length) continue; // شعبة بلا طلاب — لا بلوك فارغ
      const s0 = row + 7, s1 = s0 + cls.students.length - 1;
      const meta: BlockMeta = { sheet: sheetName, totalCell: `${col(sumBase + 1)}${row}`, days: [], gradeKey: gKey };
      gMeta.total += cls.students.length;
      gMeta.totalFormula += `${gMeta.totalFormula ? "+" : ""}${sheetName}!${meta.totalCell}`;

      // --- رأس البلوك ---
      cell(row, 3, opts.schoolName, { bold: true, size: 12 });
      cell(row, 5, "الصف", { bold: true });
      cell(row, 6, shortClass(cls.name), { bold: true, fontColor: "FF0000" });
      cell(row, sumBase + 1, { formula: `COUNTA(C${s0}:C${s1})`, result: cls.students.length } as unknown as string, { bold: true });
      cell(row + 1, 3, `العام الدراسي ${year?.name ?? ""}`, { bold: true });
      const m = opts.weekStart.getUTCMonth();
      cell(row + 2, 3, m >= 8 || m === 0 ? "Term 1" : "Term 2");
      cell(row + 3, 3, MONTH_NAMES[m]!);

      // التواريخ وأسماء الأيام مدموجة على عرض كل يوم
      for (const d of days) {
        ws.mergeCells(row + 4, d.col0, row + 4, d.typeCol);
        const dc = cell(row + 4, d.col0, d.date, { numfmt: "d-mmm-yyyy" });
        dc.alignment = { horizontal: "center", vertical: "middle" };
        // تنبيه ExcelJS: الكتابة على خلية غير رئيسية بعد الدمج تمسح الرئيسية — نملأ الأنماط قبل الدمج
        for (let c = d.col0; c <= d.typeCol; c++) cell(row + 5, c, "", { fill: HEAD_FILL });
        ws.mergeCells(row + 5, d.col0, row + 5, d.typeCol);
        cell(row + 5, d.col0, DAY_NAMES[d.weekday]!, { bold: true, fill: HEAD_FILL });
      }

      // رؤوس الأعمدة
      const hr = row + 6;
      ws.getRow(hr).height = 33;
      cell(hr, 1, "#");
      cell(hr, 2, "رقم الطالب");
      cell(hr, 3, "الطلاب");
      for (const d of days) {
        for (let p = 1; p <= d.periods; p++)
          cell(hr, d.col0 + p - 1, p, { bold: true, fill: HEAD_FILL, size: 10 });
        cell(hr, d.typeCol, "نوع الغياب", { bold: true, fill: HEAD_FILL, size: 10, wrap: true });
      }
      ["مجموع الحضور", "مجموع الغياب", "مجموع الاستئذان", "مجموع التأخير", "غياب بعذر", "بدون عذر"]
        .forEach((l, i) => cell(hr, sumBase + i, l, { bold: true, size: 10, wrap: true }));

      // --- صفوف الطلاب ---
      cls.students.forEach((s, idx) => {
        const r = s0 + idx;
        cell(r, 1, idx + 1);
        cell(r, 2, "");
        const nc = cell(r, 3, s.name);
        nc.alignment = { horizontal: "right", vertical: "middle" };
        for (const d of days) {
          const dayStatus = dailyMap.get(`${s.id}|${d.dateStr}`);
          for (let p = 1; p <= d.periods; p++) {
            const st = periodMap.get(`${s.id}|${d.dateStr}|${p}`);
            const mark = st ? PERIOD_MARK[st] ?? "" : "";
            cell(r, d.col0 + p - 1, mark, {
              size: 10,
              ...(mark && MARK_FONT[mark] ? { fontColor: MARK_FONT[mark]!, bold: true } : {}),
            });
          }
          // نوع الغياب: بعذر/بدون من الحالة اليومية
          cell(r, d.typeCol, dayStatus === "excused" ? "بعذر" : dayStatus === "absent" ? "بدون" : "", { size: 10 });
        }
        // مجاميع الطالب — صيغ حية كالملف الأصلي
        const emptyCnt = periodRanges(r).map((rg) => `COUNTIF(${rg},"")`).join("+");
        const presentCnt = cls.students.length &&
          days.reduce((a, d) => a + d.periods, 0) -
          days.reduce((a, d) => a + [...Array(d.periods)].filter((_, p) =>
            periodMap.get(`${s.id}|${d.dateStr}|${p + 1}`) === "absent").length, 0);
        cell(r, sumBase, { formula: `${emptyCnt}+COUNTIF(${dataRange(r)},"استئذان")+COUNTIF(${dataRange(r)},"تأخير")`, result: presentCnt } as unknown as string);
        const cnt = (mark: string) => days.reduce((a, d) => a + [...Array(d.periods)].filter((_, p) =>
          periodMap.get(`${s.id}|${d.dateStr}|${p + 1}`) === mark).length, 0);
        cell(r, sumBase + 1, { formula: `COUNTIF(${dataRange(r)},"غياب")`, result: cnt("absent") } as unknown as string);
        cell(r, sumBase + 2, { formula: `COUNTIF(${dataRange(r)},"استئذان")`, result: cnt("excused") } as unknown as string);
        cell(r, sumBase + 3, { formula: `COUNTIF(${dataRange(r)},"تأخير")`, result: cnt("late") } as unknown as string);
        const nExc = days.filter((d) => dailyMap.get(`${s.id}|${d.dateStr}`) === "excused").length;
        const nAbs = days.filter((d) => dailyMap.get(`${s.id}|${d.dateStr}`) === "absent").length;
        cell(r, sumBase + 4, { formula: `COUNTIF(${dataRange(r)},"بعذر")`, result: nExc } as unknown as string);
        cell(r, sumBase + 5, { formula: `COUNTIF(${dataRange(r)},"بدون")`, result: nAbs } as unknown as string);
      });

      // --- صف المعلمين ---
      let r2 = s1 + 2;
      const tRow = r2;
      cell(tRow, 3, "اسم المعلم", { bold: true, size: 10 });
      for (const d of days)
        for (let p = 1; p <= d.periods; p++)
          cell(tRow, d.col0 + p - 1, teacherAt(classId, d.weekday, p), { size: 9, wrap: true });

      // --- مجاميع لكل حصة (صيغ حية) + إجمالي اليوم في عمود «نوع الغياب» ---
      const stats: { label: string; mark: string; rowNum: number }[] = [];
      for (const [label, mark] of [["مجموع الحضور", ""], ["مجموع الغياب", "absent"], ["مجموع الاستئذان", "excused"], ["مجموع التأخير", "late"]] as const) {
        r2++;
        stats.push({ label, mark, rowNum: r2 });
        cell(r2, 3, label, { bold: true });
      }
      const [presR, absR, excR, lateR] = stats.map((s) => s.rowNum);
      for (const d of days) {
        for (let p = 1; p <= d.periods; p++) {
          const cl = col(d.col0 + p - 1);
          const marks = cls.students.map((s) => periodMap.get(`${s.id}|${d.dateStr}|${p}`));
          const nAbs = marks.filter((x) => x === "absent").length;
          const nExc = marks.filter((x) => x === "excused").length;
          const nLate = marks.filter((x) => x === "late").length;
          cell(presR!, d.col0 + p - 1, { formula: `COUNTA($C${s0}:$C${s1})-${cl}${absR}`, result: cls.students.length - nAbs } as unknown as string);
          cell(absR!, d.col0 + p - 1, { formula: `COUNTIF(${cl}${s0}:${cl}${s1},"غياب")`, result: nAbs } as unknown as string);
          cell(excR!, d.col0 + p - 1, { formula: `COUNTIF(${cl}${s0}:${cl}${s1},"استئذان")`, result: nExc } as unknown as string);
          cell(lateR!, d.col0 + p - 1, { formula: `COUNTIF(${cl}${s0}:${cl}${s1},"تأخير")`, result: nLate } as unknown as string);
        }
        const f = col(d.col0), l = col(d.typeCol - 1);
        const dayMarks = cls.students.map((s) => dailyMap.get(`${s.id}|${d.dateStr}`));
        const dAbs = dayMarks.filter((x) => x === "absent" || x === "excused").length;
        cell(absR!, d.typeCol, { formula: `SUM(${f}${absR}:${l}${absR})`, result: cls.students.reduce((a, s) => a + [...Array(d.periods)].filter((_, p) => periodMap.get(`${s.id}|${d.dateStr}|${p + 1}`) === "absent").length, 0) } as unknown as string);
        cell(excR!, d.typeCol, { formula: `SUM(${f}${excR}:${l}${excR})`, result: cls.students.reduce((a, s) => a + [...Array(d.periods)].filter((_, p) => periodMap.get(`${s.id}|${d.dateStr}|${p + 1}`) === "excused").length, 0) } as unknown as string);
        cell(lateR!, d.typeCol, { formula: `SUM(${f}${lateR}:${l}${lateR})`, result: cls.students.reduce((a, s) => a + [...Array(d.periods)].filter((_, p) => periodMap.get(`${s.id}|${d.dateStr}|${p + 1}`) === "late").length, 0) } as unknown as string);
        meta.days.push({
          absentTot: `${sheetName}!${col(d.typeCol)}${absR}`,
          exc: "", unx: "",
          lateTot: `${sheetName}!${col(d.typeCol)}${lateR}`,
          leaveTot: `${sheetName}!${col(d.typeCol)}${excR}`,
        });
        void dAbs;
      }

      // --- ملخصات يومية مدموجة ---
      r2 += 2;
      for (const [label, kind] of [["متوسط الحضور", "avg"], ["نسبة الحضور", "pct"], ["الغياب بعذر", "exc"], ["الغياب بدون عذر", "unx"]] as const) {
        cell(r2, 3, label, { bold: true, fill: STAT_FILL });
        for (let di = 0; di < days.length; di++) {
          const d = days[di]!;
          for (let c = d.col0; c <= d.typeCol; c++) cell(r2, c, "", { fill: STAT_FILL });
          ws.mergeCells(r2, d.col0, r2, d.typeCol);
          const f = col(d.col0), l = col(d.typeCol - 1);
          const nStudents = cls.students.length;
          const absentStudents = cls.students.filter((s) => {
            const st = dailyMap.get(`${s.id}|${d.dateStr}`);
            return st === "absent" || st === "excused";
          }).length;
          if (kind === "avg") {
            const marked = [...Array(d.periods)].map((_, p) =>
              cls.students.filter((s) => periodMap.get(`${s.id}|${d.dateStr}|${p + 1}`)).length);
            const pres = [...Array(d.periods)].map((_, p) =>
              cls.students.filter((s) => periodMap.get(`${s.id}|${d.dateStr}|${p + 1}`)).filter((s) => periodMap.get(`${s.id}|${d.dateStr}|${p + 1}`) === "present").length);
            const activeIdx = marked.map((x, i) => x > 0 ? i : -1).filter((i) => i >= 0);
            const avg = activeIdx.length ? activeIdx.reduce((a, i) => a + (pres[i] ?? 0), 0) / activeIdx.length : 0;
            cell(r2, d.col0, { formula: `AVERAGE(${f}${presR}:${l}${presR})`, result: avg } as unknown as string, { fill: STAT_FILL, numfmt: "0" });
          } else if (kind === "pct") {
            cell(r2, d.col0, { formula: `${col(d.col0)}${r2 - 1}/${meta.totalCell}`, result: nStudents ? (nStudents - absentStudents) / nStudents : 0 } as unknown as string, { fill: STAT_FILL, numfmt: "0%" });
          } else {
            const want = kind === "exc" ? "excused" : "absent";
            const n = cls.students.filter((s) => dailyMap.get(`${s.id}|${d.dateStr}`) === want).length;
            cell(r2, d.col0, { formula: `COUNTIF(${col(d.typeCol)}${s0}:${col(d.typeCol)}${s1},"${kind === "exc" ? "بعذر" : "بدون"}")`, result: n } as unknown as string, { fill: STAT_FILL });
            const ref = `${sheetName}!${col(d.col0)}${r2}`;
            if (kind === "exc") meta.days[di]!.exc = ref; else meta.days[di]!.unx = ref;
          }
        }
        r2++;
      }

      gMeta.blocks.push(meta);
      row = r2 + 3; // فاصل ثم البلوك التالي
    }
    if (gMeta.blocks.length) gradesMeta.push(gMeta);
    else wb.removeWorksheet(ws.id);
  }

  // ---------- ورقة التقرير ----------
  if (gradesMeta.length) {
    const ws = wb.addWorksheet("التقرير", { views: [{ rightToLeft: true }] });
    ws.getColumn(2).width = 30; ws.getColumn(3).width = 14;
    for (let c = 4; c <= 8; c++) ws.getColumn(c).width = 10;
    ws.getColumn(18).width = 14;
    for (let c = 19; c <= 23; c++) ws.getColumn(c).width = 10;
    const thin2 = { style: "thin" as const, color: { argb: "FF9AA5A5" } };
    const bd = { top: thin2, left: thin2, bottom: thin2, right: thin2 };
    const tcell = (r: number, c: number, v: unknown, o: { bold?: boolean; fill?: string; numfmt?: string } = {}) => {
      const cl = ws.getCell(r, c);
      cl.value = v as ExcelJS.CellValue;
      cl.alignment = { horizontal: "center", vertical: "middle" };
      cl.border = bd;
      cl.font = { name: "Calibri", bold: o.bold ?? false, size: 11 };
      if (o.fill) cl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${o.fill}` } };
      if (o.numfmt) cl.numFmt = o.numfmt;
      return cl;
    };

    const schoolTotalCell = "S5";
    tcell(5, 18, "مجموع طلاب المدرسة", { bold: true });
    tcell(5, 19, { formula: gradesMeta.map((g) => `${col(8)}${7 + gradesMeta.indexOf(g) * 13}`).join("+"), result: gradesMeta.reduce((a, g) => a + g.total, 0) } as unknown as string, { bold: true });
    ws.mergeCells(8, 19, 8, 22);
    tcell(8, 19, "جميع المراحل", { bold: true, fill: HEAD_FILL });

    gradesMeta.forEach((g, gi) => {
      const r = 7 + gi * 13;
      if (gi === 0) {
        tcell(r, 2, opts.schoolName, { bold: true });
        tcell(r + 1, 2, `العام الدراسي ${year?.name ?? ""}`);
      }
      tcell(r, 7, `مجموع طلاب ${g.short}`, { bold: true });
      tcell(r, 8, { formula: g.totalFormula, result: g.total } as unknown as string, { bold: true });
      ws.mergeCells(r + 1, 4, r + 1, 7);
      tcell(r + 1, 4, g.name, { bold: true });
      days.forEach((d, di) => {
        tcell(r + 2, 4 + di, d.date, { numfmt: "d-mmm-yyyy" });
        tcell(r + 3, 4 + di, DAY_NAMES[d.weekday]!, { bold: true, fill: HEAD_FILL });
      });
      const labels = ["مجموع الحضور", "نسبة الحضور", "مجموع الغياب", "نسبة الغياب", "الغياب بعذر", "الغياب بدون عذر", "مجموع التأخير", "مجموع الاستئذان"];
      labels.forEach((l, i) => tcell(r + 4 + i, 3, l, { bold: true, ...(i < 4 ? {} : { fill: STAT_FILL }) }));
      days.forEach((d, di) => {
        const c = 4 + di, L = col(c);
        const tot = `${col(8)}${r}`;
        const excSum = g.blocks.map((b) => b.days[di]!.exc).join("+");
        const unxSum = g.blocks.map((b) => b.days[di]!.unx).join("+");
        const excN = g.blocks.reduce(() => 0, 0); // النتائج تُحسب بإكسل؛ نخزّن قيمة تقريبية أدناه
        void excN;
        const lateSum = g.blocks.map((b) => b.days[di]!.lateTot).join("+");
        const leaveSum = g.blocks.map((b) => b.days[di]!.leaveTot).join("+");
        tcell(r + 8, c, { formula: excSum } as unknown as string, { fill: STAT_FILL });
        tcell(r + 9, c, { formula: unxSum } as unknown as string, { fill: STAT_FILL });
        tcell(r + 10, c, { formula: lateSum } as unknown as string, { fill: STAT_FILL });
        tcell(r + 11, c, { formula: leaveSum } as unknown as string, { fill: STAT_FILL });
        tcell(r + 6, c, { formula: `${L}${r + 8}+${L}${r + 9}` } as unknown as string);
        tcell(r + 4, c, { formula: `${tot}-${L}${r + 6}` } as unknown as string);
        tcell(r + 5, c, { formula: `${L}${r + 4}/${tot}`, result: 0 } as unknown as string, { numfmt: "0%" });
        tcell(r + 7, c, { formula: `${L}${r + 6}/${tot}`, result: 0 } as unknown as string, { numfmt: "0%" });
      });
    });

    // عمود المدرسة كاملة (يمين الجدول) — نفس صفوف أول بلوك
    const r0 = 7;
    days.forEach((d, di) => {
      tcell(r0 + 2, 19 + di, d.date, { numfmt: "d-mmm-yyyy" });
      tcell(r0 + 3, 19 + di, DAY_NAMES[d.weekday]!, { bold: true, fill: HEAD_FILL });
      const c = 19 + di, L = col(c);
      const excSum = gradesMeta.flatMap((g) => g.blocks.map((b) => b.days[di]!.exc)).join("+");
      const unxSum = gradesMeta.flatMap((g) => g.blocks.map((b) => b.days[di]!.unx)).join("+");
      const lateSum = gradesMeta.flatMap((g) => g.blocks.map((b) => b.days[di]!.lateTot)).join("+");
      const leaveSum = gradesMeta.flatMap((g) => g.blocks.map((b) => b.days[di]!.leaveTot)).join("+");
      tcell(r0 + 8, c, { formula: excSum } as unknown as string);
      tcell(r0 + 9, c, { formula: unxSum } as unknown as string);
      tcell(r0 + 10, c, { formula: lateSum } as unknown as string);
      tcell(r0 + 11, c, { formula: leaveSum } as unknown as string);
      tcell(r0 + 6, c, { formula: `${L}${r0 + 8}+${L}${r0 + 9}` } as unknown as string);
      tcell(r0 + 4, c, { formula: `${schoolTotalCell}-${L}${r0 + 6}` } as unknown as string);
      tcell(r0 + 5, c, { formula: `${L}${r0 + 4}/${schoolTotalCell}`, result: 0 } as unknown as string, { numfmt: "0%" });
      tcell(r0 + 7, c, { formula: `${L}${r0 + 6}/${schoolTotalCell}`, result: 0 } as unknown as string, { numfmt: "0%" });
    });
    ["مجموع الحضور", "نسبة الحضور", "مجموع الغياب", "نسبة الغياب", "الغياب بعذر", "الغياب بدون عذر", "مجموع التأخير", "مجموع الاستئذان"]
      .forEach((l, i) => tcell(r0 + 4 + i, 18, l, { bold: true }));
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
