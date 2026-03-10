"""
DAY 4 – Django Unit Tests: Models
===================================
Tests for UserDocument, TaskDocument, and ActivityLog ORM models.
Uses mongomock so NO real MongoDB connection is needed.

Run with:
  cd Backend
  python -m pytest tasks/test_models.py -v
  -- OR --
  python manage.py test tasks.test_models
"""

import unittest
import mongomock
from mongoengine import connect, disconnect
from .models import UserDocument, TaskDocument, ActivityLog
from datetime import datetime, timezone


class TestUserDocument(unittest.TestCase):
    """Unit tests for UserDocument model."""

    @classmethod
    def setUpClass(cls):
        disconnect(alias="default")
        connect("testdb", host="mongodb://localhost", mongo_client_class=mongomock.MongoClient, alias="default")

    @classmethod
    def tearDownClass(cls):
        disconnect(alias="default")

    def setUp(self):
        """Clear users collection before each test."""
        UserDocument.objects.delete()

    # ── Creation tests ────────────────────────────────────────────────────

    def test_user_creation_basic(self):
        """A user can be saved and retrieved with correct fields."""
        user = UserDocument(
            name="Alice",
            email="alice@example.com",
            password="hashed_pw_123"
        ).save()

        fetched = UserDocument.objects(email="alice@example.com").first()
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched.name, "Alice")
        self.assertEqual(fetched.email, "alice@example.com")
        self.assertEqual(fetched.password, "hashed_pw_123")

    def test_user_created_at_auto_set(self):
        """created_at should be auto-populated."""
        user = UserDocument(
            name="Bob",
            email="bob@example.com",
            password="pw"
        ).save()
        self.assertIsNotNone(user.created_at)
        self.assertIsInstance(user.created_at, datetime)

    def test_user_str_representation(self):
        """__str__ returns expected format."""
        user = UserDocument(name="Carol", email="carol@example.com", password="pw")
        self.assertIn("carol@example.com", str(user))

    def test_user_missing_required_name_raises(self):
        """Saving without required 'name' should raise ValidationError."""
        import mongoengine
        with self.assertRaises(mongoengine.ValidationError):
            UserDocument(email="nope@example.com", password="pw").save()

    def test_user_missing_required_email_raises(self):
        """Saving without required 'email' should raise ValidationError."""
        import mongoengine
        with self.assertRaises(mongoengine.ValidationError):
            UserDocument(name="Dave", password="pw").save()

    def test_user_delete(self):
        """Deleting a user removes it from the collection."""
        user = UserDocument(name="Eve", email="eve@example.com", password="pw").save()
        uid = user.id
        user.delete()
        self.assertIsNone(UserDocument.objects(id=uid).first())


