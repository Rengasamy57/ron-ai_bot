import unittest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.tests.conftest_utils import (
    setup_test_db,
    create_test_user,
    get_auth_token_for_user,
)

class TestConversationsEndpoints(unittest.TestCase):

    def setUp(self):
        setup_test_db()
        self.client = TestClient(app)
        self.user_a = create_test_user("user_a@example.com", "User A", "PassA123!")
        self.user_b = create_test_user("user_b@example.com", "User B", "PassB123!")
        self.token_a = get_auth_token_for_user(self.user_a)
        self.token_b = get_auth_token_for_user(self.user_b)

    def test_create_and_list_conversations(self):
        # Create conversation for User A
        res = self.client.post(
            "/api/conversations",
            json={"title": "Test Chat 1"},
            headers={"Authorization": f"Bearer {self.token_a}"}
        )
        self.assertEqual(res.status_code, 201)
        conv_id = res.json()["id"]

        # List conversations for User A
        res_list = self.client.get(
            "/api/conversations",
            headers={"Authorization": f"Bearer {self.token_a}"}
        )
        self.assertEqual(res_list.status_code, 200)
        items = res_list.json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], conv_id)

        # User B should see 0 conversations
        res_b = self.client.get(
            "/api/conversations",
            headers={"Authorization": f"Bearer {self.token_b}"}
        )
        self.assertEqual(res_b.status_code, 200)
        self.assertEqual(len(res_b.json()), 0)

    def test_user_isolation_for_detail_and_delete(self):
        # Create conversation for User A
        res = self.client.post(
            "/api/conversations",
            json={"title": "User A Private Chat"},
            headers={"Authorization": f"Bearer {self.token_a}"}
        )
        conv_id = res.json()["id"]

        # User B cannot access User A's conversation
        res_get = self.client.get(
            f"/api/conversations/{conv_id}",
            headers={"Authorization": f"Bearer {self.token_b}"}
        )
        self.assertEqual(res_get.status_code, 404)

        # User B cannot delete User A's conversation
        res_del = self.client.delete(
            f"/api/conversations/{conv_id}",
            headers={"Authorization": f"Bearer {self.token_b}"}
        )
        self.assertEqual(res_del.status_code, 404)

        # User A can delete own conversation
        res_del_a = self.client.delete(
            f"/api/conversations/{conv_id}",
            headers={"Authorization": f"Bearer {self.token_a}"}
        )
        self.assertEqual(res_del_a.status_code, 204)

if __name__ == "__main__":
    unittest.main()
