/**
 * جرد قاعدة SQLite القديمة — قراءة فقط.
 *
 * يفتح النسخة الاحتياطية (وليس القاعدة الحية)، ويخرج تقرير:
 * - أعداد كل جدول
 * - مشكلات الجودة: سجلات يتيمة، حالات غير معروفة، تكرارات
 * - قائمة مراجعة للسجلات المشكوك فيها (demo/اختبار)
 *
 * الاستخدام:
 *   tsx inspect.ts <path-to-snapshot.db> [report.json]
 */

import Database from "better-sqlite3";
import { writeFileSync } from "node:fs";

const dbPath = process.argv[2];
const outPath = process.argv[3];

if (!dbPath) {
  console.error("الاستخدام: tsx inspect.ts <snapshot.db> [report.json]");
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true, fileMustExist: true });

interface TableCount {
  table: string;
  count: number;
}
interface Issue {
  severity: "info" | "warning" | "blocking";
  message: string;
  detail?: unknown;
}

const counts: TableCount[] = [];
const issues: Issue[] = [];

const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
  .all() as { name: string }[];

for (const { name } of tables) {
  const { n } = db.prepare(`SELECT COUNT(*) n FROM "${name}"`).get() as {
    n: number;
  };
  counts.push({ table: name, count: n });
}

const has = (t: string) => tables.some((x) => x.name === t);
const q = (sql: string) => db.prepare(sql).all();

// طلاب بدون صف
if (has("students") && has("classes")) {
  const orphans = q(
    `SELECT s.id, s.name FROM students s
     WHERE s.class_name IS NOT NULL
       AND s.class_name NOT IN (SELECT name FROM classes)`,
  ) as unknown[];
  if (orphans.length)
    issues.push({
      severity: "warning",
      message: `طلاب بأسماء صفوف غير موجودة في جدول classes: ${orphans.length}`,
      detail: orphans.slice(0, 20),
    });
}

// حضور بحالات غير معروفة
if (has("period_attendance")) {
  const bad = q(
    `SELECT DISTINCT status FROM period_attendance
     WHERE status NOT IN ('حاضر','غائب','غائب بعذر','متأخر','استئذان','تأخير','ح','غ','ع','م')`,
  ) as { status: string }[];
  if (bad.length)
    issues.push({
      severity: "warning",
      message: "حالات حضور غير معروفة في period_attendance",
      detail: bad.map((b) => b.status),
    });
}

// روابط أولياء أمور بلا طالب
if (has("student_links") && has("students")) {
  const bad = q(
    `SELECT COUNT(*) n FROM student_links l
     LEFT JOIN students s ON s.id = l.student_id WHERE s.id IS NULL`,
  ) as { n: number }[];
  if (bad[0]?.n)
    issues.push({
      severity: "blocking",
      message: `روابط أولياء أمور يتيمة (طالب محذوف): ${bad[0].n}`,
    });
}

// حسابات demo المشكوك فيها — تُدرج للمراجعة ولا تُحذف تلقائياً
if (has("users")) {
  const demo = q(
    `SELECT id, username FROM users WHERE username LIKE 'demo%' OR username LIKE 'test%'`,
  ) as { id: number; username: string }[];
  if (demo.length)
    issues.push({
      severity: "info",
      message: `حسابات يُشتبه أنها تجريبية — مراجعة يدوية مطلوبة: ${demo.length}`,
      detail: demo.map((d) => d.username),
    });
}

const report = {
  source: dbPath,
  generatedAt: new Date().toISOString(),
  counts,
  issues,
};

const json = JSON.stringify(report, null, 2);
if (outPath) {
  writeFileSync(outPath, json, "utf8");
  console.log(`كُتب التقرير: ${outPath}`);
} else {
  console.log(json);
}

db.close();
process.exit(issues.some((i) => i.severity === "blocking") ? 2 : 0);
