import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const arabic = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "نظام متابعة الطلاب",
  description: "متابعة الحضور والسلوك والدرجات والتواصل مع أولياء الأمور",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={arabic.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
