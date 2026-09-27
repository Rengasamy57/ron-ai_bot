from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.core.config import settings
from backend.app.db.database import engine, Base
from backend.app.api.auth import router as auth_router
from backend.app.api.conversations import router as conversations_router
from backend.app.api.chat import router as chat_router

# Create database tables automatically
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Ron AI Backend API",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth_router, prefix="/api")
app.include_router(conversations_router, prefix="/api/conversations", tags=["conversations"])
app.include_router(chat_router, prefix="/api", tags=["chat"])

@app.get("/api/health", tags=["health"])
def health_check():
    return {"status": "healthy", "service": "Ron AI API"}

# Mount frontend static files and root entry
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

ROOT_DIR = Path(__file__).resolve().parent.parent.parent

if (ROOT_DIR / "css").exists():
    app.mount("/css", StaticFiles(directory=ROOT_DIR / "css"), name="css")
if (ROOT_DIR / "js").exists():
    app.mount("/js", StaticFiles(directory=ROOT_DIR / "js"), name="js")
if (ROOT_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=ROOT_DIR / "assets"), name="assets")
if (ROOT_DIR / "pages").exists():
    app.mount("/pages", StaticFiles(directory=ROOT_DIR / "pages", html=True), name="pages")

@app.get("/")
@app.get("/index.html")
def serve_index():
    return FileResponse(ROOT_DIR / "index.html")
