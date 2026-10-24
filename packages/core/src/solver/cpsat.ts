import type { Placement, SolveResult, SolverInput, SoftViolation, SolveStatus } from "./types";
import { dayName } from "./util";

type SolveOptions = {
  allowShortfall?: boolean; // وضع التشخيص: اسمح بنقص الحصص بدل الفشل
};

/**
 * يبني نموذج CP-SAT ويحله عبر cpsat-js (نسخة WASM من Google OR-Tools).
 * كل قيد له وضع قابل للتخصيص: "off" يُتخطى، "soft" غرامة بوزن، "hard" شرط صارم.
 */
export async function solveWithCpSat(input: SolverInput, opts: SolveOptions = {}): Promise<SolveResult> {
  const t0 = Date.now();
  const { CpModel, CpSolver, CpSolverStatus } = await import("cpsat-js");

  const { workingDays, periodsPerDay, assignments, unavailable, teacherMaxDaily, constraints } = input;
  const C = constraints;
  const periodsOf = (d: number) => periodsPerDay.get(d) ?? [];
  const maxP = Math.max(0, ...[...periodsPerDay.values()].map((l) => l.length));

  const model = new CpModel();
  const penaltyTerms: { expr: any; weight: number }[] = [];
  const penalize = (expr: any, weight: number) => penaltyTerms.push({ expr, weight });

  // ===== المتغيرات: x[a][d][p] =====
  // ننشئ متغيرًا فقط إذا كانت الخانة حصة دراسية والمعلم متاح فيها
  type VarKey = string; // `${aIdx}-${d}-${p}`
  const x = new Map<VarKey, any>();
  const varsByAssignment: Map<number, any[]> = new Map();
  const varsByTeacherSlot: Map<string, any[]> = new Map(); // `${t}-${d}-${p}`
  const varsBySectionSlot: Map<string, any[]> = new Map(); // `${s}-${d}-${p}`
  const varsByAssignDay: Map<string, any[]> = new Map(); // `${aIdx}-${d}`
  const varsBySecSubjDay: Map<string, any[]> = new Map(); // `${sectionId}|${subjectId}|${d}` — لحد المادة اليومي
  const varsByTeacherDay: Map<string, any[]> = new Map(); // `${t}-${d}`
  // ملاحظة: «المعلم يدرّس في الخانة» = مجموع varsByTeacherSlot[`${t}-${d}-${p}`]
  // (لا يمكن أن يتجاوز 1 بفضل قيد تفرد المعلم في الخانة)

  const isAvailable = (teacherId: string, d: number, p: number) =>
    !unavailable.get(teacherId)?.has(`${d}-${p}`);

  for (let a = 0; a < assignments.length; a++) {
    const asg = assignments[a]!;
    for (const d of workingDays) {
      for (const p of periodsOf(d)) {
        if (!isAvailable(asg.teacherId, d, p)) continue;
        const slotBlocked = input.subjectBlocked.get(asg.subjectId)?.has(`${d}-${p}`);
        if (slotBlocked && C.subjectBlock.mode === "hard") continue;
        const v = model.newBoolVar(`x_${a}_${d}_${p}`);
        if (slotBlocked && C.subjectBlock.mode === "soft") penalize(v, C.subjectBlock.weight);
        const key: VarKey = `${a}-${d}-${p}`;
        x.set(key, v);
        push(varsByAssignment, a, v);
        push(varsByTeacherSlot, `${asg.teacherId}-${d}-${p}`, v);
        push(varsBySectionSlot, `${asg.sectionId}-${d}-${p}`, v);
        push(varsByAssignDay, `${a}-${d}`, v);
        push(varsBySecSubjDay, `${asg.sectionId}|${asg.subjectId}|${d}`, v);
        push(varsByTeacherDay, `${asg.teacherId}-${d}`, v);
      }
    }
  }

  const sumOf = (vars: any[]) => {
    if (vars.length === 0) return null;
    const [first, ...rest] = vars;
    return rest.reduce((acc, v) => acc.plus(v.toLinearExpr()), first.toLinearExpr());
  };

  // ===== القيود الصلبة البنيوية (لا تُعطَّل: صحة الجدول ذاتها) =====

  // 1) عدد الحصص لكل تكليف
  for (let a = 0; a < assignments.length; a++) {
    const vars = varsByAssignment.get(a) ?? [];
    const total = sumOf(vars);
    if (!total) {
      // لا توجد خانات متاحة أصلًا لهذا التكليف — مستحيل حتمًا
      if (assignments[a]!.weeklyPeriods > 0) {
        return infeasibleNow("ASSIGNMENT_NO_SLOTS", t0);
      }
      continue;
    }
    if (opts.allowShortfall) {
      model.add(total.le(assignments[a]!.weeklyPeriods));
      // غرامة كبيرة جدًا على كل حصة ناقصة — تُستخدم للتشخيص فقط
      const short = model.newIntVar(0, assignments[a]!.weeklyPeriods, `short_${a}`);
      model.add(short.ge(model.newConstant(assignments[a]!.weeklyPeriods).minus(total)));
      penalize(short, 1000);
    } else {
      model.add(total.equals(assignments[a]!.weeklyPeriods));
    }
  }

  // 2) المعلم لا يدرّس شعبتين في نفس الوقت
  for (const [, vars] of varsByTeacherSlot) {
    if (vars.length > 1) model.add(sumOf(vars)!.le(1));
  }

  // 3) الشعبة لا تأخذ مادتين في نفس الوقت
  for (const [, vars] of varsBySectionSlot) {
    if (vars.length > 1) model.add(sumOf(vars)!.le(1));
  }

  // ===== القيود القابلة للتخصيص =====

  // 4) حد المادة اليومي على مستوى الشعبة — يجمع كل تكاليف المادة للشعبة مهما كان معلمها
  if (C.maxPerDay.mode !== "off") {
    for (const [key, vars] of varsBySecSubjDay) {
      const cap = input.subjectMaxPerDay.get(key.split("|")[1]!);
      if (cap == null || vars.length <= cap) continue;
      if (C.maxPerDay.mode === "hard") {
        model.add(sumOf(vars)!.le(cap));
      } else {
        const over = model.newIntVar(0, vars.length - cap, `smpd_${key}`);
        model.add(over.ge(sumOf(vars)!.minus(cap)));
        penalize(over, C.maxPerDay.weight);
      }
    }
  }

  // 5) حد أدنى لأيام ظهور المادة لكل شعبة (مثل: الرياضيات كل يوم) — على مستوى المادة
  // يجمع كل تكاليف المادة للشعبة فلا يتأثر بعدد المعلمين المشاركين
  if (C.minDaysPerWeek.mode !== "off" && input.subjectMinDays.size > 0) {
    // تجميع متغيرات كل (شعبة، مادة) حسب اليوم
    const pairDayVars = new Map<string, Map<number, any[]>>();
    for (const [key, vars] of varsBySecSubjDay) {
      const i = key.lastIndexOf("|");
      const pair = key.slice(0, i);
      const day = Number(key.slice(i + 1));
      const m = pairDayVars.get(pair) ?? new Map<number, any[]>();
      m.set(day, vars);
      pairDayVars.set(pair, m);
    }
    for (const [pair, dayMap] of pairDayVars) {
      const subjId = pair.slice(pair.lastIndexOf("|") + 1);
      const minDays = input.subjectMinDays.get(subjId) ?? 0;
      if (minDays <= 0) continue;
      const dayFlags: any[] = [];
      for (const [d, vars] of dayMap) {
        // used[sec][subj][d] = 1 ⟺ للمادة حصة في هذه الشعبة هذا اليوم
        const used = model.newBoolVar(`su_${pair}_${d}`);
        for (const v of vars) model.add(used.toLinearExpr().minus(v.toLinearExpr()).ge(0));
        model.add(used.toLinearExpr().minus(sumOf(vars)!).le(0));
        dayFlags.push(used);
      }
      if (dayFlags.length === 0) continue;
      const total = sumOf(dayFlags)!;
      if (C.minDaysPerWeek.mode === "hard") {
        if (minDays > dayFlags.length) {
          return infeasibleNow("MIN_DAYS_IMPOSSIBLE", t0);
        }
        model.add(total.ge(minDays));
      } else {
        // غرامة على كل يوم ناقص عن الحد الأدنى
        const short = model.newIntVar(0, minDays, `smds_${pair}`);
        model.add(short.ge(model.newConstant(minDays).minus(total)));
        penalize(short, C.minDaysPerWeek.weight);
      }
    }
  }

  // ===== القيود اللينة / الصارمة الاختيارية =====

  // (أ) الحد الأقصى لحصص المعلم اليومية
  if (C.teacherMaxDaily.mode !== "off") {
    for (const [key, vars] of varsByTeacherDay) {
      const teacherId = key.slice(0, key.lastIndexOf("-"));
      const maxDaily = teacherMaxDaily.get(teacherId) ?? maxP;
      if (vars.length <= maxDaily) continue;
      if (C.teacherMaxDaily.mode === "hard") {
        model.add(sumOf(vars)!.le(maxDaily));
      } else {
        const over = model.newIntVar(0, vars.length, `over_${key}`);
        model.add(over.ge(sumOf(vars)!.minus(maxDaily)));
        penalize(over, C.teacherMaxDaily.weight);
      }
    }
  }

  // (ب) توزيع التكليف على الأيام — تكرار المادة في اليوم الواحد
  if (C.sameDayRepeat.mode !== "off") {
    for (const [key, vars] of varsByAssignDay) {
      if (vars.length <= 1) continue;
      if (C.sameDayRepeat.mode === "hard") {
        model.add(sumOf(vars)!.le(1));
      } else {
        const extra = model.newIntVar(0, vars.length - 1, `rep_${key}`);
        model.add(extra.ge(sumOf(vars)!.minus(1)));
        penalize(extra, C.sameDayRepeat.weight);
      }
    }
  }

  // (ج) حصتان متتاليتان لنفس التكليف
  if (C.consecutive.mode !== "off") {
    for (let a = 0; a < assignments.length; a++) {
      for (const d of workingDays) {
        const lps = periodsOf(d);
        for (let j = 0; j + 1 < lps.length; j++) {
          const v1 = x.get(`${a}-${d}-${lps[j]}`);
          const v2 = x.get(`${a}-${d}-${lps[j + 1]}`);
          if (!v1 || !v2) continue;
          if (C.consecutive.mode === "hard") {
            model.add(v1.plus(v2).le(1));
          } else {
            const pair = model.newBoolVar(`pair_${a}_${d}_${j}`);
            model.add(pair.ge(v1.plus(v2).minus(1)));
            penalize(pair, C.consecutive.weight);
          }
        }
      }
    }
  }

  // ===== متغيرات used[t][d] — مطلوبة لدوام كل الأيام =====
  const needUsed = C.teacherEveryDay.mode !== "off";
  const usedVar: Map<string, any> = new Map(); // `${t}-${d}`
  const teacherIds = [...new Set(assignments.map((a) => a.teacherId))];
  if (needUsed) {
    for (const t of teacherIds) {
      for (const d of workingDays) {
        const dayVars = varsByTeacherDay.get(`${t}-${d}`);
        if (!dayVars || dayVars.length === 0) continue;
        const used = model.newBoolVar(`used_${t}_${d}`);
        for (const v of dayVars) model.add(used.toLinearExpr().minus(v.toLinearExpr()).ge(0));
        model.add(used.toLinearExpr().minus(sumOf(dayVars)!).le(0));
        usedVar.set(`${t}-${d}`, used);
      }
    }
  }

  // (و₂) دوام المعلم كل الأيام — لا يوم بلا حصة
  if (C.teacherEveryDay.mode !== "off") {
    for (const t of teacherIds) {
      for (const d of workingDays) {
        const used = usedVar.get(`${t}-${d}`);
        if (!used) continue; // لا خانة متاحة لهذا اليوم أصلًا — يغطيه التشخيص
        if (C.teacherEveryDay.mode === "hard") {
          model.add(used.toLinearExpr().equals(1));
        } else {
          const idle = model.newBoolVar(`idle_${t}_${d}`);
          model.add(idle.toLinearExpr().plus(used.toLinearExpr()).equals(1));
          penalize(idle, C.teacherEveryDay.weight);
        }
      }
    }
  }

  // (و۳) أقصى حصص متتالية للمعلم في اليوم — نافذة k+1 مواضع متتالية لا تمتلئ كلها
  if (C.teacherMaxConsec.mode !== "off" && input.teacherMaxConsec.size > 0) {
    for (const [t, k] of input.teacherMaxConsec) {
      if (k <= 0) continue;
      for (const d of workingDays) {
        const lps = periodsOf(d);
        for (let j = 0; j + k < lps.length; j++) {
          const vars: any[] = [];
          let missing = false;
          for (let m = j; m <= j + k; m++) {
            const sv = varsByTeacherSlot.get(`${t}-${d}-${lps[m]}`) ?? [];
            if (sv.length === 0) { missing = true; break; } // خانة غير متاحة داخل النافذة — تكسر التتابع
            vars.push(...sv);
          }
          if (missing) continue;
          const total = sumOf(vars)!;
          if (C.teacherMaxConsec.mode === "hard") {
            model.add(total.le(k));
          } else {
            const over = model.newIntVar(0, vars.length - k, `tconsec_${t}_${d}_${j}`);
            model.add(over.ge(total.minus(k)));
            penalize(over, C.teacherMaxConsec.weight);
          }
        }
      }
    }
  }

  // (ط) توازن الحمل اليومي — عقوبة على كل حصة فوق النصيب اليومي العادل ⌈حمل المعلم/أيام الدوام⌉
  if (C.dailyBalance.mode !== "off") {
    const demandOf = new Map<string, number>();
    for (const a of assignments) demandOf.set(a.teacherId, (demandOf.get(a.teacherId) ?? 0) + a.weeklyPeriods);
    for (const t of teacherIds) {
      const base = Math.ceil((demandOf.get(t) ?? 0) / workingDays.length);
      if (base <= 0) continue;
      for (const d of workingDays) {
        const dayVars = varsByTeacherDay.get(`${t}-${d}`) ?? [];
        if (dayVars.length <= base) continue; // لا يمكن تجاوز النصيب فيزيائيًا في هذا اليوم
        if (C.dailyBalance.mode === "hard") {
          model.add(sumOf(dayVars)!.le(base));
        } else {
          const over = model.newIntVar(0, dayVars.length - base, `bal_${t}_${d}`);
          model.add(over.ge(sumOf(dayVars)!.minus(base)));
          penalize(over, C.dailyBalance.weight);
        }
      }
    }
  }

  // (ي) عدالة الحصة الأخيرة — نصيب عادل من خانات نهاية اليوم ≈ ⌈شعب × أيام / معلمين⌉
  if (C.fairLastPeriod.mode !== "off") {
    const sectionIds = new Set(assignments.map((a) => a.sectionId));
    const share = Math.max(1, Math.ceil((sectionIds.size * workingDays.length) / teacherIds.length));
    for (const t of teacherIds) {
      const lastVars: any[] = [];
      for (const d of workingDays) {
        const lps = periodsOf(d);
        if (lps.length === 0) continue;
        lastVars.push(...(varsByTeacherSlot.get(`${t}-${d}-${lps[lps.length - 1]!}`) ?? []));
      }
      if (lastVars.length <= share) continue;
      if (C.fairLastPeriod.mode === "hard") {
        model.add(sumOf(lastVars)!.le(share));
      } else {
        const over = model.newIntVar(0, lastVars.length - share, `lastfair_${t}`);
        model.add(over.ge(sumOf(lastVars)!.minus(share)));
        penalize(over, C.fairLastPeriod.weight);
      }
    }
  }

  // (ز) تفضيل المادة: الحصص المبكرة — غرامة تتناسب مع تأخر الخانة داخل اليوم
  if (C.preferEarlySubject.mode !== "off" && input.subjectPreferEarly.size > 0) {
    for (let a = 0; a < assignments.length; a++) {
      if (!input.subjectPreferEarly.has(assignments[a]!.subjectId)) continue;
      for (const d of workingDays) {
        const lps = periodsOf(d);
        for (let j = 0; j < lps.length; j++) {
          const v = x.get(`${a}-${d}-${lps[j]}`);
          if (!v) continue;
          // j = موضع الحصة في اليوم (0 = الأولى) — كلما تأخرت زادت الغرامة
          penalize(v.times(j), C.preferEarlySubject.weight);
        }
      }
    }
  }

  // ===== الهدف =====
  if (penaltyTerms.length > 0) {
    let objective = penaltyTerms[0]!.expr.times(penaltyTerms[0]!.weight);
    for (let i = 1; i < penaltyTerms.length; i++) {
      objective = objective.plus(penaltyTerms[i]!.expr.times(penaltyTerms[i]!.weight));
    }
    model.minimize(objective);
  }

  // ===== الحل =====
  const solver = await CpSolver.create();
  const result = solver.solve(model, {
    maxTimeInSeconds: input.timeLimitSeconds ?? 60,
  });

  const status = mapStatus(result.status, CpSolverStatus);
  const solveTimeMs = Date.now() - t0;

  if (status !== "OPTIMAL" && status !== "FEASIBLE") {
    return { status, placements: [], violations: [], score: 0, diagnostics: [], solveTimeMs };
  }

  // ===== استخراج الحل =====
  const placements: Placement[] = [];
  for (let a = 0; a < assignments.length; a++) {
    for (const d of workingDays) {
      for (const p of periodsOf(d)) {
        const v = x.get(`${a}-${d}-${p}`);
        if (v && result.value(v) > 0.5) {
          placements.push({ assignmentId: assignments[a]!.id, dayOfWeek: d, periodIndex: p });
        }
      }
    }
  }

  const violations = describeViolations(input, placements);
  const score = scoreTimetable(input, placements, violations);

  return { status, placements, violations, score, diagnostics: [], solveTimeMs };
}

