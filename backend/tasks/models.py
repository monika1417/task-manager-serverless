"""
ORM Models using MongoEngine
==============================
MongoEngine acts as an ORM (Object-Relational Mapper) for MongoDB.
Instead of writing raw pymongo queries, we define Python classes (Documents)
that map directly to MongoDB collections — just like Django ORM maps to SQL tables.

WHERE ORM IS USED:
------------------
- UserDocument  → maps to the "users" MongoDB collection
- TaskDocument  → maps to the "tasks" MongoDB collection
- ActivityLog   → maps to the "activity_logs" MongoDB collection

Each field in the class = a field in the MongoDB document.
MongoEngine handles all serialization / deserialization automatically.

FIXES applied:
  ✅ choices tuples use (value, label) pairs — correct MongoEngine format
  ✅ password stored as StringField (bcrypt hash decoded to str) — avoids
     BinaryField encoding issues across pymongo versions
  ✅ due_date uses DateTimeField(null=True, required=False) — explicit null support
"""

import mongoengine as me
from datetime import datetime, timezone


# ─────────────────────────────────────────────
# 👤 USER ORM MODEL
# ─────────────────────────────────────────────
class UserDocument(me.Document):
    """
    ORM model for the 'users' MongoDB collection.
    Replaces raw pymongo dict inserts with a structured class.

    password is stored as a plain StringField because bcrypt.hashpw()
    returns bytes; we decode to str before saving and encode back when checking.
    """
    name       = me.StringField(required=True, max_length=150)
    email      = me.EmailField(required=True, unique=True)
    password   = me.StringField(required=True)   # bcrypt hash stored as decoded str
    role       = me.StringField(choices=("admin", "user"), default="user")
    created_at = me.DateTimeField(default=lambda: datetime.now(timezone.utc))

    meta = {
        "collection": "users",       # MongoDB collection name
        "indexes":    ["email"],     # index on email for fast lookups
    }

    def __str__(self):
        return f"<User {self.email}>"


# ─────────────────────────────────────────────
# 📋 TASK ORM MODEL
# ─────────────────────────────────────────────

# MongoEngine choices must be a list/tuple of (value, display_label) pairs
STATUS_CHOICES = (
    ("pending",     "Pending"),
    ("in_progress", "In Progress"),
    ("completed",   "Completed"),
)

PRIORITY_CHOICES = (
    ("low",    "Low"),
    ("medium", "Medium"),
    ("high",   "High"),
)


class TaskDocument(me.Document):
    """
    ORM model for the 'tasks' MongoDB collection.
    Includes a due_date field so users can set deadlines.
    """
    title       = me.StringField(required=True, max_length=300)
    description = me.StringField(default="")
    status      = me.StringField(choices=STATUS_CHOICES, default="pending")
    priority    = me.StringField(choices=PRIORITY_CHOICES, default="medium")
    due_date    = me.DateTimeField(null=True, required=False)   # ← optional deadline
    user_id     = me.StringField(required=True)                 # JWT user_id (string)
    file_key    = me.StringField(null=True, required=False)     # ← optional S3 file attachment
    created_at  = me.DateTimeField(default=lambda: datetime.now(timezone.utc))
    updated_at  = me.DateTimeField(default=lambda: datetime.now(timezone.utc))

    meta = {
        "collection": "tasks",
        "indexes":    ["user_id", "-created_at"],
        "ordering":   ["-created_at"],
    }

    def __str__(self):
        return f"<Task {self.title} [{self.status}]>"


# ─────────────────────────────────────────────
# 📝 ACTIVITY LOG ORM MODEL
# ─────────────────────────────────────────────
class ActivityLog(me.Document):
    """
    ORM model for the 'activity_logs' MongoDB collection.
    Tracks user actions like login.
    """
    user_id   = me.StringField(required=True)
    action    = me.StringField(required=True)
    timestamp = me.DateTimeField(default=lambda: datetime.now(timezone.utc))

    meta = {
        "collection": "activity_logs",
        "ordering":   ["-timestamp"],
    }

    def __str__(self):
        return f"<ActivityLog {self.user_id} → {self.action}>"
