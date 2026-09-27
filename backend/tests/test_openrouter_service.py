import unittest
from unittest.mock import patch
import httpx
from backend.app.services.openrouter import (
    OpenRouterService,
    RON_SYSTEM_PROMPT,
    OpenRouterAuthError,
    OpenRouterRateLimitError,
    OpenRouterServerError,
    OpenRouterTimeoutError,
    OpenRouterInvalidResponseError,
)

class TestOpenRouterService(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.service = OpenRouterService(
            api_key="test-api-key-mock",
            model="openrouter/auto",
            base_url="https://openrouter.ai/api/v1",
            timeout=5.0
        )

    def test_build_messages_payload(self):
        history = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"}
        ]
        user_msg = "How does DNS work?"
        payload = self.service.build_messages_payload(history, user_msg)

        self.assertEqual(len(payload), 4)
        self.assertEqual(payload[0]["role"], "system")
        self.assertEqual(payload[0]["content"], RON_SYSTEM_PROMPT)
        self.assertEqual(payload[1]["role"], "user")
        self.assertEqual(payload[1]["content"], "Hello")
        self.assertEqual(payload[2]["role"], "assistant")
        self.assertEqual(payload[2]["content"], "Hi there!")
        self.assertEqual(payload[3]["role"], "user")
        self.assertEqual(payload[3]["content"], "How does DNS work?")

    def test_build_messages_from_history_no_duplicate(self):
        """Verify build_messages_from_history produces exactly one instance of the current user message."""
        history = [
            {"role": "user", "content": "Previous question"},
            {"role": "assistant", "content": "Previous answer"},
            {"role": "user", "content": "Current question"}
        ]
        payload = self.service.build_messages_from_history(history)

        self.assertEqual(len(payload), 4)
        self.assertEqual(payload[0]["role"], "system")
        self.assertEqual(payload[1]["content"], "Previous question")
        self.assertEqual(payload[2]["content"], "Previous answer")
        self.assertEqual(payload[3]["content"], "Current question")

        # Verify 'Current question' appears exactly ONCE in entire payload
        user_occurrences = [m for m in payload if m.get("content") == "Current question"]
        self.assertEqual(len(user_occurrences), 1)

    def test_missing_api_key(self):
        service = OpenRouterService(api_key="", model="openrouter/auto")
        with self.assertRaises(OpenRouterAuthError):
            import asyncio
            asyncio.run(service.generate_chat_completion([{"role": "user", "content": "test"}]))

    async def test_successful_completion(self):
        async def mock_handler(request: httpx.Request):
            self.assertEqual(request.url, "https://openrouter.ai/api/v1/chat/completions")
            self.assertEqual(request.headers.get("authorization"), "Bearer test-api-key-mock")
            return httpx.Response(
                200,
                json={
                    "id": "gen-123",
                    "model": "meta-llama/llama-3-70b-instruct",
                    "choices": [
                        {"message": {"role": "assistant", "content": "DNS resolves domain names to IP addresses."}}
                    ]
                }
            )

        transport = httpx.MockTransport(mock_handler)
        async with httpx.AsyncClient(transport=transport) as client:
            content, model = await self.service.generate_chat_completion(
                [{"role": "user", "content": "Explain DNS"}],
                client=client
            )
            self.assertEqual(content, "DNS resolves domain names to IP addresses.")
            self.assertEqual(model, "meta-llama/llama-3-70b-instruct")

    async def test_auth_error_401(self):
        async def mock_handler(request: httpx.Request):
            return httpx.Response(401, json={"error": {"message": "Invalid API Key"}})

        transport = httpx.MockTransport(mock_handler)
        async with httpx.AsyncClient(transport=transport) as client:
            with self.assertRaises(OpenRouterAuthError):
                await self.service.generate_chat_completion(
                    [{"role": "user", "content": "test"}],
                    client=client
                )

    async def test_rate_limit_429(self):
        async def mock_handler(request: httpx.Request):
            return httpx.Response(429, json={"error": {"message": "Rate limit exceeded"}})

        transport = httpx.MockTransport(mock_handler)
        async with httpx.AsyncClient(transport=transport) as client:
            with self.assertRaises(OpenRouterRateLimitError):
                await self.service.generate_chat_completion(
                    [{"role": "user", "content": "test"}],
                    client=client
                )

    async def test_server_error_500(self):
        async def mock_handler(request: httpx.Request):
            return httpx.Response(500, json={"error": {"message": "Internal server error"}})

        transport = httpx.MockTransport(mock_handler)
        async with httpx.AsyncClient(transport=transport) as client:
            with self.assertRaises(OpenRouterServerError):
                await self.service.generate_chat_completion(
                    [{"role": "user", "content": "test"}],
                    client=client
                )

    async def test_timeout(self):
        async def mock_handler(request: httpx.Request):
            raise httpx.ReadTimeout("Connection timed out")

        transport = httpx.MockTransport(mock_handler)
        async with httpx.AsyncClient(transport=transport) as client:
            with self.assertRaises(OpenRouterTimeoutError):
                await self.service.generate_chat_completion(
                    [{"role": "user", "content": "test"}],
                    client=client
                )

    async def test_empty_choices(self):
        async def mock_handler(request: httpx.Request):
            return httpx.Response(200, json={"choices": []})

        transport = httpx.MockTransport(mock_handler)
        async with httpx.AsyncClient(transport=transport) as client:
            with self.assertRaises(OpenRouterInvalidResponseError):
                await self.service.generate_chat_completion(
                    [{"role": "user", "content": "test"}],
                    client=client
                )

    async def test_empty_content(self):
        async def mock_handler(request: httpx.Request):
            return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": "   "}}]})

        transport = httpx.MockTransport(mock_handler)
        async with httpx.AsyncClient(transport=transport) as client:
            with self.assertRaises(OpenRouterInvalidResponseError):
                await self.service.generate_chat_completion(
                    [{"role": "user", "content": "test"}],
                    client=client
                )

if __name__ == "__main__":
    unittest.main()
