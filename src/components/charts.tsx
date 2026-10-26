"use client";

/**
 * رسوم لوحة التحليلات — غلاف رقيق على Recharts بتنسيق موحد.
 * مكوّنات عميل داخل صفحات خادمية: تُمرَّر إليها بيانات مسلسلة فقط.
 */
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export type SeriesDef = { key: string; name: string; color: string };

const axisStyle = { fontSize: 11, fill: "#64748b", fontFamily: "inherit" } as const;

const tooltipStyle = {
  direction: "rtl",
  textAlign: "right",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  fontSize: "12px",
  boxShadow: "0 4px 12px rgba(15,23,42,.08)",
} as const;

/** اتجاه زمني مكدّس — سلسلة متعددة فوق محور أيام */
export function TrendArea({
  data,
  series,
  height = 240,
}: {
  data: Record<string, string | number>[];
  series: SeriesDef[];
  height?: number;
}) {
  return (
    <div dir="ltr" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ direction: "rtl", fontSize: 12 }} iconType="circle" iconSize={8} />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stackId="1"
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.55}
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** أعمدة بسيطة — نمط أيام الأسبوع، متوسطات المواد */
export function BarsChart({
  data,
  dataKey = "value",
  color = "#0d9488",
  height = 220,
  unit = "",
}: {
  data: { label: string; value: number }[];
  dataKey?: string;
  color?: string;
  height?: number;
  unit?: string;
}) {
  return (
    <div dir="ltr" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} unit={unit} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
          <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** حلقة توزيع — نسب مئوية مع عنوان مركزي */
export function DonutChart({
  data,
  centerLabel,
  height = 220,
}: {
  data: { name: string; value: number; color: string }[];
  centerLabel?: string;
  height?: number;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="flex items-center gap-4" style={{ height }}>
      <div dir="ltr" className="h-full w-1/2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              strokeWidth={2}
              stroke="#fff"
            >
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            {centerLabel && (
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
                fontSize={20} fontWeight={800} fill="#0f766e">
                {centerLabel}
              </text>
            )}
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{d.name}</span>
            <span className="shrink-0 text-slate-400">
              {d.value}{total ? ` (${Math.round((d.value / total) * 100)}%)` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** أعمدة أفقية مرتبة — مقارنة فئات بأسماء عربية طويلة (صفوف/مواد) */
export function HBars({
  data,
  color = "#0d9488",
  height,
  unit = "",
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  unit?: string;
}) {
  const h = height ?? Math.max(140, data.length * 34 + 40);
  return (
    <div dir="ltr" style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} unit={unit} />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ ...axisStyle, fontSize: 12, fontWeight: 600 }}
            tickLine={false}
            axisLine={false}
            width={120}
            orientation="right"
          />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
          <Bar dataKey="value" fill={color} radius={[6, 0, 0, 6]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
