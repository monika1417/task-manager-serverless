"""
=============================================================================
  Task Manager — AWS Lambda Handler
=============================================================================
  All 14 API endpoints from the Django backend, re-implemented for Lambda.
  No Django / DRF required here — pure Python with pymongo + boto3 + PyJWT.

  ROUTES HANDLED:
  ──────────────────────────────────────────────────────────────────────────
  GET  /health                        → health check
  POST /auth/register                 → register new user
  POST /auth/login                    → login, returns JWT access token

  GET  /tasks                         → list tasks  (JWT required)
  POST /tasks/create                  → create task (JWT required)
  PUT  /tasks/update/{task_id}        → update task (JWT required)
  DELETE /tasks/delete/{task_id}      → delete task (JWT required)

  GET  /analytics/status              → task count by status  (JWT required)
  GET  /analytics/priority            → task count by priority (JWT required)
  GET  /analytics/date                → tasks created last 7 days (JWT required)
  GET  /analytics/overdue             → overdue tasks by priority (JWT required)
  GET  /analytics/filtered            → filtered tasks (JWT required)

  POST /s3/presign-upload             → S3 pre-signed PUT URL (JWT required)
  GET  /s3/presign-download           → S3 pre-signed GET URL (JWT required)

  ENVIRONMENT VARIABLES REQUIRED (set in Lambda console):
  ──────────────────────────────────────────────────────
    MONGO_URI        = mongodb+srv://user:pass@cluster.mongodb.net/
    DATABASE_NAME    = intern_db           (your MongoDB database name)
    SECRET_KEY       = <your-django-secret-key>
    AWS_S3_BUCKET    = task-manager-uploads-yourname
    AWS_S3_REGION    = ap-south-1          (or your region)

  HOW TO DEPLOY:
  ──────────────
    cd Backend/lambda_microservice
    # Build:
    chmod +x deploy.sh
    ./deploy.sh
    
    # Deployment:
    1. Create Lambda on AWS Console (Python 3.12).
    2. Upload lambda_function.zip.
    3. Set Env Vars: MONGO_URI (from Atlas), SECRET_KEY, S3_BUCKET.
    4. Attach IAM Role with S3 & VPC access.

  MONGODB ATLAS:
  ──────────────
    Use the 'Connect' button in Atlas -> 'Drivers' -> 'Python' copy the URI.
    Example: mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
=============================================================================
"""

import json
import os
import re
import logging
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import boto3
from botocore.exceptions import ClientError
from pymongo import MongoClient
from bson import ObjectId

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ─────────────────────────────────────────────────────────────────────────────
# Environment Configuration
# ─────────────────────────────────────────────────────────────────────────────
MONGO_URI     = os.environ.get("MONGO_URI", "")
DATABASE_NAME = os.environ.get("DATABASE_NAME", "intern_db")
SECRET_KEY    = os.environ.get("SECRET_KEY", "changeme-set-in-lambda-env")
S3_BUCKET     = os.environ.get("AWS_S3_BUCKET", "")
S3_REGION     = os.environ.get("AWS_S3_REGION", "ap-south-1")

# ─────────────────────────────────────────────────────────────────────────────
# MongoDB Connection  (reused across warm Lambda invocations)
# ─────────────────────────────────────────────────────────────────────────────
_mongo_client = None

def get_db():
    """Return the MongoDB database object (singleton per Lambda container)."""
    global _mongo_client
    if _mongo_client is None:
        if not MONGO_URI:
            raise RuntimeError("MONGO_URI environment variable is not set.")
        _mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        logger.info("MongoDB client created.")
    return _mongo_client[DATABASE_NAME]


# ─────────────────────────────────────────────────────────────────────────────
# Helpers — HTTP response builders
# ─────────────────────────────────────────────────────────────────────────────
def _response(status_code: int, body: dict, headers: dict = None) -> dict:
    """Build an API Gateway-compatible Lambda response."""
    default_headers = {
        "Content-Type":                "application/json",
        "Access-Control-Allow-Origin": "*",          # CORS — tighten in production
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    }
    if headers:
        default_headers.update(headers)
    return {
        "statusCode": status_code,
        "headers":    default_headers,
        "body":       json.dumps(body, default=str),
    }


