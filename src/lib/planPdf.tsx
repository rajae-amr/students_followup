import path from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { PublishedPlanSubject } from "@app/core";

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
Font.register({
  family: "Amiri",
  fonts: [
    { src: path.join(FONT_DIR, "Amiri-Regular.ttf") },
    { src: path.join(FONT_DIR, "Amiri-Bold.ttf"), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const BRAND = "#0f766e";
const BRAND_LIGHT = "#f0fdfa";

const s = StyleSheet.create({
  page: { padding: 24, fontFamily: "Amiri", fontSize: 9, direction: "rtl" },
  header: { alignItems: "center", marginBottom: 12 },
  school: { fontSize: 11, color: "#475569", textAlign: "center" },
  year: { fontSize: 8, color: "#94a3b8", textAlign: "center", marginTop: 2 },
  title: { fontSize: 15, fontWeight: 700, textAlign: "center", marginTop: 6 },
  weekBadge: {
    marginTop: 6,
    backgroundColor: BRAND_LIGHT,
    color: BRAND,
    fontSize: 10,
    fontWeight: 700,
    paddingHorizontal: 14,
    paddingVertical: 3,
    borderRadius: 4,
    textAlign: "center",
  },
  subjectHead: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    backgroundColor: BRAND,
    color: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    marginTop: 10,
  },
  subjectName: { fontSize: 11, fontWeight: 700 },
  teacherName: { fontSize: 9 },
  missing: { color: "#fbbf24", fontSize: 8 },
  table: { borderWidth: 0.5, borderColor: "#94a3b8" },
  row: { flexDirection: "row-reverse" },
  cell: {
    borderWidth: 0.5,
    borderColor: "#94a3b8",
    paddingHorizontal: 4,
    paddingVertical: 3,
    fontSize: 8,
    textAlign: "right",
  },
  dayCell: { fontWeight: 700, backgroundColor: BRAND_LIGHT, width: "12%" },
  cellBody: { width: "17.6%" },
  headCell: {
    borderWidth: 0.5,
    borderColor: "#94a3b8",
    paddingHorizontal: 4,
    paddingVertical: 4,
    fontSize: 8,
    fontWeight: 700,
    color: BRAND,
    backgroundColor: BRAND_LIGHT,
    textAlign: "right",
  },
  footer: {
    marginTop: 14,
    fontSize: 7,
    color: "#94a3b8",
    textAlign: "center",
  },
});

const COLUMNS = [
  { key: "lessonTitle", label: "عنوان الدرس" },
  { key: "textbook", label: "الكتاب المدرسي" },
  { key: "platforms", label: "منصة ألف والبوابة الذكية" },
  { key: "tests", label: "الاختبارات" },
  { key: "notes", label: "ملاحظات" },
] as const;

export interface PlanPdfProps {
  schoolName: string;
  className: string;
  weekRange: string;
  schoolYear?: string;
  weekDays: { weekday: number; name: string }[];
  subjects: PublishedPlanSubject[];
}

function PlanPdfDocument({
  schoolName, className, weekRange, schoolYear, weekDays, subjects,
}: PlanPdfProps) {
  return (
    <Document
      title={`الخطة الأسبوعية — ${className}`}
      author={schoolName}
      language="ar"
    >
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.header}>
          <Text style={s.school}>{schoolName}</Text>
          {schoolYear ? <Text style={s.year}>{schoolYear}</Text> : null}
          <Text style={s.title}>الخطة الأسبوعية للصف {className}</Text>
          <Text style={s.weekBadge}>{weekRange}</Text>
        </View>

        {subjects.map((sub) => (
          <View key={sub.subjectId} break={false} wrap={false} style={{ marginBottom: 4 }}>
            <View style={s.subjectHead}>
              <Text style={s.subjectName}>مادة {sub.subjectName}</Text>
              <Text style={s.teacherName}>
                المعلم: {sub.teacherName}
                {sub.missing ? "  •  لم تُسلَّم" : ""}
              </Text>
            </View>
            <View style={s.table}>
              <View style={s.row}>
                <Text style={[s.headCell, { width: "12%" }]}>الأيام</Text>
                {COLUMNS.map((c) => (
                  <Text key={c.key} style={[s.headCell, { width: "17.6%" }]}>{c.label}</Text>
                ))}
              </View>
              {weekDays.map(({ weekday, name }) => {
                const e = sub.entries.find((x) => x.weekday === weekday);
                return (
                  <View key={weekday} style={s.row}>
                    <Text style={[s.cell, s.dayCell]}>{name}</Text>
                    {COLUMNS.map((c) => (
                      <Text key={c.key} style={[s.cell, s.cellBody]}>
                        {e?.[c.key] ?? ""}
                      </Text>
                    ))}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <Text style={s.footer}>
          أُنشئ آلياً عبر نظام متابعة الطلاب — {schoolName}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderPlanPdf(props: PlanPdfProps): Promise<Buffer> {
  return renderToBuffer(<PlanPdfDocument {...props} />);
}
