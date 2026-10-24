// تنسيق الحل — نقي بلا تبعيات قاعدة بيانات ليبقى قابلًا للاختبار
import { solveWithCpSat } from "./cpsat";
import { preSolveChecks, RELAXATION_LADDER } from "./diagnostics";
import type { Diagnostic, SolveResult, SolverInput } from "./types";

/**
 * يشغّل الفحوص ثم الحلّال، وعند الاستحالة يشخّص السبب عبر سلّم التراخيص.
 */
export async function runSolver(input: SolverInput): Promise<{
  result: SolveResult;
  diagnostics: Diagnostic[];
}> {
  const diagnostics = preSolveChecks(input);
  const hasErrors = diagnostics.some((d) => d.severity === "error");

  if (hasErrors) {
    return {
      result: {
        status: "INFEASIBLE",
        placements: [],
        violations: [],
        score: 0,
        diagnostics,
        solveTimeMs: 0,
      },
      diagnostics,
    };
  }

  const result = await solveWithCpSat(input);

  if (result.status === "INFEASIBLE" || result.status === "UNKNOWN") {
    const causes = await diagnoseInfeasible(input);
    diagnostics.push(...causes);
    if (diagnostics.length === 0) {
      diagnostics.push({
        severity: "error",
        code: "NO_SOLUTION_UNKNOWN",
        message:
          "تعذّر إيجاد جدول صالح ولم يتم تحديد سبب محدد — جرّب تخفيف القيود (النصاب، التوفر، أقصى حصص يومية)",
      });
    }
    result.diagnostics = diagnostics;
  }

  return { result, diagnostics };
}

async function diagnoseInfeasible(input: SolverInput): Promise<Diagnostic[]> {
  const diags: Diagnostic[] = [];
  const shortLimit = Math.min(input.timeLimitSeconds ?? 60, 20);
  const probe = { ...input, timeLimitSeconds: shortLimit };

  for (const step of RELAXATION_LADDER) {
    if (step.id === "ALLOW_SHORTFALL") {
      const r = await solveWithCpSat(probe, { allowShortfall: true });
      if (r.status === "OPTIMAL" || r.status === "FEASIBLE") {
        const placed = new Map<string, number>();
        for (const p of r.placements) {
          placed.set(p.assignmentId, (placed.get(p.assignmentId) ?? 0) + 1);
        }
        const shortfalls = input.assignments
          .map((a) => ({ a, missing: a.weeklyPeriods - (placed.get(a.id) ?? 0) }))
          .filter((x) => x.missing > 0);
        if (shortfalls.length > 0) {
          diags.push({
            severity: "error",
            code: "SHORTFALL",
            message: `عند السماح بنقص الحصص أمكن حل الجدول مع ${shortfalls.reduce((s, x) => s + x.missing, 0)} حصة ناقصة. التكاليف المتأثرة: ${shortfalls
              .map(
                (x) =>
                  `${input.subjectNames.get(x.a.subjectId) ?? ""} (${input.sectionNames.get(x.a.sectionId) ?? ""}) −${x.missing}`
              )
              .join("، ")}`,
          });
        }
      }
      continue;
    }

    const relaxed = step.apply(probe);
    const r = await solveWithCpSat(relaxed);
    if (r.status === "OPTIMAL" || r.status === "FEASIBLE") {
      diags.push({
        severity: "error",
        code: `INFEASIBLE_${step.id}`,
        message: `يبدو أن سبب الاستحالة هو: ${step.label} — عند إسقاطه أمكن إيجاد جدول صالح`,
      });
      break;
    }
  }
  return diags;
}
