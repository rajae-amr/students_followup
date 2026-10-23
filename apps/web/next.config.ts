import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // حزم workspace تحوّل من المصدر مباشرة
  transpilePackages: ["@app/db", "@app/core", "@app/auth", "@app/ui"],
  // خدمات الخادم تعمل على Node.js runtime
  serverExternalPackages: ["@prisma/client", "exceljs"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
