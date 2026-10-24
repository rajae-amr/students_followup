// أنواع المحرك — طبقة تجريد تفصل منطق الجدولة عن مكتبة الحل (قابلة للنقل إلى Python OR-Tools)

export type SlotKey = `${number}-${number}`; // "dayOfWeek-periodIndex"

export type AssignmentInput = {
  id: string;
  teacherId: string;
  sectionId: string;
  subjectId: string;
  weeklyPeriods: number;
};

// ===== نظام القيود القابل للتخصيص =====
// كل قيد له وضع: "off" معطّل | "soft" تفضيل بغرامة (weight) | "hard" شرط صارم
export type ConstraintMode = "off" | "soft" | "hard";
// value: قيمة عددية عامة اختيارية للقيد (مثل حد عام للحصص المتتالية لكل المعلمين — 0 = بلا حد عام)
export type ConstraintRule = { mode: ConstraintMode; weight: number; value?: number };

export type ConstraintKind =
  | "teacherMaxDaily"    // الحد الأقصى لحصص المعلم في اليوم
  | "maxPerDay"          // أقصى حصص يومية للمادة لكل شعبة (من صفحة المواد)
  | "sameDayRepeat"      // تكرار المادة لنفس الشعبة في اليوم الواحد
  | "consecutive"        // حصص متتالية لنفس التكليف
  | "minDaysPerWeek"     // حد أدنى لأيام ظهور المادة لكل شعبة (minDaysPerWeek على المادة)
  | "teacherEveryDay"    // المعلم يدرّس كل أيام الدوام — بلا يوم فارغ
  | "teacherMaxConsec"   // أقصى حصص متتالية للمعلم في اليوم
  | "preferEarlySubject" // تفضيل المادة: الحصص المبكرة
  | "subjectBlock"       // خانات محظورة على المادة — تنطبق على كل معلميها
  | "dailyBalance"       // توازن الحمل اليومي للمعلم على أيام الدوام
  | "fairLastPeriod";    // عدالة الحصة الأخيرة بين المعلمين

export type ConstraintConfig = Record<ConstraintKind, ConstraintRule>;

export const CONSTRAINT_LABELS: Record<ConstraintKind, { label: string; hint: string; hasValue?: boolean }> = {
  teacherMaxDaily:    { label: "الحد اليومي للمعلم", hint: "أقصى حصص يومية يدرّسها المعلم — قيمة عامة تُطبَّق على كل المعلمين", hasValue: true },
  maxPerDay:          { label: "أقصى حصص يومية للمادة", hint: "حد أقصى يومي للمادة لكل شعبة — من صفحة المواد" },
  sameDayRepeat:      { label: "تكرار المادة في اليوم", hint: "تفضيل عدم تكرار نفس المادة للشعبة في اليوم الواحد" },
  consecutive:        { label: "الحصص المتتالية", hint: "تفضيل عدم تتابع حصص نفس التكليف" },
  minDaysPerWeek:     { label: "حد أدنى أيام للمادة", hint: "المادة تظهر في X أيام على الأقل لكل شعبة — من صفحة المواد" },
  teacherEveryDay:    { label: "دوام المعلم كل الأيام", hint: "تفضيل/إلزام ألا يكون للمعلم يوم بلا حصص" },
  teacherMaxConsec:   { label: "أقصى متتالية للمعلم", hint: "أقصى حصص متتالية في اليوم دون فاصل — «القيمة العامة» لكل المعلمين", hasValue: true },
  preferEarlySubject: { label: "مواد مبكرة", hint: "للمواد المفعّل لها «تفضيل الحصص المبكرة»" },
  subjectBlock:       { label: "خانات محظورة للمادة", hint: "خانات يوم/حصة محظورة على مادة — من صفحة المواد" },
  dailyBalance:       { label: "توازن الحمل اليومي", hint: "تفضيل توزيع حصص المعلم بالتساوي على أيام الدوام — بلا يوم مزدحم وآخر شبه فارغ" },
  fairLastPeriod:     { label: "عدالة الحصة الأخيرة", hint: "توزيع حصص نهاية اليوم بالتساوي بين المعلمين — لا أحد يظل دائمًا لآخر اليوم" },
};

export const DEFAULT_CONSTRAINTS: ConstraintConfig = {
  teacherMaxDaily:    { mode: "soft", weight: 8, value: 0 },
  maxPerDay:          { mode: "hard", weight: 12 },
  sameDayRepeat:      { mode: "soft", weight: 4 },
  consecutive:        { mode: "soft", weight: 3 },
  minDaysPerWeek:     { mode: "hard", weight: 15 },
  teacherEveryDay:    { mode: "soft", weight: 3 },
  teacherMaxConsec:   { mode: "soft", weight: 4, value: 0 },
  preferEarlySubject: { mode: "off",  weight: 2 },
  subjectBlock:       { mode: "hard", weight: 10 },
  dailyBalance:       { mode: "soft", weight: 3 },
  fairLastPeriod:     { mode: "soft", weight: 2 },
};

// القيود الأساسية تُعرض دائمًا في الإعدادات؛ الباقي تحت «قيود متقدمة»
export const ESSENTIAL_KINDS: ConstraintKind[] = [
  "teacherMaxDaily",
  "maxPerDay",
  "teacherMaxConsec",
  "subjectBlock",
  "sameDayRepeat",
];

