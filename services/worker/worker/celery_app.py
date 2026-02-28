from celery import Celery

from worker.config import get_settings

settings = get_settings()

celery = Celery(
    "poe-worker",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

celery.autodiscover_tasks(["worker.tasks"])
