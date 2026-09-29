# Ron AI — Intelligent Full-Stack AI Assistant

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-336791.svg)](https://www.postgresql.org/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0%2B-red.svg)](https://www.sqlalchemy.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)]()

**Ron AI** is a production-grade, full-stack AI chatbot and productivity assistant. Built with high performance and zero runtime bloat in mind, Ron AI pairs an asynchronous **FastAPI + PostgreSQL** backend with a lightning-fast **Vanilla HTML5, CSS3, and JavaScript** frontend, communicating with state-of-the-art Large Language Models via OpenRouter's Auto Router.

---

## Architecture Overview

```mermaid
flowchart LR
    Client["Browser (Vanilla HTML/CSS/JS)"] <--> |FAST API / JWT| Backend["FastAPI Backend (Uvicorn)"]
    Backend <--> |SQLAlchemy / Psycopg 3| DB[("PostgreSQL Database")]
    Backend <--> |HTTPX Async Gateway| OpenRouter["OpenRouter AI (openrouter/auto)"]
```

### Key Architectural Highlights
- **Zero Browser-to-AI Exposure:** API keys and external model communication are handled strictly server-side. The client never touches third-party AI keys.
- **Strict Multi-Tenant Isolation:** Complete data segregation between user accounts. All conversation and message queries enforce `user_id == current_user.id`.
- **Pure Native Frontend:** Zero heavy JavaScript frameworks (no React, Next.js, or Tailwind bloat). Fast load times, clean native DOM manipulation, and smooth transitions.
- **Resilient AI Pipeline:** Robust upstream error handling maps rate limits (429), timeouts, and upstream server errors (500) into actionable in-place retry prompts.

---

## Features

- **Authentication & Security:**
  - Secure registration and login with salted `bcrypt` password hashing (12 rounds).
  - Stateless JSON Web Tokens (`HS256`, 60-minute expiry) with protected route guards.
  - "Remember Me" credential persistence switch.
- **Interactive Chat Workspace:**
  - Collapsible desktop sidebar with `localStorage` state persistence.
  - Multi-turn conversation history management (create, list, view, delete).
  - Markdown parser rendering headers, bold/italic, lists, inline code, and syntax blocks.
  - Syntax code blocks with one-click "Copy code" feedback.
  - In-place error cards with one-click "Retry" action.
  - Intelligent auto-scroll preserving user position on manual scrollback.
  - Responsive keyboard shortcuts (`Enter` to send, `Shift+Enter` for newline).
- **AI Gateway Integration:**
  - Dynamic model routing via `openrouter/auto`.
  - Multi-lingual persona (English, Tamil, Tanglish).
  - Deduplicated context payload compiler preserving the 20 most recent messages.

---

## Tech Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Backend Framework** | [FastAPI](https://fastapi.tiangolo.com/) | High-performance asynchronous REST API |
| **ASGI Server** | [Uvicorn](https://www.uvicorn.org/) | Lightning-fast ASGI web server implementation |
| **Database ORM** | [SQLAlchemy 2.0](https://www.sqlalchemy.org/) | Modern type-safe Object Relational Mapper |
| **Database Driver** | [Psycopg 3](https://www.psycopg.org/) | High-performance PostgreSQL database adapter |
| **Database** | [PostgreSQL 15+](https://www.postgresql.org/) | Relational database with cascading integrity |
| **Security & Auth** | `bcrypt` + `pyjwt` | Cryptographic password hashing and JWT issuance |
| **AI Gateway** | [HTTPX](https://www.python-httpx.org/) | Async HTTP client interfacing with [OpenRouter](https://openrouter.ai/) |
| **Frontend** | Vanilla HTML5 / CSS3 / ES6+ | Lightweight, responsive native user interface |

---

## Repository Structure

```
ron-ai_bot/
├── backend/
│   ├── app/
│   │   ├── api/                  # FastAPI routers (auth, chat, conversations)
│   │   ├── core/                 # Config, security, dependencies
│   │   ├── db/                   # Database session and SQLAlchemy models
│   │   ├── schemas/              # Pydantic validation schemas
│   │   ├── services/             # OpenRouter AI gateway client
│   │   └── main.py               # FastAPI application entrypoint
│   ├── tests/                    # Comprehensive unit & integration test suite
│   ├── .env.example              # Backend environment template
│   └── requirements.txt          # Backend dependencies
├── assets/
│   └── images/                   # Ron mascot, hero graphics, and logos
├── css/
│   ├── auth.css                  # Login and signup styles
│   ├── chat.css                  # Chat workspace and sidebar styles
│   ├── responsive.css            # Responsive layout rules
│   └── style.css                 # Landing page styles
├── js/
│   ├── auth.js                   # Client-side auth, token management
│   ├── chat.js                   # Chat UX, markdown parser, API communications
│   └── main.js                   # Landing page interactions & theme toggle
├── pages/
│   ├── chat.html                 # Chat application interface
│   ├── login.html                # User login page
│   └── signup.html               # User registration page
├── index.html                    # Ron AI landing page
├── requirements.txt              # Root dependencies
├── .env.example                  # Root environment template
├── .gitignore                    # Comprehensive repository ignore rules
└── README.md                     # Project documentation
```

---

## Getting Started

### 1. Prerequisites
- **Python:** 3.10 or higher
- **PostgreSQL:** 15 or higher (local or managed instance)
- **OpenRouter API Key:** Sign up at [OpenRouter.ai](https://openrouter.ai/keys)

---

### 2. Clone the Repository
```bash
git clone https://github.com/Rengasamy57/ron-ai_bot.git
cd ron-ai_bot
```

---

### 3. Create and Activate a Virtual Environment
**On Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**On Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

---

### 4. Install Dependencies
```bash
pip install -r requirements.txt
```

---

### 5. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

Open `.env` and fill in your configuration:
```env
# Application Settings
PROJECT_NAME="Ron AI"

# Database Configuration (PostgreSQL)
DATABASE_URL=postgresql+psycopg://username:password@localhost:5432/ron_ai

# CORS Configuration
CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000","http://localhost:8000","http://127.0.0.1:8000"]

# Authentication & JWT Configuration
# Generate a secret key: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET_KEY=your_cryptographically_secure_jwt_secret_key
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60

# OpenRouter AI Gateway
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=openrouter/auto
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_TIMEOUT_SECONDS=60.0
```

> **Note:** If placing `.env` inside `backend/`, the application will also detect it automatically.

---

### 6. Create the Database
Ensure PostgreSQL is running, then create the database:
```sql
CREATE DATABASE ron_ai;
```
*(The backend automatically creates all required tables on startup via SQLAlchemy metadata)*

---

### 7. Run the Backend Server
From the repository root:
```bash
uvicorn backend.app.main:app --reload --port 8000
```
- API Base URL: `http://localhost:8000`
- Interactive OpenAPI Docs (Swagger UI): `http://localhost:8000/docs`
- Alternative API Docs (ReDoc): `http://localhost:8000/redoc`

---

### 8. Run the Frontend
Since Ron AI's frontend is pure Vanilla HTML/CSS/JS, serve it using any static file server:

**Option A — Python Built-in HTTP Server:**
```bash
python -m http.server 3000
```
Open `http://localhost:3000` in your browser.

**Option B — VS Code Live Server:**
Right-click `index.html` and select **"Open with Live Server"**.

---

## API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `POST` | `/api/auth/register` | Register a new user account | No |
| `POST` | `/api/auth/login` | Authenticate credentials and receive JWT | No |
| `GET` | `/api/auth/me` | Fetch current user profile | Yes (Bearer) |

### Conversations (`/api/conversations`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/conversations` | List conversations for current user | Yes (Bearer) |
| `POST` | `/api/conversations` | Create a new conversation thread | Yes (Bearer) |
| `GET` | `/api/conversations/{id}` | Get conversation and message history | Yes (Bearer) |
| `DELETE` | `/api/conversations/{id}`| Delete conversation and child messages | Yes (Bearer) |

### Chat (`/api/chat`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `POST` | `/api/chat` | Send prompt to AI and persist conversation | Yes (Bearer) |

---

## Security Best Practices

1. **Never commit `.env` files**: All `.env` and `backend/.env` files are strictly excluded by `.gitignore`.
2. **Rotate Secrets**: If you suspect any secret was exposed, rotate your OpenRouter API keys and JWT secret keys immediately.
3. **HTTPS in Production**: Always run behind an SSL/TLS reverse proxy (e.g., Nginx, Caddy, Cloudflare) in production environments.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
