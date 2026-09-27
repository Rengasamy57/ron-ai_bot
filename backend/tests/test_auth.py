import unittest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.tests.conftest_utils import (
    setup_test_db,
    create_test_user,
    get_auth_token_for_user,
)

class TestAuthEndpoints(unittest.TestCase):

    def setUp(self):
        setup_test_db()
        self.client = TestClient(app)

    def test_register_success(self):
        res = self.client.post("/api/auth/register", json={
            "name": "Jane Doe",
            "email": "jane@example.com",
            "password": "SecurePassword123!"
        })
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["user"]["email"], "jane@example.com")
        self.assertEqual(data["user"]["name"], "Jane Doe")
        self.assertIn("message", data)

    def test_register_duplicate_email(self):
        create_test_user("existing@example.com", "Existing", "Password123!")
        res = self.client.post("/api/auth/register", json={
            "name": "Duplicate",
            "email": "existing@example.com",
            "password": "Password123!"
        })
        self.assertEqual(res.status_code, 409)
        self.assertIn("already exists", res.json()["detail"].lower())

    def test_login_success(self):
        create_test_user("login@example.com", "Login User", "MyPassword123!")
        res = self.client.post("/api/auth/login", json={
            "email": "login@example.com",
            "password": "MyPassword123!"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["token_type"], "bearer")

    def test_login_invalid_password(self):
        create_test_user("login@example.com", "Login User", "MyPassword123!")
        res = self.client.post("/api/auth/login", json={
            "email": "login@example.com",
            "password": "WrongPassword!"
        })
        self.assertEqual(res.status_code, 401)

    def test_me_endpoint_authenticated(self):
        user = create_test_user("me@example.com", "Me User", "Password123!")
        token = get_auth_token_for_user(user)
        res = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["email"], "me@example.com")

    def test_me_endpoint_unauthenticated(self):
        res = self.client.get("/api/auth/me")
        self.assertEqual(res.status_code, 401)

if __name__ == "__main__":
    unittest.main()