def _ok(body: dict)           -> dict: return _response(200, body)
def _created(body: dict)      -> dict: return _response(201, body)
def _bad(msg: str)            -> dict: return _response(400, {"error": msg})
def _unauthorized(msg: str)   -> dict: return _response(401, {"error": msg})
def _not_found(msg: str)      -> dict: return _response(404, {"error": msg})
def _server_error(msg: str)   -> dict: return _response(500, {"error": msg})


# ─────────────────────────────────────────────────────────────────────────────
# Helpers — JWT
# ─────────────────────────────────────────────────────────────────────────────
def _decode_jwt(event: dict) -> dict | None:
    """
    Extract and verify the JWT from the Authorization header.
    Returns the payload dict on success, or None on failure.
    """
    headers = event.get("headers") or {}
    # API Gateway lowercases header keys
    auth = headers.get("authorization") or headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth.split(" ", 1)[1]
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.DecodeError:
        return None


def _require_auth(event: dict):
    """
    Returns (payload, None) if token valid, or (None, error_response) if not.
    Usage:  payload, err = _require_auth(event); if err: return err
    """
    payload = _decode_jwt(event)
    if payload is None:
        return None, _unauthorized("Authentication required or token expired.")
    return payload, None


# ─────────────────────────────────────────────────────────────────────────────
# Helpers — request body / query params
# ─────────────────────────────────────────────────────────────────────────────
def _body(event: dict) -> dict:
    """Parse the JSON request body safely."""
    raw = event.get("body") or "{}"
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return raw


def _qp(event: dict) -> dict:
    """Return query string parameters dict (never None)."""
    return event.get("queryStringParameters") or {}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers — task serializer
