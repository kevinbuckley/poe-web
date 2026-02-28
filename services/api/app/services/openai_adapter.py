from openai import OpenAI

from app.core.config import get_settings

settings = get_settings()


class OpenAIAdapter:
    def __init__(self) -> None:
        self._enabled = bool(settings.openai_api_key)
        self._client = OpenAI(api_key=settings.openai_api_key) if self._enabled else None

    def generate(self, system_prompt: str, user_prompt: str) -> str:
        if not self._enabled or self._client is None:
            return (
                "[Simulated response] "
                "I hear your request and will respond with a balanced argument from the selected persona."
            )

        response = self._client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
        )
        choice = response.choices[0]
        return choice.message.content or "I need a moment to reformulate my response."
