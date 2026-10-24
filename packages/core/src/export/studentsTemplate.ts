import ExcelJS from "exceljs";

/**
 * قالب استيراد الطلاب الجماعي — ورقة «الطلاب» بأعمدة معيّنة + ورقة «الشعب»
 * مرجعية تقود قائمة منسدلة على عمود الصف فتمنع أخطاء أسماء الشعب.
 */

const HEADERS = ["#", "اسم الطالب الكامل", "الصف", "اسم ولي الأمر", "هاتف ولي الأمر"] as const;
const BRAND = "FF0E7490"; // تركوازي العلامة
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, bottom: { style: "thin" },
  left: { style: "thin" }, right: { style: "thin" },
};

export async function buildStudentsTemplate(input: {
  schoolName: string;
  classes: string[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = input.schoolName;

  const ws = wb.addWorksheet("الطلاب", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { width: 5 },   // #
    { width: 30 },  // الاسم
    { width: 24 },  // الصف
    { width: 24 },  // ولي الأمر
    { width: 16 },  // الهاتف
  ];

  // ترويسة المدرسة + تعليمات التعبئة
  ws.mergeCells("A1:E1");
  ws.getCell("A1").value = `${input.schoolName} — قالب استيراد الطلاب`;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: BRAND } };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.getRow(1).height = 26;

  ws.mergeCells("A2:E2");
  ws.getCell("A2").value =
    `عبّئ من السطر الأول تحت الرؤوس — الصف يُختار من القائمة المنسدلة، وولي الأمر وهاتفه اختياريان. ` +
    `مثال: محمد أحمد علي | ${input.classes[0] ?? "الصف السادس - شعبة 3"} | أحمد علي | 0500000000`;
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
    for (let c = 1; c <= 5; c++) ws.getCell(r, c).border = THIN;
  }

  // قائمة منسدلة على عمود الصف (C5:C55) من ورقة الشعب
  if (input.classes.length) {
    const ref = wb.addWorksheet("الشعب");
    ref.state = "veryHidden";
    input.classes.forEach((n, i) => { ref.getCell(i + 1, 1).value = n; });
    for (let r = 5; r <= 55; r++)
      ws.getCell(r, 3).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'الشعب'!$A$1:$A$${input.classes.length}`],
        showErrorMessage: true,
        errorTitle: "صف غير معروف",
        error: "اختر الصف من القائمة — يجب أن يطابق اسماً في ورقة «الشعب»",
      };
  }

  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 4 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface StudentImportRow {
  row: number;
  name: string;
  className: string;
  parentName: string;
  parentPhone: string;
}

/** يحلّل قالب xlsx — يتسامح مع اختلاف ترتيب الأعمدة ويتجاهل الترويسة وسطر المثال */
export async function parseStudentsXlsx(buf: Buffer): Promise<{
  rows: StudentImportRow[];
  errors: string[];
}> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("الطلاب") ?? wb.worksheets[0];
  if (!ws) return { rows: [], errors: ["لا توجد ورقة بيانات في الملف"] };

  // ابحث عن صف الرؤوس: يجب عمود الاسم + عمود آخر على الأقل في السطر نفسه
  // (الخلايا التابعة لدمج تُعيد نص الرئيسة — تُتجاهل حتى لا تُلتقط التعليمات كرؤوس)
  let headerRow = 0;
  const colOf: Record<string, number> = {};
  ws.eachRow((row, n) => {
    if (headerRow) return;
    const found: Record<string, number> = {};
    row.eachCell((cell, col) => {
      if (cell.isMerged && cell.master !== cell) return;
      const t = String(cell.text ?? "").trim();
      if (/اسم الطالب|^الاسم|^name$/i.test(t)) found.name = col;
      else if (/^الصف|class/i.test(t)) found.className = col;
      else if (/ولي/.test(t) && /هاتف|جوال|موبايل/.test(t)) found.parentPhone = col;
      else if (/ولي/.test(t)) found.parentName = col;
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

  const rows: StudentImportRow[] = [];
  const errors: string[] = [];
  ws.eachRow((row, n) => {
    if (n <= headerRow) return;
    const name = text(row, colOf.name);
    const className = text(row, colOf.className);
    if (!name && !className) return; // سطر فارغ تماماً
    if (!name) { errors.push(`سطر ${n}: اسم فارغ`); return; }
    rows.push({
      row: n,
      name,
      className,
      parentName: text(row, colOf.parentName),
      parentPhone: text(row, colOf.parentPhone).replace(/\D/g, ""),
    });
  });
  return { rows, errors };
}