# ─────────────────────────────────────────────────────────────────────────────
def _serialize_task(task: dict) -> dict:
    """Convert a raw MongoDB task document to a JSON-safe dict."""
    due = None
    if task.get("due_date"):
        due_dt = task["due_date"]
        if isinstance(due_dt, datetime):
            due = due_dt.strftime("%Y-%m-%d")
        else:
            due = str(due_dt)

    created = task.get("created_at")
    updated = task.get("updated_at")
    return {
        "_id":         str(task["_id"]),
        "title":       task.get("title", ""),
        "description": task.get("description", ""),
        "status":      task.get("status", "pending"),
        "priority":    task.get("priority", "medium"),
        "due_date":    due,
        "user_id":     task.get("user_id", ""),
        "file_key":    task.get("file_key"),  # ← NEW
        "created_at":  created.isoformat() if isinstance(created, datetime) else None,
        "updated_at":  updated.isoformat() if isinstance(updated, datetime) else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# S3 Client
# ─────────────────────────────────────────────────────────────────────────────
def _get_s3():
    """Return a boto3 S3 client. Uses the Lambda execution role automatically."""
    return boto3.client("s3", region_name=S3_REGION)


# =============================================================================
# 🏥  HEALTH CHECK   GET /health
# =============================================================================
def handle_health(_event, _ctx):
    return _ok({"status": "healthy", "service": "task-manager-lambda"})


# =============================================================================
# 👤  AUTH — REGISTER   POST /auth/register
# =============================================================================
def handle_register(event, _ctx):
    """
    Register a new user.
    Body: { "name": "...", "email": "...", "password": "..." }
    """
    data     = _body(event)
    name     = data.get("name", "").strip()
    email    = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not name or not email or not password:
        return _bad("All fields (name, email, password) are required.")

    db    = get_db()
    users = db["users"]

    if users.find_one({"email": email}):
        return _bad("This email is already registered.")

    role     = data.get("role", "user")
    if role not in ("admin", "user"):
        role = "user"

    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    users.insert_one({
        "name":       name,
        "email":      email,
        "password":   hashed,
        "role":       role,
        "created_at": datetime.now(timezone.utc),
    })
    return _created({"message": "User registered successfully! You can now log in."})


# =============================================================================
# 🔐  AUTH — LOGIN   POST /auth/login
# =============================================================================
def handle_login(event, _ctx):
    """
    Authenticate user and return JWT access token.
    Body: { "email": "...", "password": "..." }
    Response: { "access": "<jwt>", "user": {...} }
    """
    data     = _body(event)
    email    = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return _bad("Email and password are required.")

    db   = get_db()
    user = db["users"].find_one({"email": email})

    if not user:
        return _unauthorized("Invalid email or password.")

    stored_hash = user["password"]
    if isinstance(stored_hash, str):
        stored_hash = stored_hash.encode("utf-8")

    if not bcrypt.checkpw(password.encode("utf-8"), stored_hash):
        return _unauthorized("Invalid email or password.")

    now = datetime.now(timezone.utc)
    payload = {
        "user_id": str(user["_id"]),
        "email":   user["email"],
        "role":    user.get("role", "user"),
        "exp":     now + timedelta(hours=24),
        "iat":     now,
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")

    # Log activity
    db["activity_logs"].insert_one({
        "user_id":   str(user["_id"]),
        "action":    "login",
        "timestamp": now,
    })

    return _ok({
        "message": "Login successful",
        "access":  token,
        "user": {
            "id":    str(user["_id"]),
            "name":  user.get("name", ""),
            "email": user["email"],
            "role":  user.get("role", "user"),
        },
    })


# =============================================================================
# 📋  TASKS — GET ALL   GET /tasks
# =============================================================================
def handle_get_tasks(event, _ctx):
    """Return all tasks for the authenticated user, newest first."""
    payload, err = _require_auth(event)
    if err:
        return err

    user_id = payload["user_id"]
    db      = get_db()
    tasks   = list(db["tasks"].find({"user_id": user_id}).sort("created_at", -1))
    return _ok([_serialize_task(t) for t in tasks])


# =============================================================================
# 📋  TASKS — CREATE   POST /tasks/create
# =============================================================================
def handle_create_task(event, _ctx):
    """
    Create a new task.
    Body: { "title": "...", "description": "...", "status": "pending",
            "priority": "medium", "due_date": "YYYY-MM-DD" }
    """
    payload, err = _require_auth(event)
    if err:
        return err

    data  = _body(event)
    title = data.get("title", "").strip()
    if not title:
        return _bad("Task title is required.")

    # Validate enums
    status   = data.get("status", "pending")
    priority = data.get("priority", "medium")
    if status not in ("pending", "in_progress", "completed"):
        return _bad("status must be one of: pending, in_progress, completed")
    if priority not in ("low", "medium", "high"):
        return _bad("priority must be one of: low, medium, high")

    # Parse optional due_date
    due_date = None
    raw_due  = data.get("due_date")
    if raw_due:
        try:
            due_date = datetime.strptime(raw_due, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            return _bad("Invalid due_date format. Use YYYY-MM-DD")

    user_id = payload["user_id"]
    # Allow admins to assign tasks to other users
    target_user_id = data.get("user_id", user_id)
    if target_user_id != user_id and payload.get("role") != "admin":
        return _response(403, {"error": "Admin access required to assign tasks to other users"})

    now  = datetime.now(timezone.utc)
    doc  = {
        "title":       title,
        "description": data.get("description", ""),
        "status":      status,
        "priority":    priority,
        "due_date":    due_date,
        "user_id":     target_user_id,
        "file_key":    data.get("file_key"),   # ← NEW
        "created_at":  now,
        "updated_at":  now,
    }

    result = get_db()["tasks"].insert_one(doc)
    return _created({"message": "Task created successfully", "id": str(result.inserted_id)})


# =============================================================================
# 📋  TASKS — UPDATE   PUT /tasks/update/{task_id}
# =============================================================================
def handle_update_task(event, _ctx, task_id: str):
    """
    Update fields of an existing task.
    Body: any subset of { title, description, status, priority, due_date }
    """
    payload, err = _require_auth(event)
    if err:
        return err

    # Validate ObjectId
    try:
        oid = ObjectId(task_id)
    except Exception:
        return _bad("Invalid task ID format.")

    user_id = payload["user_id"]
    db      = get_db()
    task    = db["tasks"].find_one({"_id": oid, "user_id": user_id})
    if not task:
        return _not_found("Task not found or access denied.")

    data    = _body(event)
    updates = {}

    if "title" in data:
        updates["title"] = data["title"]
    if "description" in data:
        updates["description"] = data["description"]
    if "status" in data:
        if data["status"] not in ("pending", "in_progress", "completed"):
            return _bad("status must be one of: pending, in_progress, completed")
        updates["status"] = data["status"]
    if "priority" in data:
        if data["priority"] not in ("low", "medium", "high"):
            return _bad("priority must be one of: low, medium, high")
        updates["priority"] = data["priority"]
    if "due_date" in data:
        raw_due = data["due_date"]
        if raw_due:
            try:
                updates["due_date"] = datetime.strptime(raw_due, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except ValueError:
                return _bad("Invalid due_date format. Use YYYY-MM-DD")
        else:
            updates["due_date"] = None
    
    if "file_key" in data:
        updates["file_key"] = data["file_key"]

    updates["updated_at"] = datetime.now(timezone.utc)
    db["tasks"].update_one({"_id": oid}, {"$set": updates})
    return _ok({"message": "Task updated successfully"})


# =============================================================================
# 📋  TASKS — DELETE   DELETE /tasks/delete/{task_id}
# =============================================================================
def handle_delete_task(event, _ctx, task_id: str):
    """Delete a task that belongs to the authenticated user."""
    payload, err = _require_auth(event)
    if err:
        return err

    try:
        oid = ObjectId(task_id)
    except Exception:
        return _bad("Invalid task ID format.")

    user_id = payload["user_id"]
    db      = get_db()
    task    = db["tasks"].find_one({"_id": oid, "user_id": user_id})
    if not task:
        return _not_found("Task not found or access denied.")

    db["tasks"].delete_one({"_id": oid})
    return _ok({"message": "Task deleted successfully"})


# =============================================================================
# 📊  ANALYTICS — STATUS   GET /analytics/status
# =============================================================================
def handle_analytics_status(event, _ctx):
    """Returns task count grouped by status (pending / in_progress / completed)."""
    payload, err = _require_auth(event)
    if err:
        return err

    user_id = payload["user_id"]
    tasks   = get_db()["tasks"]
    data    = {
        "pending":     tasks.count_documents({"user_id": user_id, "status": "pending"}),
        "in_progress": tasks.count_documents({"user_id": user_id, "status": "in_progress"}),
        "completed":   tasks.count_documents({"user_id": user_id, "status": "completed"}),
    }
    return _ok(data)


# =============================================================================
# 📊  ANALYTICS — PRIORITY   GET /analytics/priority
# =============================================================================
def handle_analytics_priority(event, _ctx):
    """Returns task count grouped by priority (low / medium / high)."""
    payload, err = _require_auth(event)
    if err:
        return err

    user_id = payload["user_id"]
    tasks   = get_db()["tasks"]
    data    = {
        "low":    tasks.count_documents({"user_id": user_id, "priority": "low"}),
        "medium": tasks.count_documents({"user_id": user_id, "priority": "medium"}),
        "high":   tasks.count_documents({"user_id": user_id, "priority": "high"}),
    }
    return _ok(data)


# =============================================================================
# 📊  ANALYTICS — DATE TREND   GET /analytics/date
# =============================================================================
def handle_analytics_date(event, _ctx):
    """Returns tasks created per day for the last 7 days."""
    payload, err = _require_auth(event)
    if err:
        return err

    user_id    = payload["user_id"]
    end_date   = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=6)

    tasks = get_db()["tasks"].find({
        "user_id":    user_id,
        "created_at": {"$gte": start_date},
    })

    # Initialise all 7 days to 0
    counts = {}
    for i in range(7):
        day = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
        counts[day] = 0

    for task in tasks:
        ca = task.get("created_at")
        if isinstance(ca, datetime):
            day = ca.strftime("%Y-%m-%d")
            if day in counts:
                counts[day] += 1

    result = [{"date": k, "count": v} for k, v in sorted(counts.items())]
    return _ok(result)


# =============================================================================
# 📊  ANALYTICS — OVERDUE   GET /analytics/overdue
# =============================================================================
def handle_analytics_overdue(event, _ctx):
    """Returns overdue task counts grouped by priority."""
    payload, err = _require_auth(event)
    if err:
        return err

    user_id = payload["user_id"]
    now     = datetime.now(timezone.utc)
    tasks   = get_db()["tasks"]

    base_filter = {
        "user_id":  user_id,
        "due_date": {"$lt": now, "$ne": None},
        "status":   {"$ne": "completed"},
    }

    data  = [
        {"name": "Low",    "overdue": tasks.count_documents({**base_filter, "priority": "low"})},
        {"name": "Medium", "overdue": tasks.count_documents({**base_filter, "priority": "medium"})},
        {"name": "High",   "overdue": tasks.count_documents({**base_filter, "priority": "high"})},
    ]
    total = sum(d["overdue"] for d in data)
    return _ok({"data": data, "total": total})


# =============================================================================
# 📊  ANALYTICS — FILTERED   GET /analytics/filtered
# =============================================================================
def handle_analytics_filtered(event, _ctx):
    """
    Returns filtered tasks.
    Query params: date_from, date_to (YYYY-MM-DD), priority, status
    """
    payload, err = _require_auth(event)
    if err:
        return err

    user_id = payload["user_id"]
    qp      = _qp(event)

    mongo_filter = {"user_id": user_id}

    # Date range
    date_from = qp.get("date_from")
    date_to   = qp.get("date_to")
    if date_from or date_to:
        ca_filter = {}
        if date_from:
            try:
                ca_filter["$gte"] = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except ValueError:
                pass
        if date_to:
            try:
                ca_filter["$lt"] = (
                    datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                    + timedelta(days=1)
                )
            except ValueError:
                pass
        if ca_filter:
            mongo_filter["created_at"] = ca_filter

    # Priority filter
    priority = qp.get("priority")
    if priority in ("low", "medium", "high"):
        mongo_filter["priority"] = priority

    # Status filter
    status = qp.get("status")
    if status in ("pending", "in_progress", "completed"):
        mongo_filter["status"] = status

    tasks = list(get_db()["tasks"].find(mongo_filter).sort("created_at", -1))
    return _ok([_serialize_task(t) for t in tasks])


# =============================================================================
# ☁️  S3 — PRE-SIGNED UPLOAD URL   POST /s3/presign-upload
# =============================================================================
def handle_s3_presign_upload(event, _ctx):
    """
    Generate a pre-signed S3 PUT URL for direct client upload.
    Body: { "filename": "report.pdf", "content_type": "application/pdf" }
    Response: { "upload_url": "https://...", "key": "uploads/<user_id>/report.pdf" }
    """
    payload, err = _require_auth(event)
    if err:
        return err

    if not S3_BUCKET:
        return _server_error("AWS_S3_BUCKET environment variable is not configured.")

    data         = _body(event)
    filename     = data.get("filename", "").strip()
    content_type = data.get("content_type", "application/octet-stream")

    if not filename:
        return _bad("filename is required.")

    user_id = payload["user_id"]
    s3_key  = f"uploads/{user_id}/{filename}"

    try:
        s3  = _get_s3()
        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket":      S3_BUCKET,
                "Key":         s3_key,
                "ContentType": content_type,
            },
            ExpiresIn=300,   # 5 minutes
        )
        return _ok({"upload_url": url, "key": s3_key})
    except ClientError as e:
        logger.error("S3 presign-upload error: %s", e)
        return _server_error(str(e))


# =============================================================================
# ☁️  S3 — PRE-SIGNED DOWNLOAD URL   GET /s3/presign-download
# =============================================================================
def handle_s3_presign_download(event, _ctx):
    """
    Generate a pre-signed S3 GET URL for direct client download.
    Query param: ?key=uploads/<user_id>/report.pdf
    Response: { "download_url": "https://..." }
    """
    payload, err = _require_auth(event)
    if err:
        return err

    if not S3_BUCKET:
        return _server_error("AWS_S3_BUCKET environment variable is not configured.")

    s3_key = _qp(event).get("key", "").strip()
    if not s3_key:
        return _bad("key query parameter is required.")

    try:
        s3  = _get_s3()
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET, "Key": s3_key},
            ExpiresIn=3600,   # 1 hour
        )
        return _ok({"download_url": url})
    except ClientError as e:
        logger.error("S3 presign-download error: %s", e)
        return _server_error(str(e))


