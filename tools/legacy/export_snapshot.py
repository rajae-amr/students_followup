#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
نسخة متسقة من قاعدة SQLite القديمة — قراءة فقط للمصدر.

يستخدم SQLite Backup API (وليس نسخ الملف الخام) لضمان اتساق النسخة
مع وجود WAL، ولا يعدّل قاعدة البيانات الأصلية إطلاقاً.

الاستخدام:
    python -X utf8 export_snapshot.py --db "..\\..\\data.db" --out snapshots\\snapshot_2025-01-01.db

ثم تحقق من السلامة وعدّد الجداول:
    python -X utf8 export_snapshot.py --verify snapshots\\snapshot_2025-01-01.db
"""

import argparse
import sqlite3
import sys
from pathlib import Path


def snapshot(db_path: Path, out_path: Path) -> None:
    if not db_path.exists():
        sys.exit(f"قاعدة البيانات غير موجودة: {db_path}")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists():
        sys.exit(f"الوجهة موجودة مسبقاً — لن أكتب فوقها: {out_path}")

    src = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    dst = sqlite3.connect(out_path)
    try:
        src.backup(dst)  # Backup API — متسق حتى مع WAL
    finally:
        dst.close()
        src.close()
    print(f"أُنشئت النسخة: {out_path}")


def verify(path: Path) -> None:
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        ok = con.execute("PRAGMA integrity_check").fetchone()[0]
        print(f"integrity_check: {ok}")
        tables = con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
        for (t,) in tables:
            n = con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
            print(f"  {t}: {n}")
    finally:
        con.close()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--db", type=Path, help="مسار قاعدة SQLite المصدر")
    p.add_argument("--out", type=Path, help="مسار ملف النسخة")
    p.add_argument("--verify", type=Path, help="التحقق من نسخة موجودة")
    args = p.parse_args()

    if args.verify:
        verify(args.verify)
    elif args.db and args.out:
        snapshot(args.db.resolve(), args.out.resolve())
    else:
        p.print_help()


if __name__ == "__main__":
    main()
