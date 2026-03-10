"""
Task Manager Views — Using MongoEngine ORM
============================================
All database operations go through the ORM models defined in models.py.

WHERE ORM IS USED IN THIS FILE:
--------------------------------
  register_user  → UserDocument.objects(email=...).first()  /  user.save()
  login_user     → UserDocument.objects(email=...).first()
  create_task    → TaskDocument(...).save()
  get_tasks      → TaskDocument.objects(user_id=...).order_by(...)
  update_task    → TaskDocument.objects(id=..., user_id=...).first() + .save()
  delete_task    → TaskDocument.objects(id=..., user_id=...).first() + .delete()
  ActivityLog    → ActivityLog(...).save()

NEW FEATURES:
  ✅ S3 presigned upload URL   → /api/s3/presign-upload/
  ✅ S3 presigned download URL → /api/s3/presign-download/
  ✅ Analytics by date         → /api/analytics/date/
  ✅ JWT token auth via simplejwt + custom JWTAuthentication
"""

from rest_framework.decorators import api_view, authentication_classes
from rest_framework.response import Response
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from datetime import datetime, timedelta, timezone
from django.conf import settings
import bcrypt
import jwt
import mongoengine as me
import boto3
from botocore.exceptions import ClientError

# ── ORM Models (MongoEngine) ──────────────────────────────────────────────────
from .models import UserDocument, TaskDocument, ActivityLog

# ── MongoDB connection bootstrap (registers MongoEngine connection on import) ─
from . import mongodb  # noqa: F401  — side-effect import


# ─────────────────────────────────────────────────────────────────────────────
# 🏥 HEALTH CHECK
# ─────────────────────────────────────────────────────────────────────────────
@api_view(["GET"])
def health_check(request):
    """
    Simple health check endpoint for Docker/Kubernetes.
    Returns 200 OK if the app is running.
    """
    return Response({"status": "healthy"}, status=200)


# ─────────────────────────────────────────────────────────────────────────────
# 🔐 CUSTOM JWT AUTHENTICATION
# ─────────────────────────────────────────────────────────────────────────────
class JWTAuthentication(BaseAuthentication):
    """
    Validates JWT tokens from the Authorization header.
    Expected format: 'Bearer <token>'
    """
    def authenticate(self, request):
        auth_header = request.headers.get("Authorization")

        if not auth_header:
            raise AuthenticationFailed("Authentication credentials were not provided.")

        if not auth_header.startswith("Bearer "):
            raise AuthenticationFailed("Invalid authorization header format. Use 'Bearer <token>'")

        try:
            token   = auth_header.split(" ")[1]
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            raise AuthenticationFailed("Your session has expired. Please log in again.")
        except jwt.DecodeError:
            raise AuthenticationFailed("Invalid authentication token.")
        except Exception as e:
            raise AuthenticationFailed(f"Authentication error: {str(e)}")

        return (payload, None)


