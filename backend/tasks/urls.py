from django.urls import path
from .views import (
    create_task, get_tasks, update_task, delete_task, health_check,
    register_user, login_user,
    task_status_analytics, task_priority_analytics, tasks_by_date_analytics,
    task_overdue_analytics, task_filtered_analytics,
    s3_presign_upload, s3_presign_download,
    admin_get_all_tasks, admin_delete_task, admin_get_all_users, admin_delete_user
)
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    # TASKS
    path('tasks/', get_tasks),
    path('tasks/create/', create_task),
    path('tasks/update/<str:task_id>/', update_task),
    path('tasks/delete/<str:task_id>/', delete_task),

    # AUTH
    path('auth/register/', register_user),
    path('auth/login/', login_user),

    # JWT (Standard SimpleJWT)
    path('token/', TokenObtainPairView.as_view()),
    path('token/refresh/', TokenRefreshView.as_view()),

    # ANALYTICS
    path("analytics/status/",   task_status_analytics),
    path("analytics/priority/", task_priority_analytics),
    path("analytics/date/",     tasks_by_date_analytics),
    path("analytics/overdue/",  task_overdue_analytics),      # ← NEW
    path("analytics/filtered/", task_filtered_analytics),     # ← NEW

    # S3 FILE OPERATIONS
    path("s3/presign-upload/",   s3_presign_upload),
    path("s3/presign-download/", s3_presign_download),

    # ADMIN
    path('admin/tasks/', admin_get_all_tasks),
    path('admin/tasks/delete/<str:task_id>/', admin_delete_task),
    path('admin/users/', admin_get_all_users),
    path('admin/users/delete/<str:user_id>/', admin_delete_user),

    # HEALTH
    path('health/', health_check),
]
