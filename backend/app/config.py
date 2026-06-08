from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    whisper_model: str = "base"
    spacy_model: str = "en_core_web_sm"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