function push<K>(map: Map<K, any[]>, key: K, v: any) {
  const arr = map.get(key);
  if (arr) arr.push(v);
  else map.set(key, [v]);
}

function mapStatus(s: any, E: any): SolveStatus {
  if (s === E.OPTIMAL) return "OPTIMAL";
  if (s === E.FEASIBLE) return "FEASIBLE";
  if (s === E.INFEASIBLE) return "INFEASIBLE";
  if (s === E.MODEL_INVALID) return "MODEL_INVALID";
  return "UNKNOWN";
}

function infeasibleNow(code: string, t0: number): SolveResult {
  return {
    status: "INFEASIBLE",
    placements: [],
    violations: [],
    score: 0,
    diagnostics: [{ severity: "error", code, message: code }],
    solveTimeMs: Date.now() - t0,
  };
}

/**
 * يحسب انتهاكات القيود من الحل الفعلي (وليس من متغيرات الحلّال)
 * ليعمل التقرير بغض النظر عن المكتبة المستخدمة.
 * يُبلَّغ فقط عن القيود غير المعطّلة — صارمٌ أم لين.
 */
export function describeViolations(input: SolverInput, placements: Placement[]): SoftViolation[] {
  const out: SoftViolation[] = [];
  const C = input.constraints;
  const aById = new Map(input.assignments.map((a) => [a.id, a]));
  const name = (m: Map<string, string>, id: string) => m.get(id) ?? id;
  const posOfByDay = new Map<number, Map<number, number>>();
  for (const [d, lps] of input.periodsPerDay) {
    posOfByDay.set(d, new Map(lps.map((p, i) => [p, i])));
  }
  const posOf = (d: number, p: number) => posOfByDay.get(d)?.get(p) ?? 0;
  const maxP = Math.max(0, ...[...input.periodsPerDay.values()].map((l) => l.length));

  // تجميع
  const byTeacherDay = new Map<string, Placement[]>();
  const byAssignDay = new Map<string, Placement[]>();
  for (const pl of placements) {
    const a = aById.get(pl.assignmentId)!;
    push(byTeacherDay, `${a.teacherId}-${pl.dayOfWeek}`, pl);
    push(byAssignDay, `${a.id}-${pl.dayOfWeek}`, pl);
  }

  // (أ) تجاوز الحد اليومي
  if (C.teacherMaxDaily.mode !== "off") {
    for (const [key, list] of byTeacherDay) {
      const teacherId = key.slice(0, key.lastIndexOf("-"));
      const day = Number(key.slice(key.lastIndexOf("-") + 1));
      const max = input.teacherMaxDaily.get(teacherId) ?? maxP;
      if (list.length > max) {
        out.push({
          kind: "DAILY_OVERLOAD",
          count: list.length - max,
          teacherId,
          dayOfWeek: day,
          message: `المعلم ${name(input.teacherNames, teacherId)} لديه ${list.length} حصص يوم ${dayName(day)} (الحد ${max})`,
        });
      }
    }
  }

  // (ب)+(ج) تكرار التكليف في اليوم + التتالي + (هـ) حد أدنى الأيام
  for (const [key, list] of byAssignDay) {
    const aIdx = key.slice(0, key.lastIndexOf("-"));
    const day = Number(key.slice(key.lastIndexOf("-") + 1));
    const a = aById.get(aIdx)!;
    // عتبة التوزيع: بعض الأيام يجب أن تحمل ceil(أسبوعي/أيام) حصصًا على الأقل،
    // فالتكرار ضمن هذا الحد لا مفر منه ولا يُبلَّغ عنه كتحسين ممكن
    const unavoidable = Math.max(1, Math.ceil(a.weeklyPeriods / input.workingDays.length));
    if (C.sameDayRepeat.mode !== "off" && list.length > Math.max(1, unavoidable)) {
      out.push({
        kind: "SAME_DAY_REPEAT",
        count: list.length - 1,
        teacherId: a.teacherId,
        dayOfWeek: day,
        message: `مادة ${name(input.subjectNames, a.subjectId)} تتكرر ${list.length} مرات يوم ${dayName(day)} للشعبة ${name(input.sectionNames, a.sectionId)}`,
      });
    }
    if (C.consecutive.mode !== "off") {
      // تتالي: مواضع متتالية في قائمة حصص ذلك اليوم
      const positions = list.map((p) => posOf(p.dayOfWeek, p.periodIndex)).sort((x, y) => x - y);
      let consec = 0;
      for (let i = 1; i < positions.length; i++) {
        if (positions[i]! === positions[i - 1]! + 1) consec++;
      }
      if (consec > 0) {
        out.push({
          kind: "CONSECUTIVE",
          count: consec,
          teacherId: a.teacherId,
          dayOfWeek: day,
          message: `حصص متتالية من ${name(input.subjectNames, a.subjectId)} للشعبة ${name(input.sectionNames, a.sectionId)} يوم ${dayName(day)}`,
        });
      }
    }
  }

  // (هـ) حد أدنى أيام المادة لكل شعبة — يجمع كل تكاليف المادة للشعبة
  if (C.minDaysPerWeek.mode !== "off" && input.subjectMinDays.size > 0) {
    const daysBySecSubj = new Map<string, Set<number>>();
    for (const pl of placements) {
      const a = aById.get(pl.assignmentId)!;
      const k = `${a.sectionId}|${a.subjectId}`;
      const set = daysBySecSubj.get(k) ?? new Set<number>();
      set.add(pl.dayOfWeek);
      daysBySecSubj.set(k, set);
    }
    const pairs = new Set(input.assignments.map((a) => `${a.sectionId}|${a.subjectId}`));
    for (const pair of pairs) {
      const subjId = pair.slice(pair.lastIndexOf("|") + 1);
      const minDays = input.subjectMinDays.get(subjId) ?? 0;
      if (minDays <= 0) continue;
      const secId = pair.slice(0, pair.lastIndexOf("|"));
      const used = daysBySecSubj.get(pair)?.size ?? 0;
      if (used < minDays) {
        out.push({
          kind: "MIN_DAYS",
          count: minDays - used,
          message: `مادة ${name(input.subjectNames, subjId)} للشعبة ${name(input.sectionNames, secId)} ظهرت في ${used} أيام فقط (المطلوب ${minDays} على الأقل)`,
        });
      }
    }
  }

  // (د) مخالفات يومية لكل معلم — أقصى متتالية
  for (const [key, list] of byTeacherDay) {
    const teacherId = key.slice(0, key.lastIndexOf("-"));
    const day = Number(key.slice(key.lastIndexOf("-") + 1));
    const positions = list.map((p) => posOf(p.dayOfWeek, p.periodIndex)).sort((x, y) => x - y);

    // أقصى حصص متتالية للمعلم في اليوم
    const maxConsec = C.teacherMaxConsec.mode !== "off" ? input.teacherMaxConsec.get(teacherId) : undefined;
    if (maxConsec != null && maxConsec > 0 && positions.length > maxConsec) {
      let run = 1;
      let worst = 1;
      for (let i = 1; i < positions.length; i++) {
        run = positions[i]! === positions[i - 1]! + 1 ? run + 1 : 1;
        if (run > worst) worst = run;
      }
      if (worst > maxConsec) {
        out.push({
          kind: "TEACHER_CONSEC",
          count: worst - maxConsec,
          teacherId,
          dayOfWeek: day,
          message: `المعلم ${name(input.teacherNames, teacherId)} لديه ${worst} حصص متتالية يوم ${dayName(day)} (الحد ${maxConsec})`,
        });
      }
    }
  }

  // خانات محظورة على المادة
  if (C.subjectBlock.mode !== "off") {
    for (const p of placements) {
      const a = aById.get(p.assignmentId)!;
      if (input.subjectBlocked.get(a.subjectId)?.has(`${p.dayOfWeek}-${p.periodIndex}`)) {
        const pos = (input.periodsPerDay.get(p.dayOfWeek) ?? []).indexOf(p.periodIndex);
        out.push({
          kind: "SUBJECT_SLOT",
          count: 1,
          teacherId: a.teacherId,
          dayOfWeek: p.dayOfWeek,
          message: `مادة ${name(input.subjectNames, a.subjectId)} مجدولة في خانة محظورة (${dayName(p.dayOfWeek)} الحصة ${pos + 1}) للشعبة ${name(input.sectionNames, a.sectionId)}`,
        });
      }
    }
  }

  // دوام المعلم كل الأيام
  if (C.teacherEveryDay.mode !== "off") {
    const daysByTeacher = new Map<string, Set<number>>();
    for (const pl of placements) {
      const a = aById.get(pl.assignmentId)!;
      const set = daysByTeacher.get(a.teacherId) ?? new Set<number>();
      set.add(pl.dayOfWeek);
      daysByTeacher.set(a.teacherId, set);
    }
    for (const t of new Set(input.assignments.map((a) => a.teacherId))) {
      const empty = input.workingDays.length - (daysByTeacher.get(t)?.size ?? 0);
      if (empty > 0) {
        out.push({
          kind: "TEACHER_EMPTY_DAY",
          count: empty,
          teacherId: t,
          message: `المعلم ${name(input.teacherNames, t)} لديه ${empty} ${empty === 1 ? "يوم بلا حصص" : "أيام بلا حصص"}`,
        });
      }
    }
  }

  // (ط) توازن الحمل اليومي — حصص فوق ⌈حمل المعلم/أيام الدوام⌉ في يوم واحد
  if (C.dailyBalance.mode !== "off") {
    const demandOf = new Map<string, number>();
    for (const a of input.assignments) {
      demandOf.set(a.teacherId, (demandOf.get(a.teacherId) ?? 0) + a.weeklyPeriods);
    }
    for (const [key, list] of byTeacherDay) {
      const teacherId = key.slice(0, key.lastIndexOf("-"));
      const day = Number(key.slice(key.lastIndexOf("-") + 1));
      const base = Math.ceil((demandOf.get(teacherId) ?? 0) / input.workingDays.length);
      if (base > 0 && list.length > base) {
        out.push({
          kind: "DAILY_IMBALANCE",
          count: list.length - base,
          teacherId,
          dayOfWeek: day,
          message: `المعلم ${name(input.teacherNames, teacherId)} لديه ${list.length} حصص يوم ${dayName(day)} — نصيبه العادل ${base} حصة/يوم`,
        });
      }
    }
  }

  // (ي) عدالة الحصة الأخيرة — معلم يتجاوز نصيبه العادل من خانات نهاية اليوم
  if (C.fairLastPeriod.mode !== "off") {
    const sectionIds = new Set(input.assignments.map((a) => a.sectionId));
    const teacherIds2 = new Set(input.assignments.map((a) => a.teacherId));
    const share = Math.max(
      1,
      Math.ceil((sectionIds.size * input.workingDays.length) / teacherIds2.size)
    );
    const lastByTeacher = new Map<string, number>();
    for (const pl of placements) {
      const lps = input.periodsPerDay.get(pl.dayOfWeek) ?? [];
      if (lps.length === 0 || pl.periodIndex !== lps[lps.length - 1]!) continue;
      const a = aById.get(pl.assignmentId)!;
      lastByTeacher.set(a.teacherId, (lastByTeacher.get(a.teacherId) ?? 0) + 1);
    }
    for (const [t, n] of lastByTeacher) {
      if (n > share) {
        out.push({
          kind: "FAIR_LAST_PERIOD",
          count: n - share,
          teacherId: t,
          message: `المعلم ${name(input.teacherNames, t)} لديه ${n} حصص أخيرة في الأسبوع — النصيب العادل بين المعلمين ${share}`,
        });
      }
    }
  }

  return out;
}