# ─────────────────────────────────────────────────────────────────────────────
# 🛠  HELPER: serialize a TaskDocument → plain dict for JSON response
# ─────────────────────────────────────────────────────────────────────────────
def _serialize_task(task: TaskDocument) -> dict:
    """Convert a MongoEngine TaskDocument to a JSON-serializable dict."""
    due = None
    if task.due_date:
        due = task.due_date.strftime("%Y-%m-%d")

    return {
        "_id":         str(task.id),
        "title":       task.title,
        "description": task.description or "",
        "status":      task.status,
        "priority":    task.priority,
        "due_date":    due,
        "user_id":     task.user_id,
        "file_key":    task.file_key,   # ← NEW
        "created_at":  task.created_at.isoformat() if task.created_at else None,
        "updated_at":  task.updated_at.isoformat() if task.updated_at else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 👤 USER AUTHENTICATION
# ─────────────────────────────────────────────────────────────────────────────

@api_view(["POST"])
def register_user(request):
    """
    Register a new user with an encrypted password.
    ORM: UserDocument.objects(email=...).first()  →  user.save()

    Password is hashed with bcrypt and stored as a decoded UTF-8 string
    (StringField in the ORM model).
    """
    name     = request.data.get("name")
    email    = request.data.get("email")
    password = request.data.get("password")

    if not name or not email or not password:
        return Response({"error": "All fields (name, email, password) are required"}, status=400)

    # ── ORM query: check duplicate email ─────────────────────────────────────
    if UserDocument.objects(email=email).first():
        return Response({"error": "This email is already registered"}, status=400)

    # Hash password — decode bytes → str so it fits StringField
    hashed_bytes  = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    hashed_str    = hashed_bytes.decode("utf-8")   # ✅ FIX: store as str

    role     = request.data.get("role", "user")
    if role not in ("admin", "user"):
        role = "user"

    # ── ORM insert ───────────────────────────────────────────────────────────
    user = UserDocument(
        name=name,
        email=email,
        password=hashed_str,
        role=role,
        created_at=datetime.now(timezone.utc),
    )
    user.save()

    return Response({"message": "User registered successfully! You can now log in."}, status=201)


@api_view(["POST"])
def login_user(request):
    """
    Authenticate user and return JWT token.
    ORM: UserDocument.objects(email=...).first()
    """
    email    = request.data.get("email")
    password = request.data.get("password")

    if not email or not password:
        return Response({"error": "Email and password are required"}, status=400)

    # ── ORM query ─────────────────────────────────────────────────────────────
    user = UserDocument.objects(email=email).first()

    if not user:
        return Response({"error": "Invalid email or password"}, status=401)

    # ✅ FIX: encode stored str back to bytes before bcrypt comparison
    stored_hash = user.password.encode("utf-8") if isinstance(user.password, str) else user.password
    if not bcrypt.checkpw(password.encode("utf-8"), stored_hash):
        return Response({"error": "Invalid email or password"}, status=401)

    # Generate JWT
    payload = {
        "user_id": str(user.id),
        "email":   user.email,
        "role":    user.role,
        "exp":     datetime.now(timezone.utc) + timedelta(hours=24),
        "iat":     datetime.now(timezone.utc),
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

    # ── ORM insert: log the login activity ────────────────────────────────────
    ActivityLog(
        user_id=str(user.id),
        action="login",
        timestamp=datetime.now(timezone.utc),
    ).save()

    return Response({
        "message": "Login successful",
        "access":  token,
        "user": {
            "id":    str(user.id),
            "name":  user.name,
            "email": user.email,
            "role":  user.role,
        },
    })


# ─────────────────────────────────────────────────────────────────────────────
# 📋 TASK MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────

@api_view(["POST"])
@authentication_classes([JWTAuthentication])
def create_task(request):
    """
    Create a new task for the authenticated user.
    ORM: TaskDocument(...).save()
    Accepts optional 'due_date' in YYYY-MM-DD format.
    """
    if not isinstance(request.user, dict):
        return Response({"error": "Authentication required"}, status=401)

    user_id = request.user.get("user_id")
    # Allow admins to assign tasks to other users
    target_user_id = request.data.get("user_id", user_id)
    
    if target_user_id != user_id and request.user.get("role") != "admin":
        return Response({"error": "Admin access required to assign tasks to other users"}, status=403)
    
    title   = request.data.get("title")

    if not title:
        return Response({"error": "Task title is required"}, status=400)

    # Parse optional due_date
    due_date = None
    raw_due  = request.data.get("due_date")
    if raw_due:
        try:
            due_date = datetime.strptime(raw_due, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            return Response({"error": "Invalid due_date format. Use YYYY-MM-DD"}, status=400)

    now = datetime.now(timezone.utc)

    # ── ORM insert ───────────────────────────────────────────────────────────
    task = TaskDocument(
        title=title,
        description=request.data.get("description", ""),
        status=request.data.get("status", "pending"),
        priority=request.data.get("priority", "medium"),
        due_date=due_date,
        user_id=target_user_id,
        file_key=request.data.get("file_key"),   # ← NEW: attach file key if uploaded to S3
        created_at=now,
        updated_at=now,
    )

    try:
        task.save()
    except me.ValidationError as e:
        return Response({"error": f"Validation error: {str(e)}"}, status=400)

    return Response({
        "message": "Task created successfully",
        "id":      str(task.id),
    }, status=201)


@api_view(["GET"])
@authentication_classes([JWTAuthentication])
def get_tasks(request):
    """
    Fetch all tasks for the currently logged-in user.
    ORM: TaskDocument.objects(user_id=...).order_by('-created_at')
    """
    if not isinstance(request.user, dict):
        return Response({"error": "Authentication required"}, status=401)

    user_id = request.user.get("user_id")
    role    = request.user.get("role")

    # ── ORM query: Admin sees all, User sees own ─────────────────────────────
    if role == "admin":
        tasks = TaskDocument.objects().order_by("-created_at")
    else:
        tasks = TaskDocument.objects(user_id=user_id).order_by("-created_at")

    return Response([_serialize_task(t) for t in tasks])


@api_view(["PUT"])
@authentication_classes([JWTAuthentication])
def update_task(request, task_id):
    """
    Update an existing task if it belongs to the user.
    ORM: TaskDocument.objects(id=..., user_id=...).first()  →  task.save()
    """
    if not isinstance(request.user, dict):
        return Response({"error": "Authentication required"}, status=401)

    user_id = request.user.get("user_id")
    role    = request.user.get("role")

    # ── ORM query with ownership check (Admins can bypass) ────────────────────
    try:
        if role == "admin":
            task = TaskDocument.objects(id=task_id).first()
        else:
            task = TaskDocument.objects(id=task_id, user_id=user_id).first()
    except (me.ValidationError, me.InvalidQueryError, Exception):
        return Response({"error": "Invalid task ID format"}, status=400)

    if not task:
        return Response({"error": "Task not found or access denied"}, status=404)

    # Update only provided fields
    if "title" in request.data:
        task.title = request.data["title"]
    if "description" in request.data:
        task.description = request.data["description"]
    if "status" in request.data:
        task.status = request.data["status"]
    if "priority" in request.data:
        task.priority = request.data["priority"]

    # Parse optional due_date update
    if "due_date" in request.data:
        raw_due = request.data["due_date"]
        if raw_due:
            try:
                task.due_date = datetime.strptime(raw_due, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except ValueError:
                return Response({"error": "Invalid due_date format. Use YYYY-MM-DD"}, status=400)
        else:
            task.due_date = None   # allow clearing the due date

    if "file_key" in request.data:
        task.file_key = request.data["file_key"]

    task.updated_at = datetime.now(timezone.utc)

    try:
        task.save()
    except me.ValidationError as e:
        return Response({"error": f"Validation error: {str(e)}"}, status=400)

    return Response({"message": "Task updated successfully"})


@api_view(["DELETE"])
@authentication_classes([JWTAuthentication])
def delete_task(request, task_id):
    """
    Delete a task if it belongs to the user.
    ORM: TaskDocument.objects(id=..., user_id=...).first()  →  task.delete()
    """
    if not isinstance(request.user, dict):
        return Response({"error": "Authentication required"}, status=401)

    user_id = request.user.get("user_id")
    role    = request.user.get("role")

    # ── ORM query with ownership check (Admins can bypass) ────────────────────
    try:
        if role == "admin":
            task = TaskDocument.objects(id=task_id).first()
        else:
            task = TaskDocument.objects(id=task_id, user_id=user_id).first()
    except (me.ValidationError, me.InvalidQueryError, Exception):
        return Response({"error": "Invalid task ID format"}, status=400)

    if not task:
        return Response({"error": "Task not found or access denied"}, status=404)

    task.delete()

    return Response({"message": "Task deleted successfully"})


# ─────────────────────────────────────────────────────────────────────────────
# 📊 ANALYTICS ENDPOINTS (Dashboard data)
# ─────────────────────────────────────────────────────────────────────────────

@api_view(["GET"])
@authentication_classes([JWTAuthentication])
def task_overdue_analytics(request):
    """
    Returns overdue task counts grouped by priority.
    Overdue = due_date is set, due_date < now, and status != 'completed'.
    Used for: Overdue Tasks Bar Chart on Analytics page.
    """
    if not isinstance(request.user, dict):
        return Response({"error": "Authentication required"}, status=401)

    user_id = request.user.get("user_id")
    role    = request.user.get("role")
    now = datetime.now(timezone.utc)

    # ── ORM query: Admins see global data, Users see their own ─────────────
    if role == "admin":
        overdue_tasks = TaskDocument.objects(
            due_date__lt=now,
            due_date__ne=None,
            status__ne="completed"
        )
    else:
        overdue_tasks = TaskDocument.objects(
            user_id=user_id,
            due_date__lt=now,
            due_date__ne=None,
            status__ne="completed"
        )

    data = [
        {"name": "Low",    "overdue": overdue_tasks.filter(priority="low").count()},
        {"name": "Medium", "overdue": overdue_tasks.filter(priority="medium").count()},
        {"name": "High",   "overdue": overdue_tasks.filter(priority="high").count()},
    ]
    total = sum(d["overdue"] for d in data)
    return Response({"data": data, "total": total})


@api_view(["GET"])
@authentication_classes([JWTAuthentication])
def task_filtered_analytics(request):
    """
    Returns filtered tasks supporting:
      - date_from / date_to  (YYYY-MM-DD)  — filters on created_at
      - priority             (low/medium/high)
      - status               (pending/in_progress/completed)
    Used for: Advanced Filter panel + CSV Export on Analytics page.
    """
    if not isinstance(request.user, dict):
        return Response({"error": "Authentication required"}, status=401)

    user_id = request.user.get("user_id")
    role    = request.user.get("role")

    if role == "admin":
        qs = TaskDocument.objects()
    else:
        qs = TaskDocument.objects(user_id=user_id)

    # Date range filter
    date_from = request.query_params.get("date_from")
    date_to   = request.query_params.get("date_to")
    if date_from:
        try:
            df = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            qs = qs.filter(created_at__gte=df)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
            qs = qs.filter(created_at__lt=dt)
        except ValueError:
            pass

    # Priority filter
    priority = request.query_params.get("priority")
    if priority and priority in ("low", "medium", "high"):
        qs = qs.filter(priority=priority)

    # Status filter
    status = request.query_params.get("status")
    if status and status in ("pending", "in_progress", "completed"):
        qs = qs.filter(status=status)

    return Response([_serialize_task(t) for t in qs.order_by("-created_at")])


@api_view(["GET"])
@authentication_classes([JWTAuthentication])
def task_status_analytics(request):
    """
    Returns task count grouped by status.
    Used for: Status Distribution Pie/Bar Chart on Dashboard.
    """
    if not isinstance(request.user, dict):
        return Response({"error": "Authentication required"}, status=401)

    user_id = request.user.get("user_id")
    role    = request.user.get("role")

    if role == "admin":
        tasks = TaskDocument.objects()
    else:
        tasks = TaskDocument.objects(user_id=user_id)

    data = {
        "pending":     tasks.filter(status="pending").count(),
        "in_progress": tasks.filter(status="in_progress").count(),
        "completed":   tasks.filter(status="completed").count(),
    }

    return Response(data)


@api_view(["GET"])
@authentication_classes([JWTAuthentication])
def task_priority_analytics(request):
    """
    Returns task count grouped by priority.
    Used for: Priority Distribution Bar Chart on Dashboard.
    """
    if not isinstance(request.user, dict):
        return Response({"error": "Authentication required"}, status=401)

    user_id = request.user.get("user_id")
    role    = request.user.get("role")

    if role == "admin":
        tasks = TaskDocument.objects()
    else:
        tasks = TaskDocument.objects(user_id=user_id)

    data = {
        "low":    tasks.filter(priority="low").count(),
        "medium": tasks.filter(priority="medium").count(),
        "high":   tasks.filter(priority="high").count(),
    }

    return Response(data)


@api_view(["GET"])
@authentication_classes([JWTAuthentication])
def tasks_by_date_analytics(request):
    """
    Returns task count created per day (last 7 days).
    Used for: Tasks Created Over Time Line Chart on Dashboard.
    """
    if not isinstance(request.user, dict):
        return Response({"error": "Authentication required"}, status=401)

    user_id = request.user.get("user_id")
    role    = request.user.get("role")
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=6)

    if role == "admin":
        tasks = TaskDocument.objects(created_at__gte=start_date)
    else:
        tasks = TaskDocument.objects(user_id=user_id, created_at__gte=start_date)

    # Build a dict with each of the last 7 days initialised to 0
    counts = {}
    for i in range(7):
        day = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
        counts[day] = 0

    for task in tasks:
        if task.created_at:
            day = task.created_at.strftime("%Y-%m-%d")
            if day in counts:
                counts[day] += 1

    # Return as a sorted list for easy charting
    result = [{"date": k, "count": v} for k, v in sorted(counts.items())]
    return Response(result)


# ─────────────────────────────────────────────────────────────────────────────
# ☁️  S3 PRE-SIGNED URL ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

def _get_s3_client():
    """
    Returns a boto3 S3 client.
    Uses IAM Role credentials automatically when running on EC2/Lambda (no keys needed).
    For local dev, set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in environment.
    """
    return boto3.client(
        "s3",
        region_name=getattr(settings, "AWS_S3_REGION", "ap-south-1"),
    )


@api_view(["POST"])
@authentication_classes([JWTAuthentication])
def s3_presign_upload(request):
    """
    Task 4: Generate a pre-signed S3 PUT URL so the client can upload directly.

    POST body:  { "filename": "report.pdf", "content_type": "application/pdf" }
    Response:   { "upload_url": "https://...", "key": "uploads/<user_id>/report.pdf" }

    How it works:
    1. Django generates a pre-signed URL (valid 5 min) pointing to S3.
    2. The React client sends the file directly to S3 using that URL — no file ever
       passes through Django, keeping the server lightweight.
    3. IAM Role on EC2/Lambda grants S3 access — no hard-coded credentials needed.
    """
    if not isinstance(request.user, dict):
        return Response({"error": "Authentication required"}, status=401)

    filename     = request.data.get("filename")
    content_type = request.data.get("content_type", "application/octet-stream")

    if not filename:
        return Response({"error": "filename is required"}, status=400)

    user_id   = request.user.get("user_id")
    bucket    = getattr(settings, "AWS_S3_BUCKET", "")
    s3_key    = f"uploads/{user_id}/{filename}"

    if not bucket:
        return Response({"error": "AWS_S3_BUCKET not configured in settings"}, status=500)

    try:
        s3 = _get_s3_client()
        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket":      bucket,
                "Key":         s3_key,
                "ContentType": content_type,
            },
            ExpiresIn=300,   # 5 minutes
        )
        return Response({"upload_url": url, "key": s3_key})
    except ClientError as e:
        return Response({"error": str(e)}, status=500)


@api_view(["GET"])
@authentication_classes([JWTAuthentication])
def s3_presign_download(request):
    """
    Task 6: Generate a pre-signed S3 GET URL so the client can download a file.

    Query param: ?key=uploads/<user_id>/report.pdf
    Response:    { "download_url": "https://..." }

    Security: The pre-signed URL is valid for 1 hour and is user-specific.
    """
    if not isinstance(request.user, dict):
        return Response({"error": "Authentication required"}, status=401)

    s3_key = request.query_params.get("key")
    if not s3_key:
        return Response({"error": "key query parameter is required"}, status=400)

    bucket = getattr(settings, "AWS_S3_BUCKET", "")
    if not bucket:
        return Response({"error": "AWS_S3_BUCKET not configured in settings"}, status=500)

    try:
        s3 = _get_s3_client()
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": s3_key},
            ExpiresIn=3600,   # 1 hour
        )
        return Response({"download_url": url})
    except ClientError as e:
        return Response({"error": str(e)}, status=500)


