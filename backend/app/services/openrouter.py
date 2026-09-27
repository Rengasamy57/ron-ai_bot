import logging
from typing import List, Dict, Optional, Tuple
import httpx
from backend.app.core.config import settings

logger = logging.getLogger("ron_ai.openrouter")

RON_SYSTEM_PROMPT = (
    "You are Ron, a smart, versatile, and friendly personal AI assistant.\n"
    "Guidelines:\n"
    "- Be helpful, clear, accurate, and conversational.\n"
    "- Provide concise answers for simple queries, and structured, in-depth explanations when asked or when topics require it.\n"
    "- Highly skilled in software engineering, debugging, coding best practices, and technical explanations.\n"
    "- Act as a patient, encouraging study partner: explain concepts intuitively and break down complex topics step-by-step.\n"
    "- You understand English, Tamil, and Tanglish (Tamil words written in English/Latin script). Always respond naturally in the user's language or mixed dialect.\n"
    "- Maintain a warm, encouraging, and professional tone."
)

class OpenRouterError(Exception):
    """Base exception for OpenRouter operations."""
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

class OpenRouterAuthError(OpenRouterError):
    """Raised when authentication with OpenRouter fails (missing/invalid API key)."""
    def __init__(self, message: str = "OpenRouter authentication failed."):
        super().__init__(message, status_code=502)

class OpenRouterRateLimitError(OpenRouterError):
    """Raised when OpenRouter rate limit is encountered."""
    def __init__(self, message: str = "OpenRouter rate limit reached."):
        super().__init__(message, status_code=429)

class OpenRouterServerError(OpenRouterError):
    """Raised when OpenRouter returns a server-side error (5xx)."""
    def __init__(self, message: str = "OpenRouter server error."):
        super().__init__(message, status_code=502)

class OpenRouterTimeoutError(OpenRouterError):
    """Raised when request to OpenRouter times out."""
    def __init__(self, message: str = "OpenRouter request timed out."):
        super().__init__(message, status_code=504)

class OpenRouterInvalidResponseError(OpenRouterError):
    """Raised when OpenRouter response is malformed, empty, or unparseable."""
    def __init__(self, message: str = "Invalid response from OpenRouter."):
        super().__init__(message, status_code=502)


