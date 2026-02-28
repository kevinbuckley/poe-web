from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider


_TRACING_CONFIGURED = False


def configure_tracing() -> None:
    global _TRACING_CONFIGURED
    if _TRACING_CONFIGURED:
        return

    resource = Resource.create({"service.name": "poe-api"})
    provider = TracerProvider(resource=resource)
    trace.set_tracer_provider(provider)

    _TRACING_CONFIGURED = True
