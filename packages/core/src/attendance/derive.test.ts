import { describe, it, expect } from "vitest";
import { deriveDayStatus, DEFAULT_POLICY } from "./derive";

describe("deriveDayStatus — قواعد اليوم المعتمدة", () => {
  it("لا سجلات → لا حالة", () => {
    expect(deriveDayStatus([]).status).toBe("unknown");
  });

  it("حضور فقط → حاضر", () => {
    const d = deriveDayStatus(["present", "present", "present"]);
    expect(d.status).toBe("present");
    expect(d.presentCount).toBe(3);
  });

  it("غياب حصة واحدة → غياب جزئي", () => {
    const d = deriveDayStatus(["present", "absent"]);
    expect(d.status).toBe("partial");
    expect(d.absentCount).toBe(1);
  });

  it("غياب حصتين → غياب جزئي", () => {
    expect(deriveDayStatus(["absent", "absent", "present"]).status).toBe(
      "partial",
    );
  });

  it("غياب 3 حصص → غياب يوم", () => {
    expect(deriveDayStatus(["absent", "absent", "absent"]).status).toBe(
      "absent",
    );
  });

  it("غياب 4 حصص مع حضور → يبقى غياب يوم", () => {
    expect(
      deriveDayStatus(["absent", "absent", "absent", "absent", "present"])
        .status,
    ).toBe("absent");
  });

  it("استئذان 3 حصص → غائب بعذر", () => {
    expect(deriveDayStatus(["excused", "excused", "excused"]).status).toBe(
      "excused",
    );
  });

  it("استئذان حصة أو حصتين → غياب جزئي", () => {
    expect(deriveDayStatus(["excused"]).status).toBe("partial");
    expect(deriveDayStatus(["excused", "excused"]).status).toBe("partial");
  });

  it("تأخير دون غياب → متأخر", () => {
    expect(deriveDayStatus(["present", "late", "present"]).status).toBe("late");
  });

  it("غياب + تأخير → غياب جزئي (الغياب أولوية)", () => {
    expect(deriveDayStatus(["absent", "late"]).status).toBe("partial");
  });

  it("الاستئذان لا يُحسب غياباً — عدّاد مستقل", () => {
    const d = deriveDayStatus(["excused", "excused", "absent", "absent"]);
    expect(d.status).toBe("partial"); // غيابان فقط، لا 3
    expect(d.excusedCount).toBe(2);
    expect(d.absentCount).toBe(2);
  });

  it("العتبة قابلة للضبط من سياسة المدرسة", () => {
    const policy = { ...DEFAULT_POLICY, absentFullDayThreshold: 2 };
    expect(deriveDayStatus(["absent", "absent"], policy).status).toBe("absent");
  });

  it("سجلات أقل من اليوم الكامل تُحسب على المرصود فقط", () => {
    const d = deriveDayStatus(["absent"]);
    expect(d.recordedCount).toBe(1);
    expect(d.status).toBe("partial");
  });
});
