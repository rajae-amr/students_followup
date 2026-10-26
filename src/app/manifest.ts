import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "نظام متابعة الطلاب — مدرسة الجسر الحلقة الثانية بنين",
    short_name: "متابعة الطلاب",
    description: "متابعة الحضور والسلوك والدرجات والتواصل مع أولياء الأمور",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0d9488",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
