"use client";

import type { BulkAccountRow } from "@/server/actions/admin";

/**
 * قسائم توزيع قابلة للطباعة — بطاقة لكل حساب تُقص وتُسلّم.
 * تظهر في الطباعة فقط عبر قاعدة print-area في globals.css.
 */
export function AccountSlips({
  rows,
  schoolName,
  siteUrl,
  botUsername,
  audience,
}: {
  rows: BulkAccountRow[];
  schoolName: string;
  siteUrl: string;
  botUsername: string;
  audience: "guardian" | "teacher";
}) {
  return (
    <div className="print-area hidden print:block" dir="rtl">
      <div className="grid grid-cols-2 gap-4">
        {rows.map((r) => (
          <div
            key={r.username + r.names}
            className="break-inside-avoid rounded-xl border-2 border-dashed border-slate-300 p-4"
            style={{ breakInside: "avoid" }}
          >
            <p className="mb-2 border-b border-slate-200 pb-2 text-center text-sm font-bold text-slate-700">
              {schoolName}
              <span className="block text-xs font-normal text-slate-400">
                نظام متابعة الطلاب — دليل {audience === "teacher" ? "المعلم" : "ولي الأمر"}
              </span>
            </p>
            <p className="mb-1 text-sm">
              <span className="text-slate-500">{audience === "teacher" ? "المعلم" : "الطالب"}: </span>
              <span className="font-bold">{r.names}</span>
            </p>
            <div className="my-2 space-y-1 rounded-lg bg-slate-50 p-2.5 text-sm">
              <p>
                <span className="text-slate-500">اسم المستخدم: </span>
                <bdi dir="ltr" className="font-mono font-bold">{r.username}</bdi>
              </p>
              <p>
                <span className="text-slate-500">كلمة المرور: </span>
                <bdi dir="ltr" className="font-mono font-bold">{r.password ?? "—"}</bdi>
              </p>
            </div>
            <ol className="space-y-0.5 text-xs leading-5 text-slate-500">
              <li>1. افتح: <bdi dir="ltr" className="font-mono">{siteUrl}/login</bdi></li>
              <li>2. أدخل البيانات أعلاه</li>
              <li>3. ستُطلب منك كلمة مرور جديدة عند أول دخول — احفظها</li>
            </ol>

            <div className="mt-3 border-t border-slate-200 pt-2.5">
              <p className="mb-1 text-xs font-bold text-slate-700">
                📱 {audience === "teacher" ? "الرصد عبر تيليجرام" : "التقارير الأسبوعية عبر تيليجرام (موصى به)"}
              </p>
              <ol className="space-y-0.5 text-xs leading-5 text-slate-500">
                <li>1. افتح تيليجرام وابحث عن: <bdi dir="ltr" className="font-mono font-bold text-slate-700">@{botUsername}</bdi></li>
                <li>2. اضغط «ابدأ / Start»</li>
                <li>3. شارك جهة اتصالك بنفس الرقم المسجل لدى المدرسة</li>
                {audience === "teacher" ? (
                  <li>4. سيُربط حسابك كمعلم — أرسل «حضور» أو «سلوك» لرصد حصتك، أو اسم طالب لتقريره</li>
                ) : (
                  <li>4. سيتعرف البوت على رقمك ويربطك بابنك — رسالة تأكيد باسمه تصلك فوراً</li>
                )}
              </ol>
              {audience === "guardian" && (
                <div className="mt-1.5 rounded-lg bg-slate-50 p-2 text-[11px] leading-5 text-slate-500">
                  <p className="font-bold text-slate-600">ماذا يقدم البوت؟</p>
                  <p>• تقرير أسبوعي مجمّع لأبنائك: الحضور والسلوك والتقييمات — يصلك تلقائياً نهاية كل أسبوع</p>
                  <p>• تقرير فوري في أي وقت: أرسل اسم ابنك فقط</p>
                  <p>• /status لمراجعة حالة ربطك — /stop لإيقاف الرسائل</p>
                </div>
              )}
              <p className="mt-1 text-[11px] leading-5 text-slate-400">
                ملاحظة: استخدم نفس الرقم المسجل لدى المدرسة. إن تعذر الربط راجع الإدارة لتحديث رقمك.
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
