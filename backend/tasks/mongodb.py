"""
MongoDB Connection — MongoEngine ORM
======================================
This file registers the MongoEngine connection to MongoDB once at startup.

WHY HERE?
---------
MongoEngine requires a single `connect()` call before any Document (ORM model)
is used. Importing this module from views.py ensures the connection is live
before any query runs.

FIXES applied:
  ✅ Added uuidRepresentation='standard'  → removes DeprecationWarning
  ✅ Removed raw PyMongo client           → removes ResourceWarning (unclosed client)
     All CRUD now goes through ORM models (UserDocument, TaskDocument, ActivityLog)
     defined in models.py — no raw pymongo needed.
"""

import os
import mongoengine as me

# ─────────────────────────────────────────────
# Configuration (override via environment vars)
# ─────────────────────────────────────────────
MONGO_URI     = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DATABASE_NAME = os.getenv("DATABASE_NAME", "intern_db")

# ─────────────────────────────────────────────
# MongoEngine ORM Connection
# ─────────────────────────────────────────────
try:
    me.connect(
        db=DATABASE_NAME,
        host=MONGO_URI,
        serverSelectionTimeoutMS=5000,
        uuidRepresentation="standard",   # ✅ FIX: removes DeprecationWarning
    )
    print(f"✅ MongoEngine ORM connected to MongoDB → {DATABASE_NAME}")
except Exception as e:
    print(f"❌ MongoEngine connection failed: {e}")