class OpenRouterService:
    """Service to interact with OpenRouter Auto Router API."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
    ):
        self.api_key = api_key if api_key is not None else settings.OPENROUTER_API_KEY
        self.model = model if model is not None else settings.OPENROUTER_MODEL
        self.base_url = (base_url if base_url is not None else settings.OPENROUTER_BASE_URL).rstrip("/")
        self.timeout = timeout if timeout is not None else settings.OPENROUTER_TIMEOUT_SECONDS

    def build_messages_payload(
        self,
        history: List[Dict[str, str]],
        current_user_message: str
    ) -> List[Dict[str, str]]:
        """
        Build the messages array formatted for OpenRouter:
        1. System prompt
        2. Previous chronological conversation messages
        3. Current user message
        """
        payload: List[Dict[str, str]] = [
            {"role": "system", "content": RON_SYSTEM_PROMPT}
        ]

        # Add sanitized previous messages
        for msg in history:
            role = msg.get("role")
            content = msg.get("content", "").strip()
            if role in ("user", "assistant") and content:
                payload.append({"role": role, "content": content})

        # Append latest user message
        payload.append({"role": "user", "content": current_user_message.strip()})
        return payload

    def build_messages_from_history(
        self,
        messages_history: List[Dict[str, str]]
    ) -> List[Dict[str, str]]:
        """
        Build the messages array formatted for OpenRouter from chronological
        history that already includes the current user message as its final entry:
        1. System prompt
        2. Chronological conversation messages (user / assistant)
        The current user message appears exactly once.
        """
        payload: List[Dict[str, str]] = [
            {"role": "system", "content": RON_SYSTEM_PROMPT}
        ]
        for msg in messages_history:
            role = msg.get("role")
            content = msg.get("content", "").strip()
            if role in ("user", "assistant") and content:
                payload.append({"role": role, "content": content})
        return payload

    async def generate_chat_completion(
        self,
        messages: List[Dict[str, str]],
        client: Optional[httpx.AsyncClient] = None
    ) -> Tuple[str, str]:
        """
        Send messages payload to OpenRouter Auto Router.
        Returns a tuple of (assistant_reply, routed_model_name).
        """
        if not self.api_key or not self.api_key.strip():
            logger.error("OpenRouter API key is not configured.")
            raise OpenRouterAuthError("OpenRouter API key is not configured.")

        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:8000",
            "X-Title": "Ron AI",
        }
        body = {
            "model": self.model,
            "messages": messages,
        }

        # Safe diagnostic log (NEVER logs API key or message secrets)
        logger.info(
            "Dispatching request to OpenRouter. Model: %s, Messages count: %d",
            self.model,
            len(messages)
        )

        try:
            if client is not None:
                response = await client.post(url, headers=headers, json=body, timeout=self.timeout)
            else:
                async with httpx.AsyncClient(timeout=self.timeout) as internal_client:
                    response = await internal_client.post(url, headers=headers, json=body)
        except httpx.TimeoutException as exc:
            logger.warning("OpenRouter request timed out after %.1f seconds: %s", self.timeout, exc)
            raise OpenRouterTimeoutError(f"OpenRouter request timed out after {self.timeout}s.") from exc
        except httpx.RequestError as exc:
            logger.error("Network error while connecting to OpenRouter: %s", exc)
            raise OpenRouterServerError(f"Network error connecting to OpenRouter: {exc}") from exc

        # Handle HTTP status codes
        if response.status_code in (401, 403):
            logger.error("OpenRouter rejected credentials with HTTP %d", response.status_code)
            raise OpenRouterAuthError("OpenRouter authentication failed.")
        elif response.status_code == 429:
            logger.warning("OpenRouter rate limit hit (HTTP 429)")
            raise OpenRouterRateLimitError("OpenRouter rate limit reached.")
        elif response.status_code >= 500:
            logger.error("OpenRouter server error HTTP %d", response.status_code)
            raise OpenRouterServerError(f"OpenRouter returned server error {response.status_code}.")
        elif response.status_code != 200:
            logger.error("OpenRouter returned unexpected HTTP status %d", response.status_code)
            raise OpenRouterServerError(f"OpenRouter returned unexpected status {response.status_code}.")

        # Parse JSON response
        try:
            data = response.json()
        except Exception as exc:
            logger.error("Failed to parse OpenRouter response as JSON: %s", exc)
            raise OpenRouterInvalidResponseError("Malformed JSON response from OpenRouter.") from exc

        choices = data.get("choices")
        if not isinstance(choices, list) or len(choices) == 0:
            logger.error("OpenRouter response contains no choices.")
            raise OpenRouterInvalidResponseError("No choices returned in OpenRouter response.")

        first_choice = choices[0]
        if not isinstance(first_choice, dict):
            logger.error("OpenRouter response choice is invalid format.")
            raise OpenRouterInvalidResponseError("Invalid choice format from OpenRouter.")

        message_obj = first_choice.get("message")
        if not isinstance(message_obj, dict):
            logger.error("OpenRouter response message is missing or invalid.")
            raise OpenRouterInvalidResponseError("Missing message object in OpenRouter response.")

        content = message_obj.get("content")
        if not content or not isinstance(content, str) or not content.strip():
            logger.error("OpenRouter response message content is empty.")
            raise OpenRouterInvalidResponseError("Empty assistant response content from OpenRouter.")

        routed_model = data.get("model", self.model)
        logger.info("Successfully received OpenRouter response. Routed model: %s", routed_model)

        return content.strip(), routed_model

openrouter_service = OpenRouterService()