class TestTaskDocument(unittest.TestCase):
    """Unit tests for TaskDocument model."""

    @classmethod
    def setUpClass(cls):
        disconnect(alias="default")
        connect("testdb", host="mongodb://localhost", mongo_client_class=mongomock.MongoClient, alias="default")

    @classmethod
    def tearDownClass(cls):
        disconnect(alias="default")

    def setUp(self):
        TaskDocument.objects.delete()

    def _make_task(self, **kwargs):
        defaults = dict(
            title="Sample Task",
            description="Sample description",
            status="pending",
            priority="medium",
            user_id="user_abc123"
        )
        defaults.update(kwargs)
        return TaskDocument(**defaults).save()

    # ── Creation tests ────────────────────────────────────────────────────

    def test_task_creation_basic(self):
        """Task is saved with all basic fields."""
        task = self._make_task()
        fetched = TaskDocument.objects(title="Sample Task").first()
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched.status, "pending")
        self.assertEqual(fetched.priority, "medium")
        self.assertEqual(fetched.user_id, "user_abc123")

    def test_task_default_status_is_pending(self):
        """Default status should be 'pending'."""
        task = TaskDocument(title="T", user_id="u1").save()
        self.assertEqual(task.status, "pending")

    def test_task_default_priority_is_medium(self):
        """Default priority should be 'medium'."""
        task = TaskDocument(title="T", user_id="u1").save()
        self.assertEqual(task.priority, "medium")

    def test_task_with_due_date(self):
        """Task can be created with a due_date."""
        due = datetime(2026, 12, 31, tzinfo=timezone.utc)
        task = self._make_task(due_date=due)
        fetched = TaskDocument.objects(id=task.id).first()
        self.assertIsNotNone(fetched.due_date)

    def test_task_without_due_date_is_none(self):
        """Task without due_date stores None."""
        task = self._make_task()
        self.assertIsNone(task.due_date)

    def test_task_status_choices(self):
        """Valid status values: pending, in_progress, completed."""
        for s in ("pending", "in_progress", "completed"):
            task = self._make_task(status=s, title=f"Task {s}")
            self.assertEqual(task.status, s)

    def test_task_priority_choices(self):
        """Valid priority values: low, medium, high."""
        for p in ("low", "medium", "high"):
            task = self._make_task(priority=p, title=f"Task {p}")
            self.assertEqual(task.priority, p)

    def test_task_str_representation(self):
        """__str__ returns expected format."""
        task = self._make_task(title="My Task", status="pending")
        self.assertIn("My Task", str(task))
        self.assertIn("pending", str(task))

    def test_task_missing_title_raises(self):
        """Saving without required title raises ValidationError."""
        import mongoengine
        with self.assertRaises(mongoengine.ValidationError):
            TaskDocument(user_id="u1").save()

    def test_task_missing_user_id_raises(self):
        """Saving without required user_id raises ValidationError."""
        import mongoengine
        with self.assertRaises(mongoengine.ValidationError):
            TaskDocument(title="No User Task").save()

    def test_task_created_at_auto_set(self):
        """created_at and updated_at are auto-set."""
        task = self._make_task()
        self.assertIsNotNone(task.created_at)
        self.assertIsNotNone(task.updated_at)

    def test_task_update(self):
        """An existing task can be updated and re-saved."""
        task = self._make_task(title="Before Update")
        task.title = "After Update"
        task.status = "completed"
        task.save()

        fetched = TaskDocument.objects(id=task.id).first()
        self.assertEqual(fetched.title, "After Update")
        self.assertEqual(fetched.status, "completed")

    def test_task_delete(self):
        """Deleting a task removes it from the collection."""
        task = self._make_task()
        tid = task.id
        task.delete()
        self.assertIsNone(TaskDocument.objects(id=tid).first())

    def test_multiple_tasks_for_same_user(self):
        """A user can have multiple tasks."""
        self._make_task(title="Task 1", user_id="multi_user")
        self._make_task(title="Task 2", user_id="multi_user")
        self._make_task(title="Task 3", user_id="multi_user")
        count = TaskDocument.objects(user_id="multi_user").count()
        self.assertEqual(count, 3)


class TestActivityLog(unittest.TestCase):
    """Unit tests for ActivityLog model."""

    @classmethod
    def setUpClass(cls):
        disconnect(alias="default")
        connect("testdb", host="mongodb://localhost", mongo_client_class=mongomock.MongoClient, alias="default")

    @classmethod
    def tearDownClass(cls):
        disconnect(alias="default")

    def setUp(self):
        ActivityLog.objects.delete()

    def test_activity_log_creation(self):
        """ActivityLog is created with user_id and action."""
        log = ActivityLog(user_id="user123", action="login").save()
        fetched = ActivityLog.objects(user_id="user123").first()
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched.action, "login")

    def test_activity_log_timestamp_auto_set(self):
        """timestamp is auto-populated."""
        log = ActivityLog(user_id="u1", action="logout").save()
        self.assertIsNotNone(log.timestamp)

    def test_activity_log_str_representation(self):
        """__str__ contains user_id and action."""
        log = ActivityLog(user_id="u1", action="task_created")
        self.assertIn("u1", str(log))
        self.assertIn("task_created", str(log))

    def test_multiple_logs_for_user(self):
        """Multiple activity logs can exist for the same user."""
        ActivityLog(user_id="repeat_user", action="login").save()
        ActivityLog(user_id="repeat_user", action="task_created").save()
        ActivityLog(user_id="repeat_user", action="logout").save()
        count = ActivityLog.objects(user_id="repeat_user").count()
        self.assertEqual(count, 3)


if __name__ == "__main__":
    unittest.main()
