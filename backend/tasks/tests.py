from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
import mongomock
import mongoengine
from unittest.mock import patch
from datetime import datetime, timezone

# Use mongomock for testing without a real MongoDB
class TaskAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        # Disconnect real mongo and connect to mock
        mongoengine.disconnect(alias='default')
        mongoengine.connect('testdb', host='mongodb://localhost', mongo_client_class=mongomock.MongoClient, alias='default')

    def tearDown(self):
        mongoengine.disconnect(alias='default')

    def test_health_check(self):
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'healthy')

    def test_register_user(self):
        data = {
            "name": "Test User",
            "email": "test@example.com",
            "password": "password123"
        }
        response = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_login_user(self):
        # Register first
        self.client.post('/api/auth/register/', {
            "name": "Test User",
            "email": "test@example.com",
            "password": "password123"
        }, format='json')

        # Login
        data = {
            "email": "test@example.com",
            "password": "password123"
        }
        response = self.client.post('/api/auth/login/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)

    @patch('boto3.client')
    def test_s3_presign_upload(self, mock_boto):
        # Setup mock JWT auth
        # In a real scenario, we'd login and get a token. 
        # For simplicity, we'll mock the authentication or use a token.
        
        # 1. Register and Login to get token
        self.client.post('/api/auth/register/', {
            "name": "Test User",
            "email": "test@example.com",
            "password": "password123"
        }, format='json')
        login_res = self.client.post('/api/auth/login/', {
            "email": "test@example.com",
            "password": "password123"
        }, format='json')
        token = login_res.data['access']
        
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        # Mock S3 response
        mock_s3 = mock_boto.return_value
        mock_s3.generate_presigned_url.return_value = "https://mock-url.com"
        
        data = {"filename": "test.txt", "content_type": "text/plain"}
        response = self.client.post('/api/s3/presign-upload/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('upload_url', response.data)