# =============================================================================
# 🛡️  ADMIN — ALL TASKS   GET /admin/tasks
# =============================================================================
def handle_admin_get_tasks(event, _ctx):
    payload, err = _require_auth(event)
    if err: return err
    if payload.get("role") != "admin": return _response(403, {"error": "Admin access required."})

    db    = get_db()
    tasks = list(db["tasks"].find().sort("created_at", -1))
    return _ok([_serialize_task(t) for t in tasks])


# =============================================================================
# 🛡️  ADMIN — DELETE TASK   DELETE /admin/tasks/delete/{task_id}
# =============================================================================
def handle_admin_delete_task(event, _ctx, task_id: str):
    payload, err = _require_auth(event)
    if err: return err
    if payload.get("role") != "admin": return _response(403, {"error": "Admin access required."})

    try:
        oid = ObjectId(task_id)
        get_db()["tasks"].delete_one({"_id": oid})
        return _ok({"message": "Task deleted by admin"})
    except Exception:
        return _bad("Invalid task ID format")


# =============================================================================
# 🛡️  ADMIN — ALL USERS   GET /admin/users
# =============================================================================
def handle_admin_get_users(event, _ctx):
    payload, err = _require_auth(event)
    if err: return err
    if payload.get("role") != "admin": return _response(403, {"error": "Admin access required."})

    db    = get_db()
    users = list(db["users"].find().sort("created_at", -1))
    result = []
    for u in users:
        result.append({
            "id":         str(u["_id"]),
            "name":       u.get("name", ""),
            "email":      u.get("email", ""),
            "role":       u.get("role", "user"),
            "created_at": u.get("created_at").isoformat() if isinstance(u.get("created_at"), datetime) else None,
        })
    return _ok(result)


