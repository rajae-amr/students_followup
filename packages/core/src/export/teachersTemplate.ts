import ExcelJS from "exceljs";

/**
 * قالب استيراد المعلمين الجماعي — ورقة «المعلمون» بأعمدة معيّنة + ورقة «المواد»
 * مرجعية تقود قائمة منسدلة على عمود المادة فتمنع أخطاء أسماء المواد.
 */

const HEADERS = ["#", "اسم المعلم", "الهاتف", "المادة الافتراضية"] as const;
const BRAND = "FF0E7490"; // تركوازي العلامة
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, bottom: { style: "thin" },
  left: { style: "thin" }, right: { style: "thin" },
};

export async function buildTeachersTemplate(input: {
  schoolName: string;
  subjects: string[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = input.schoolName;

  const ws = wb.addWorksheet("المعلمون", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { width: 5 },   // #
    { width: 32 },  // الاسم
    { width: 18 },  // الهاتف
    { width: 26 },  // المادة
  ];

  // ترويسة المدرسة + تعليمات التعبئة
  ws.mergeCells("A1:D1");
  ws.getCell("A1").value = `${input.schoolName} — قالب استيراد المعلمين`;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: BRAND } };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.getRow(1).height = 26;

  ws.mergeCells("A2:D2");
  ws.getCell("A2").value =
    `عبّئ من السطر الأول تحت الرؤوس — الاسم إلزامي، والمادة تُختار من القائمة المنسدلة، والهاتف اختياري (مفتاح ربط تيليجرام). ` +
    `مثال: أحمد محمد السالم | 0501234567 | ${input.subjects[0] ?? "الرياضيات"}`;
  ws.getCell("A2").font = { size: 10, color: { argb: "FF64748B" } };
  ws.getCell("A2").alignment = { horizontal: "center", wrapText: true };
  ws.getRow(2).height = 30;

  // صف الرؤوس (السطر 4)
  const hdr = ws.getRow(4);
  HEADERS.forEach((h, i) => {
    const c = hdr.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    c.fill = HEADER_FILL;
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = THIN;
  });
  hdr.height = 22;

  // ترقيم السطور + حدود خفيفة جاهزة للتعبئة
  for (let r = 5; r <= 55; r++) {
    ws.getCell(r, 1).value = r - 4;
    ws.getCell(r, 1).alignment = { horizontal: "center" };
    ws.getCell(r, 1).font = { color: { argb: "FF94A3B8" }, size: 10 };
    for (let c = 1; c <= 4; c++) ws.getCell(r, c).border = THIN;
  }

  // قائمة منسدلة على عمود المادة (D5:D55) من ورقة المواد
  if (input.subjects.length) {
    const ref = wb.addWorksheet("المواد");
    ref.state = "veryHidden";
    input.subjects.forEach((n, i) => { ref.getCell(i + 1, 1).value = n; });
    for (let r = 5; r <= 55; r++)
      ws.getCell(r, 4).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'المواد'!$A$1:$A$${input.subjects.length}`],
        showErrorMessage: true,
        errorTitle: "مادة غير معروفة",
        error: "اختر المادة من القائمة — يجب أن تطابق اسماً في ورقة «المواد»",
      };
  }

  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 4 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface TeacherImportRow {
  row: number;
  name: string;
  phone: string;
  subject: string;
}

/** يحلّل قالب xlsx — يتسامح مع اختلاف ترتيب الأعمدة ويتجاهل الترويسة */
export async function parseTeachersXlsx(buf: Buffer): Promise<{
  rows: TeacherImportRow[];
  errors: string[];
}> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("المعلمون") ?? wb.worksheets[0];
  if (!ws) return { rows: [], errors: ["لا توجد ورقة بيانات في الملف"] };

  // ابحث عن صف الرؤوس: عمود الاسم + عمود آخر على الأقل في السطر نفسه
  // (الخلايا التابعة لدمج تُعيد نص الرئيسة — تُتجاهل حتى لا تُلتقط التعليمات كرؤوس)
  let headerRow = 0;
  const colOf: Record<string, number> = {};
  ws.eachRow((row, n) => {
    if (headerRow) return;
    const found: Record<string, number> = {};
    row.eachCell((cell, col) => {
      if (cell.isMerged && cell.master !== cell) return;
      const t = String(cell.text ?? "").trim();
      if (/اسم المعلم|^الاسم|^name$/i.test(t)) found.name = col;
      else if (/هاتف|جوال|موبايل|phone/i.test(t)) found.phone = col;
      else if (/المادة|subject/i.test(t)) found.subject = col;
    });
    if (found.name && Object.keys(found).length >= 2) {
      headerRow = n;
      Object.assign(colOf, found);
    }
  });
  if (!headerRow || !colOf.name)
    return { rows: [], errors: ["لم يُعثر على صف الرؤوس — استخدم القالب الأصلي"] };

  const text = (row: ExcelJS.Row, col?: number) =>
    col ? String(row.getCell(col).text ?? "").trim() : "";

  const rows: TeacherImportRow[] = [];
  const errors: string[] = [];
  ws.eachRow((row, n) => {
    if (n <= headerRow) return;
    const name = text(row, colOf.name);
    const phone = text(row, colOf.phone);
    const subject = text(row, colOf.subject);
    if (!name && !phone && !subject) return; // سطر فارغ تماماً
    if (!name) { errors.push(`سطر ${n}: اسم فارغ`); return; }
    rows.push({ row: n, name, phone: phone.replace(/\D/g, ""), subject });
  });
  return { rows, errors };
}
