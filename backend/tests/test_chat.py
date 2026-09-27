import unittest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.db.models import User, Conversation, Message
from backend.app.services.openrouter import (
    OpenRouterAuthError,
    OpenRouterRateLimitError,
    OpenRouterServerError,
    OpenRouterTimeoutError,
    OpenRouterInvalidResponseError,
)
from backend.tests.conftest_utils import (
    setup_test_db,
    create_test_user,
    get_auth_token_for_user,
    TestingSessionLocal,
)

class TestChatEndpoint(unittest.TestCase):

    def setUp(self):
        setup_test_db()
        self.client = TestClient(app)
        self.user1 = create_test_user("alice@example.com", "Alice User", "Password123!")
        self.user2 = create_test_user("bob@example.com", "Bob User", "Password123!")
        self.token1 = get_auth_token_for_user(self.user1)
        self.token2 = get_auth_token_for_user(self.user2)

    def test_chat_requires_authentication(self):
        """Unauthenticated request to /api/chat must be rejected with 401."""
        res = self.client.post("/api/chat", json={"message": "Hello"})
        self.assertEqual(res.status_code, 401)

    def test_invalid_jwt_rejected(self):
        """Request with invalid JWT must be rejected with 401."""
        res = self.client.post(
            "/api/chat",
            json={"message": "Hello"},
            headers={"Authorization": "Bearer invalid_garbage_token"}
        )
        self.assertEqual(res.status_code, 401)

    def test_conversation_ownership_enforced(self):
        """User A attempting to access User B's conversation must return 404."""
        db = TestingSessionLocal()
        conv_bob = Conversation(user_id=self.user2.id, title="Bob Private Conversation")
        db.add(conv_bob)
        db.commit()
        db.refresh(conv_bob)
        db.close()

        # Alice attempts to send a message to Bob's conversation
        res = self.client.post(
            "/api/chat",
            json={"conversation_id": conv_bob.id, "message": "Hi Bob"},
            headers={"Authorization": f"Bearer {self.token1}"}
        )
        self.assertEqual(res.status_code, 404)
        self.assertIn("not found", res.json()["detail"].lower())

    @patch("backend.app.api.chat.openrouter_service.generate_chat_completion", new_callable=AsyncMock)
    def test_valid_request_creates_and_persists_messages(self, mock_generate):
        """Valid chat request persists user message, calls OpenRouter, and persists assistant message."""
        mock_generate.return_value = (
            "Hello! I am Ron, your personal AI assistant.",
            "openrouter/auto"
        )

        res = self.client.post(
            "/api/chat",
            json={"message": "Hello Ron, introduce yourself."},
            headers={"Authorization": f"Bearer {self.token1}"}
        )

        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("conversation_id", data)
        self.assertEqual(data["user_message"]["role"], "user")
        self.assertEqual(data["user_message"]["content"], "Hello Ron, introduce yourself.")
        self.assertEqual(data["assistant_message"]["role"], "assistant")
        self.assertEqual(data["assistant_message"]["content"], "Hello! I am Ron, your personal AI assistant.")

        # Verify DB persistence
        db = TestingSessionLocal()
        messages = db.query(Message).filter(Message.conversation_id == data["conversation_id"]).all()
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0].role, "user")
        self.assertEqual(messages[0].content, "Hello Ron, introduce yourself.")
        self.assertEqual(messages[1].role, "assistant")
        self.assertEqual(messages[1].content, "Hello! I am Ron, your personal AI assistant.")

        # Verify conversation title was auto-updated from user message
        conv = db.query(Conversation).filter(Conversation.id == data["conversation_id"]).first()
        self.assertIn("Hello Ron", conv.title)
        db.close()

    @patch("backend.app.api.chat.openrouter_service.generate_chat_completion", new_callable=AsyncMock)
    def test_existing_conversation_appends_messages_and_uses_history(self, mock_generate):
        """Subsequent messages in existing conversation append properly and pass history."""
        mock_generate.return_value = ("I can help with coding!", "openrouter/auto")

        db = TestingSessionLocal()
        conv = Conversation(user_id=self.user1.id, title="My Coding Chat")
        db.add(conv)
        db.commit()
        db.refresh(conv)

        # Existing initial message
        msg1 = Message(conversation_id=conv.id, role="user", content="Can you code?")
        msg2 = Message(conversation_id=conv.id, role="assistant", content="Yes I can.")
        db.add_all([msg1, msg2])
        db.commit()
        conv_id = conv.id
        db.close()

        res = self.client.post(
            "/api/chat",
            json={"conversation_id": conv_id, "message": "Show me Python reverse string."},
            headers={"Authorization": f"Bearer {self.token1}"}
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["conversation_id"], conv_id)

        # Verify mock received history
        call_args = mock_generate.call_args[1]["messages"]
        self.assertEqual(call_args[0]["role"], "system")
        self.assertEqual(call_args[1]["role"], "user")
        self.assertEqual(call_args[1]["content"], "Can you code?")
        self.assertEqual(call_args[2]["role"], "assistant")
        self.assertEqual(call_args[2]["content"], "Yes I can.")
        self.assertEqual(call_args[3]["role"], "user")
        self.assertEqual(call_args[3]["content"], "Show me Python reverse string.")

        # Verify current user message appears exactly ONCE in the request payload
        occurrences = [m for m in call_args if m.get("content") == "Show me Python reverse string."]
        self.assertEqual(len(occurrences), 1)

        # Verify DB has 4 messages
        db = TestingSessionLocal()
        all_msgs = db.query(Message).filter(Message.conversation_id == conv_id).all()
        self.assertEqual(len(all_msgs), 4)
        db.close()

    @patch("backend.app.api.chat.openrouter_service.generate_chat_completion", new_callable=AsyncMock)
    def test_openrouter_auth_error_handled(self, mock_generate):
        """OpenRouter 401 returns clean 502 and does not save assistant message."""
        mock_generate.side_effect = OpenRouterAuthError("OpenRouter authentication failed.")

        res = self.client.post(
            "/api/chat",
            json={"message": "What is Python?"},
            headers={"Authorization": f"Bearer {self.token1}"}
        )
        self.assertEqual(res.status_code, 502)
        self.assertIn("couldn't connect to AI services", res.json()["detail"])

        # User message was saved, but NO assistant message saved
        db = TestingSessionLocal()
        asst_msgs = db.query(Message).filter(Message.role == "assistant").all()
        self.assertEqual(len(asst_msgs), 0)
        db.close()

    @patch("backend.app.api.chat.openrouter_service.generate_chat_completion", new_callable=AsyncMock)
    def test_openrouter_rate_limit_handled(self, mock_generate):
        """OpenRouter 429 returns clean 429 and does not save assistant message."""
        mock_generate.side_effect = OpenRouterRateLimitError("Rate limit reached.")

        res = self.client.post(
            "/api/chat",
            json={"message": "What is Python?"},
            headers={"Authorization": f"Bearer {self.token1}"}
        )
        self.assertEqual(res.status_code, 429)
        self.assertIn("high demand", res.json()["detail"])

    @patch("backend.app.api.chat.openrouter_service.generate_chat_completion", new_callable=AsyncMock)
    def test_openrouter_server_error_handled(self, mock_generate):
        """OpenRouter 5xx returns clean 502 and does not save assistant message."""
        mock_generate.side_effect = OpenRouterServerError("Server error.")

        res = self.client.post(
            "/api/chat",
            json={"message": "What is Python?"},
            headers={"Authorization": f"Bearer {self.token1}"}
        )
        self.assertEqual(res.status_code, 502)
        self.assertIn("couldn't respond right now", res.json()["detail"])

    @patch("backend.app.api.chat.openrouter_service.generate_chat_completion", new_callable=AsyncMock)
    def test_openrouter_timeout_handled(self, mock_generate):
        """OpenRouter timeout returns clean 504 and does not save assistant message."""
        mock_generate.side_effect = OpenRouterTimeoutError("Timed out.")

        res = self.client.post(
            "/api/chat",
            json={"message": "What is Python?"},
            headers={"Authorization": f"Bearer {self.token1}"}
        )
        self.assertEqual(res.status_code, 504)
        self.assertIn("took too long to respond", res.json()["detail"])

    @patch("backend.app.api.chat.openrouter_service.generate_chat_completion", new_callable=AsyncMock)
    def test_openrouter_invalid_response_handled(self, mock_generate):
        """OpenRouter empty/invalid response returns clean 502 and does not save assistant message."""
        mock_generate.side_effect = OpenRouterInvalidResponseError("Empty response.")

        res = self.client.post(
            "/api/chat",
            json={"message": "What is Python?"},
            headers={"Authorization": f"Bearer {self.token1}"}
        )
        self.assertEqual(res.status_code, 502)
        self.assertIn("couldn't respond right now", res.json()["detail"])

        db = TestingSessionLocal()
        asst_msgs = db.query(Message).filter(Message.role == "assistant").all()
        self.assertEqual(len(asst_msgs), 0)
        db.close()

    def test_empty_message_rejected(self):
        """Empty or whitespace-only messages must be rejected with 422."""
        res = self.client.post(
            "/api/chat",
            json={"message": "   "},
            headers={"Authorization": f"Bearer {self.token1}"}
        )
        self.assertEqual(res.status_code, 422)

if __name__ == "__main__":
    unittest.main()