# =============================================================================
# 🛡️  ADMIN — DELETE USER   DELETE /admin/users/delete/{user_id}
# =============================================================================
def handle_admin_delete_user(event, _ctx, user_id: str):
    payload, err = _require_auth(event)
    if err: return err
    if payload.get("role") != "admin": return _response(403, {"error": "Admin access required."})

    try:
        oid = ObjectId(user_id)
        db  = get_db()
        # Delete user's tasks first
        db["tasks"].delete_many({"user_id": user_id})
        # Delete user
        db["users"].delete_one({"_id": oid})
        return _ok({"message": "User and their tasks deleted by admin"})
    except Exception:
        return _bad("Invalid user ID format")


# =============================================================================
# 🚦  MAIN ROUTER — This is the Lambda entry point
# =============================================================================
def lambda_handler(event, context):
    """
    AWS Lambda entry point.
    Routes incoming API Gateway events to the correct handler function.

    API Gateway proxy integration passes:
      event["httpMethod"]  → GET / POST / PUT / DELETE / OPTIONS
      event["path"]        → /tasks, /auth/login, etc.
      event["body"]        → JSON string
      event["headers"]     → HTTP headers (lowercased by API Gateway v1)
      event["queryStringParameters"] → query params dict
    """
   

    # method = (event.get("httpMethod") or "GET").upper()

    # path = (
    #     event.get("rawPath")
    #     or event.get("path")
    #     or "/"
    # ).rstrip("/")

    # Detect HTTP method (supports HTTP API v2 and REST API v1)
    if "requestContext" in event and "http" in event["requestContext"]:
        method = event["requestContext"]["http"]["method"]
        path = event.get("rawPath", "/")
    else:
         method = event.get("httpMethod", "GET")
         path = event.get("path", "/")

    method = method.upper()
    path = path.rstrip("/")

    logger.info("Request: %s %s", method, path)

    # ── CORS pre-flight ──────────────────────────────────────────────────────
    if method == "OPTIONS":
        return _response(200, {"message": "OK"})

    # ── Health ───────────────────────────────────────────────────────────────
    if path in ("/health", "/api/health") and method == "GET":
        return handle_health(event, context)

    # ── Auth ─────────────────────────────────────────────────────────────────
    if path in ("/auth/register", "/api/auth/register") and method == "POST":
        return handle_register(event, context)

    if path in ("/auth/login", "/api/auth/login") and method == "POST":
        return handle_login(event, context)

    # ── Tasks ────────────────────────────────────────────────────────────────
    if path in ("/tasks", "/api/tasks") and method == "GET":
        return handle_get_tasks(event, context)

    if path in ("/tasks/create", "/api/tasks/create") and method == "POST":
        return handle_create_task(event, context)

    # PUT /tasks/update/{task_id}
    update_match = re.match(r"^(?:/api)?/tasks/update/([^/]+)$", path)
    if update_match and method == "PUT":
        return handle_update_task(event, context, update_match.group(1))

    # DELETE /tasks/delete/{task_id}
    delete_match = re.match(r"^(?:/api)?/tasks/delete/([^/]+)$", path)
    if delete_match and method == "DELETE":
        return handle_delete_task(event, context, delete_match.group(1))

    # ── Analytics ────────────────────────────────────────────────────────────
    if path in ("/analytics/status", "/api/analytics/status") and method == "GET":
        return handle_analytics_status(event, context)

    if path in ("/analytics/priority", "/api/analytics/priority") and method == "GET":
        return handle_analytics_priority(event, context)

    if path in ("/analytics/date", "/api/analytics/date") and method == "GET":
        return handle_analytics_date(event, context)

    if path in ("/analytics/overdue", "/api/analytics/overdue") and method == "GET":
        return handle_analytics_overdue(event, context)

    if path in ("/analytics/filtered", "/api/analytics/filtered") and method == "GET":
        return handle_analytics_filtered(event, context)

    # ── S3 Pre-signed URLs ───────────────────────────────────────────────────
    if path in ("/s3/presign-upload", "/api/s3/presign-upload") and method == "POST":
        return handle_s3_presign_upload(event, context)

    if path in ("/s3/presign-download", "/api/s3/presign-download") and method == "GET":
        return handle_s3_presign_download(event, context)

    # ── Admin ────────────────────────────────────────────────────────────────
    if path in ("/admin/tasks", "/api/admin/tasks") and method == "GET":
        return handle_admin_get_tasks(event, context)

    if path in ("/admin/users", "/api/admin/users") and method == "GET":
        return handle_admin_get_users(event, context)

    # DELETE /admin/tasks/delete/{id}
    adm_task_del = re.match(r"^(?:/api)?/admin/tasks/delete/([^/]+)$", path)
    if adm_task_del and method == "DELETE":
        return handle_admin_delete_task(event, context, adm_task_del.group(1))

    # DELETE /admin/users/delete/{id}
    adm_user_del = re.match(r"^(?:/api)?/admin/users/delete/([^/]+)$", path)
    if adm_user_del and method == "DELETE":
        return handle_admin_delete_user(event, context, adm_user_del.group(1))

    # ── 404 fallback ─────────────────────────────────────────────────────────
    return _response(404, {"error": f"Route not found: {method} {path}"})
