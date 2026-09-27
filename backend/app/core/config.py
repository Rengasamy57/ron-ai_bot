import os
import json
from pathlib import Path
from dotenv import load_dotenv

# Load backend/.env using backend configuration architecture
backend_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if backend_env_path.exists():
    load_dotenv(dotenv_path=backend_env_path)
else:
    load_dotenv()

class Settings:
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "Ron AI")
    API_V1_STR: str = "/api"
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/ron_ai"
    )
    
    # JWT Settings
    JWT_SECRET_KEY: str = os.getenv(
        "JWT_SECRET_KEY",
        "ron_ai_super_secret_jwt_key_2026_dev_environment_secure_key"
    )
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60")
    )
    
    # Parse CORS origins
    _cors_env = os.getenv("CORS_ORIGINS")
    if _cors_env:
        try:
            CORS_ORIGINS: list[str] = json.loads(_cors_env)
        except Exception:
            CORS_ORIGINS: list[str] = [orig.strip() for orig in _cors_env.split(",")]
    else:
        CORS_ORIGINS: list[str] = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:8000",
            "http://127.0.0.1:8000"
        ]

    # OpenRouter Settings
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "openrouter/auto")
    OPENROUTER_BASE_URL: str = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    OPENROUTER_TIMEOUT_SECONDS: float = float(os.getenv("OPENROUTER_TIMEOUT_SECONDS", "60.0"))

settings = Settings()
