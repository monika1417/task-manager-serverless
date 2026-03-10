"""
DAY 4 – Django Unit Tests: API Views
======================================
Tests for register, login, create_task, get_tasks, update_task, delete_task.
Uses mongomock so NO real MongoDB is required.

Run with:
  cd Backend
  python manage.py test tasks.test_views
"""

from rest_framework.test import APITestCase
from rest_framework import status
import mongomock
from mongoengine import connect, disconnect
from .models import UserDocument, TaskDocument
import bcrypt


class TestAuthAPI(APITestCase):
    """API tests for user registration and login endpoints."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        disconnect(alias="default")
        connect("testdb", host="mongodb://localhost",
                mongo_client_class=mongomock.MongoClient, alias="default")

    @classmethod
    def tearDownClass(cls):
        disconnect(alias="default")
        super().tearDownClass()

    def setUp(self):
        """Clean collections before each test."""
        UserDocument.objects.delete()
        TaskDocument.objects.delete()

    # ── Registration ─────────────────────────────────────────────────────

    def test_register_success(self):
        """POST /api/auth/register/ with valid data returns 201."""
        res = self.client.post("/api/auth/register/", {
            "name": "Alice",
            "email": "alice@example.com",
            "password": "secure123"
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn("message", res.data)
        # User should exist in DB
        self.assertIsNotNone(UserDocument.objects(email="alice@example.com").first())

    def test_register_duplicate_email_returns_400(self):
        """Registering with an already-used email returns 400."""
        UserDocument(name="Dup", email="dup@example.com", password="pw").save()
        res = self.client.post("/api/auth/register/", {
            "name": "Dup2",
            "email": "dup@example.com",
            "password": "pw2"
        }, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.data)

    def test_register_missing_name_returns_400(self):
        """Missing name field returns 400."""
        res = self.client.post("/api/auth/register/", {
            "email": "noname@example.com",
            "password": "pw"
        }, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.data)

    def test_register_missing_email_returns_400(self):
        """Missing email field returns 400."""
        res = self.client.post("/api/auth/register/", {
            "name": "NoEmail",
            "password": "pw"
        }, format="json")
        self.assertEqual(res.status_code, 400)

    def test_register_missing_password_returns_400(self):
        """Missing password field returns 400."""
        res = self.client.post("/api/auth/register/", {
            "name": "NoPW",
            "email": "nopw@example.com"
        }, format="json")
        self.assertEqual(res.status_code, 400)

    # ── Login ────────────────────────────────────────────────────────────

    def _create_user(self, name="Test", email="test@example.com", password="pass123"):
        """Helper: create a hashed user in DB."""
        hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        UserDocument(name=name, email=email, password=hashed).save()

    def test_login_success_returns_token(self):
        """POST /api/auth/login/ with correct credentials returns access token."""
        self._create_user(email="login@example.com", password="pass123")
        res = self.client.post("/api/auth/login/", {
            "email": "login@example.com",
            "password": "pass123"
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data)
        self.assertIn("user", res.data)

    def test_login_wrong_password_returns_401(self):
        """Wrong password returns 401."""
        self._create_user(email="wrong@example.com", password="correct")
        res = self.client.post("/api/auth/login/", {
            "email": "wrong@example.com",
            "password": "incorrect"
        }, format="json")
        self.assertEqual(res.status_code, 401)
        self.assertIn("error", res.data)

    def test_login_unknown_email_returns_401(self):
        """Non-existent email returns 401."""
        res = self.client.post("/api/auth/login/", {
            "email": "ghost@example.com",
            "password": "any"
        }, format="json")
        self.assertEqual(res.status_code, 401)

    def test_login_missing_fields_returns_400(self):
        """Login with missing email/password returns 400."""
        res = self.client.post("/api/auth/login/", {"email": "only@example.com"}, format="json")
        self.assertEqual(res.status_code, 400)


class TestTaskAPI(APITestCase):
    """API tests for task CRUD endpoints (require JWT)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        disconnect(alias="default")
        connect("testdb", host="mongodb://localhost",
                mongo_client_class=mongomock.MongoClient, alias="default")

    @classmethod
    def tearDownClass(cls):
        disconnect(alias="default")
        super().tearDownClass()

    def setUp(self):
        """Clear DB and create a fresh authenticated test user."""
        UserDocument.objects.delete()
        TaskDocument.objects.delete()

        # Register + login to get a JWT token
        self.client.post("/api/auth/register/", {
            "name": "TaskTester",
            "email": "tasker@example.com",
            "password": "taskpass123"
        }, format="json")
        login_res = self.client.post("/api/auth/login/", {
            "email": "tasker@example.com",
            "password": "taskpass123"
        }, format="json")
        self.token = login_res.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token}")

    def _post_task(self, **kwargs):
        """Helper: create a task via API."""
        data = {"title": "Default Task", "description": "Default desc", "priority": "medium"}
        data.update(kwargs)
        return self.client.post("/api/tasks/create/", data, format="json")

    # ── Create task ───────────────────────────────────────────────────────

    def test_create_task_success(self):
        """POST /api/tasks/create/ with valid data returns 201."""
        res = self._post_task(title="My Task", priority="high")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", res.data)
        self.assertEqual(TaskDocument.objects.count(), 1)

    def test_create_task_missing_title_returns_400(self):
        """Creating a task without title returns 400."""
        res = self.client.post("/api/tasks/create/", {"description": "no title"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_create_task_with_due_date(self):
        """Task with due_date stores correctly."""
        res = self._post_task(title="Due Task", due_date="2026-12-31")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_create_task_invalid_due_date_returns_400(self):
        """Invalid due_date format returns 400."""
        res = self._post_task(title="Bad Date", due_date="31-12-2026")
        self.assertEqual(res.status_code, 400)

    def test_create_task_without_auth_raises(self):
        """Creating a task without Authorization header raises error."""
        self.client.credentials()  # remove auth
        res = self.client.post("/api/tasks/create/", {"title": "No Auth"}, format="json")
        self.assertIn(res.status_code, [401, 403])

    # ── Get tasks ─────────────────────────────────────────────────────────

    def test_get_tasks_returns_list(self):
        """GET /api/tasks/ returns task list for authenticated user."""
        self._post_task(title="T1")
        self._post_task(title="T2")
        res = self.client.get("/api/tasks/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 2)

    def test_get_tasks_empty_when_no_tasks(self):
        """GET /api/tasks/ returns empty list when no tasks."""
        res = self.client.get("/api/tasks/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 0)

    def test_get_tasks_without_auth_raises(self):
        """GET /api/tasks/ without auth raises 401/403."""
        self.client.credentials()
        res = self.client.get("/api/tasks/")
        self.assertIn(res.status_code, [401, 403])

    # ── Update task ───────────────────────────────────────────────────────

    def test_update_task_success(self):
        """PUT /api/tasks/update/<id>/ updates title and status."""
        create_res = self._post_task(title="Old Title")
        task_id = create_res.data["id"]

        update_res = self.client.put(f"/api/tasks/update/{task_id}/", {
            "title": "New Title",
            "status": "completed"
        }, format="json")
        self.assertEqual(update_res.status_code, status.HTTP_200_OK)

        # Verify in DB
        task = TaskDocument.objects(id=task_id).first()
        self.assertEqual(task.title, "New Title")
        self.assertEqual(task.status, "completed")

    def test_update_nonexistent_task_returns_404(self):
        """Updating a task that doesn't exist returns 404 or 400."""
        res = self.client.put("/api/tasks/update/000000000000000000000000/", {
            "title": "Ghost"
        }, format="json")
        self.assertIn(res.status_code, [400, 404])

    def test_update_task_due_date(self):
        """Updating due_date on an existing task works."""
        create_res = self._post_task(title="Due Update Task")
        task_id = create_res.data["id"]

        res = self.client.put(f"/api/tasks/update/{task_id}/", {
            "due_date": "2027-01-15"
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    # ── Delete task ───────────────────────────────────────────────────────

    def test_delete_task_success(self):
        """DELETE /api/tasks/delete/<id>/ removes the task."""
        create_res = self._post_task(title="To Delete")
        task_id = create_res.data["id"]

        del_res = self.client.delete(f"/api/tasks/delete/{task_id}/")
        self.assertEqual(del_res.status_code, status.HTTP_200_OK)
        self.assertIsNone(TaskDocument.objects(id=task_id).first())

    def test_delete_nonexistent_task_returns_404(self):
        """Deleting a non-existent task returns 404 or 400."""
        res = self.client.delete("/api/tasks/delete/000000000000000000000000/")
        self.assertIn(res.status_code, [400, 404])

    def test_delete_task_without_auth_raises(self):
        """DELETE without auth returns 401/403."""
        create_res = self._post_task(title="Auth Test")
        task_id = create_res.data["id"]
        self.client.credentials()  # remove auth
        res = self.client.delete(f"/api/tasks/delete/{task_id}/")
        self.assertIn(res.status_code, [401, 403])


if __name__ == "__main__":
    import unittest
    unittest.main()
