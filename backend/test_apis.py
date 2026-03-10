import requests
import json
import uuid

BASE_URL = "http://127.0.0.1:8000/api"

def test_apis():
    print("--- Testing API Endpoints ---")
    
    unique_suffix = str(uuid.uuid4())[:8]
    user_data = {
        "name": "Integration Test",
        "email": f"test_{unique_suffix}@example.com",
        "password": "password123"
    }
    
    # 1. Register User
    print(f"\n[1] Registering user: {user_data['email']}")
    try:
        resp = requests.post(f"{BASE_URL}/auth/register/", json=user_data)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.json() if resp.status_code < 500 else resp.text[:100]}")
    except Exception as e:
        print(f"Error connecting to server: {e}")
        return

    # 2. Login
    login_data = {
        "email": user_data["email"],
        "password": user_data["password"]
    }
    print(f"\n[2] Logging in user: {login_data['email']}")
    resp = requests.post(f"{BASE_URL}/auth/login/", json=login_data)
    print(f"Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"Stopping tests due to failed login. Response: {resp.text[:100]}")
        return
    
    login_json = resp.json()
    token = login_json.get("access")
    print(f"JWT Token obtained: {token[:20]}...")

    headers = {"Authorization": f"Bearer {token}"}

    # 3. Create Task
    task_data = {
        "title": "API Test Task",
        "description": "Created by integration test script",
        "priority": "high",
        "due_date": "2026-12-31"
    }
    print(f"\n[3] Creating task: {task_data['title']}")
    resp = requests.post(f"{BASE_URL}/tasks/create/", json=task_data, headers=headers)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.json()}")
    if resp.status_code != 201:
        return
    
    task_id = resp.json().get("id")

    # 4. Get Tasks
    print("\n[4] Fetching all tasks")
    resp = requests.get(f"{BASE_URL}/tasks/", headers=headers)
    print(f"Status: {resp.status_code}")
    tasks = resp.json()
    print(f"Tasks Count: {len(tasks)}")

    # 5. Update Task
    update_data = {"status": "completed", "title": "Updated API Test Task"}
    print(f"\n[5] Updating task {task_id}")
    resp = requests.put(f"{BASE_URL}/tasks/update/{task_id}/", json=update_data, headers=headers)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.json()}")

    # 6. Delete Task
    print(f"\n[6] Deleting task {task_id}")
    resp = requests.delete(f"{BASE_URL}/tasks/delete/{task_id}/", headers=headers)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.json()}")

if __name__ == "__main__":
    test_apis()
