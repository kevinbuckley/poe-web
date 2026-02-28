from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.rate_limit import rate_limiter
from app.core.tracing import configure_tracing
from app.db.base import Base
from app.db.session import engine

settings = get_settings()
configure_logging()
configure_tracing()

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def attach_actor(request: Request, call_next):
    request.state.actor = request.headers.get("x-user-id", settings.default_user_id)
    if not rate_limiter.allow(request.state.actor):
        return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
    response = await call_next(request)
    response.headers["x-poe-actor"] = request.state.actor
    return response


@app.on_event("startup")
def startup() -> None:
    if settings.auto_create_tables:
        Base.metadata.create_all(bind=engine)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": settings.app_name, "status": "ok"}


app.include_router(router)
