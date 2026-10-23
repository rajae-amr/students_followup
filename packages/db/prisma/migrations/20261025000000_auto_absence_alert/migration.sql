-- تنبيه الغياب الآلي — إعداد اختياري في school_settings
ALTER TABLE "school_settings" ADD COLUMN "autoAbsenceAlert" BOOLEAN NOT NULL DEFAULT false;
