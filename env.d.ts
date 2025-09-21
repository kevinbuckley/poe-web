declare namespace NodeJS {
  interface ProcessEnv {
    OPENAI_API_KEY: string;
    DEFAULT_MODEL?: string;
    REDIS_URL?: string;
    REDIS_TOKEN?: string;
    SESSION_TTL_SECONDS?: string;
    SESSION_MAX_HISTORY?: string;
    SESSION_DRAFT_TTL_SECONDS?: string;
    SESSION_ARCHIVE_DIR?: string;
  }
}