# ─────────────────────────────────────────────────────────────────────────────
# 🛡️ ADMIN ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@api_view(["GET"])
@authentication_classes([JWTAuthentication])
def admin_get_all_tasks(request):
    """Admin: Get all tasks across all users."""
    if request.user.get("role") != "admin":
        return Response({"error": "Admin access required"}, status=403)
    
    tasks = TaskDocument.objects.all().order_by("-created_at")
    return Response([_serialize_task(t) for t in tasks])

@api_view(["DELETE"])
@authentication_classes([JWTAuthentication])
def admin_delete_task(request, task_id):
    """Admin: Delete any task."""
    if request.user.get("role") != "admin":
        return Response({"error": "Admin access required"}, status=403)
    
    try:
        task = TaskDocument.objects(id=task_id).first()
        if not task:
            return Response({"error": "Task not found"}, status=404)
        task.delete()
        return Response({"message": "Task deleted by admin"})
    except Exception as e:
        return Response({"error": str(e)}, status=400)

@api_view(["GET"])
@authentication_classes([JWTAuthentication])
def admin_get_all_users(request):
    """Admin: List all registered users."""
    if request.user.get("role") != "admin":
        return Response({"error": "Admin access required"}, status=403)
    
    users = UserDocument.objects.all().order_by("-created_at")
    return Response([{
        "id": str(u.id),
        "name": u.name,
        "email": u.email,
        "role": u.role,
        "created_at": u.created_at.isoformat() if u.created_at else None
    } for u in users])

@api_view(["DELETE"])
@authentication_classes([JWTAuthentication])
def admin_delete_user(request, user_id):
    """Admin: Delete a user and their tasks."""
    if request.user.get("role") != "admin":
        return Response({"error": "Admin access required"}, status=403)
    
    try:
        user = UserDocument.objects(id=user_id).first()
        if not user:
            return Response({"error": "User not found"}, status=404)
        
        # Delete user's tasks too
        TaskDocument.objects(user_id=user_id).delete()
        user.delete()
        return Response({"message": "User and their tasks deleted by admin"})
    except Exception as e:
        return Response({"error": str(e)}, status=400)