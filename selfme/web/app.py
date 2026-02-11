"""SelfMe Web UI - Static file server."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="SelfMe Web UI")

# Get dist directory path
dist_dir = Path(__file__).parent / "dist"

# Mount static files
if dist_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(dist_dir / "assets")), name="assets")


@app.get("/api/config")
async def get_config():
    """Get application configuration."""
    from selfme.config import settings

    return {
        "version": settings.app_version,
        "model": settings.llm_model,
    }


@app.get("/")
async def serve_spa():
    """Serve the Vue SPA index.html."""
    index_path = dist_dir / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"error": "Frontend not built. Run: cd selfme/web/frontend && pnpm run build"}


@app.get("/{full_path:path}")
async def serve_spa_routes(full_path: str):
    """SPA routing fallback - serve index.html for all routes."""
    index_path = dist_dir / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"error": "Frontend not built. Run: cd selfme/web/frontend && pnpm run build"}