// قوالب جاهزة تضبط كل القيود بنقرة — للمدير غير التقني
export const CONSTRAINT_PRESETS: Record<
  string,
  { label: string; description: string; config: ConstraintConfig }
> = {
  balanced: {
    label: "متوازن",
    description: "الإعدادات الموصى بها — توازن بين صرامة القيود وسهولة إيجاد جدول",
    config: DEFAULT_CONSTRAINTS,
  },
  flexible: {
    label: "مرن",
    description: "يخفف القيود الصارمة إلى تفضيلات — استخدمه إذا فشل التوليد كثيرًا",
    config: {
      ...DEFAULT_CONSTRAINTS,
      teacherMaxDaily: { ...DEFAULT_CONSTRAINTS.teacherMaxDaily, mode: "soft" },
      maxPerDay: { ...DEFAULT_CONSTRAINTS.maxPerDay, mode: "soft" },
      minDaysPerWeek: { ...DEFAULT_CONSTRAINTS.minDaysPerWeek, mode: "soft" },
      teacherMaxConsec: { ...DEFAULT_CONSTRAINTS.teacherMaxConsec, mode: "soft" },
    },
  },
  strict: {
    label: "صارم",
    description: "أقصى التزام بالقواعد — قد يصعّب إيجاد جدول مع البيانات المزدحمة",
    config: {
      ...DEFAULT_CONSTRAINTS,
      teacherMaxDaily: { ...DEFAULT_CONSTRAINTS.teacherMaxDaily, mode: "hard" },
      maxPerDay: { ...DEFAULT_CONSTRAINTS.maxPerDay, mode: "hard" },
      minDaysPerWeek: { ...DEFAULT_CONSTRAINTS.minDaysPerWeek, mode: "hard" },
      teacherMaxConsec: { ...DEFAULT_CONSTRAINTS.teacherMaxConsec, mode: "hard" },
      subjectBlock: { ...DEFAULT_CONSTRAINTS.subjectBlock, mode: "hard" },
    },
  },
};

/** يدمج JSON مخزّن في الإعدادات مع الافتراضيات — الحقول الناقصة تأخذ الافتراضي */
export function mergeConstraints(json: string | null | undefined): ConstraintConfig {
  const out = { ...DEFAULT_CONSTRAINTS };
  if (!json) return out;
  try {
    const raw = JSON.parse(json) as Partial<Record<ConstraintKind, Partial<ConstraintRule>>>;
    for (const k of Object.keys(out) as ConstraintKind[]) {
      const r = raw[k];
      if (!r) continue;
      const mode = r.mode;
      const value = typeof r.value === "number" && r.value >= 0 ? r.value : out[k].value;
      out[k] = {
        mode: mode === "off" || mode === "soft" || mode === "hard" ? mode : out[k].mode,
        weight: typeof r.weight === "number" && r.weight >= 0 ? r.weight : out[k].weight,
        ...(value !== undefined ? { value } : {}),
      };
    }
  } catch { /* JSON تالف → افتراضيات */ }
  return out;
}

export type SolverInput = {
  workingDays: number[];
  periodsPerDay: Map<number, number[]>; // اليوم → فهارس الحصص غير الاستراحات، مرتبة (قد تختلف بين الأيام)
  assignments: AssignmentInput[];
  unavailable: Map<string, Set<SlotKey>>; // teacherId -> خانات محظورة
  teacherMaxDaily: Map<string, number>;
  teacherMaxConsec: Map<string, number>; // teacherId -> أقصى حصص متتالية (فقط من له حد)
  subjectPreferEarly: Set<string>;       // مواد يُفضَّل وضعها مبكرًا في اليوم
  subjectBlocked: Map<string, Set<SlotKey>>; // subjectId -> خانات محظورة على المادة
  subjectMaxPerDay: Map<string, number>; // subjectId -> أقصى حصص يومية للمادة لكل شعبة (فقط من له حد)
  subjectMinDays: Map<string, number>;   // subjectId -> أدنى أيام ظهور المادة لكل شعبة (فقط من له شرط)
  teacherNames: Map<string, string>;
  sectionNames: Map<string, string>;
  subjectNames: Map<string, string>;
  constraints: ConstraintConfig;
  timeLimitSeconds?: number;
};

export type Placement = {
  assignmentId: string;
  dayOfWeek: number;
  periodIndex: number;
};

export type SoftViolation = {
  kind:
    | "DAILY_OVERLOAD" | "SAME_DAY_REPEAT" | "CONSECUTIVE"
    | "MIN_DAYS" | "TEACHER_EMPTY_DAY" | "EARLY_SUBJECT"
    | "SUBJECT_SLOT" | "TEACHER_CONSEC"
    | "DAILY_IMBALANCE" | "FAIR_LAST_PERIOD";
  message: string;
  teacherId?: string;
  dayOfWeek?: number;
  count: number;
};

export type Diagnostic = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

export type SolveStatus =
  | "OPTIMAL"
  | "FEASIBLE"
  | "INFEASIBLE"
  | "MODEL_INVALID"
  | "UNKNOWN";

export type SolveResult = {
  status: SolveStatus;
  placements: Placement[];
  violations: SoftViolation[];
  score: number;
  diagnostics: Diagnostic[];
  solveTimeMs: number;
};