/** وزن كل نوع انتهاك حسب إعدادات المدرسة */
function kindWeight(kind: SoftViolation["kind"], input: SolverInput): number {
  const c = input.constraints;
  switch (kind) {
    case "DAILY_OVERLOAD": return c.teacherMaxDaily.weight;
    case "SAME_DAY_REPEAT": return c.sameDayRepeat.weight;
    case "CONSECUTIVE": return c.consecutive.weight;
    case "MIN_DAYS": return c.minDaysPerWeek.weight;
    case "TEACHER_EMPTY_DAY": return c.teacherEveryDay.weight;
    case "TEACHER_CONSEC": return c.teacherMaxConsec.weight;
    case "EARLY_SUBJECT": return c.preferEarlySubject.weight;
    case "SUBJECT_SLOT": return c.subjectBlock.weight;
    case "DAILY_IMBALANCE": return c.dailyBalance.weight;
    case "FAIR_LAST_PERIOD": return c.fairLastPeriod.weight;
  }
}

export function scoreTimetable(
  input: SolverInput,
  placements: Placement[],
  violations: SoftViolation[]
): number {
  let penalty = 0;
  for (const v of violations) {
    penalty += v.count * kindWeight(v.kind, input);
  }
  // قاعدة: كل تكليف يمكن أن ينتهك مرتين في اليوم نظريًا → مقياس نسبي
  const scale = Math.max(1, input.assignments.length * 4);
  const score = 100 * (1 - Math.min(1, penalty / scale));
  return Math.round(score * 10) / 10;
}
