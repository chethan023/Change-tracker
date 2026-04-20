"""Drop and recreate the local SQLite DB, then restart the API to trigger re-seeding.

Usage:
    python reset_db.py
"""
import os
import sys

from app.config import settings
from app.db.session import Base, engine


def main() -> None:
    url = settings.DATABASE_URL
    if not url.startswith("sqlite"):
        print(f"Refusing to drop non-SQLite DB: {url}", file=sys.stderr)
        sys.exit(1)

    db_path = url.split("///", 1)[-1]
    if os.path.exists(db_path):
        os.remove(db_path)
        print(f"Removed {db_path}")

    Base.metadata.create_all(bind=engine)
    print("Schema recreated. Restart the API to seed users from BOOTSTRAP_* env vars.")


if __name__ == "__main__":
    main()
