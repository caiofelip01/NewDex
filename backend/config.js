import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

export const SESSION_COOKIE_NAME = "frontdex_session";
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;
export const SESSION_IDLE_TIMEOUT_MS = 1000 * 60 * 60 * 12;
export const SESSION_TOUCH_INTERVAL_MS = 1000 * 60 * 5;
export const MAX_ACTIVE_SESSIONS = 3;
export const DEV_API_PORT = 8787;
export const MAX_JSON_BODY_BYTES = 1024 * 1024;
export const AUTH_RATE_LIMIT_WINDOW_MS = 1000 * 60 * 10;
export const AUTH_RATE_LIMIT_MAX_ATTEMPTS = 10;
export const IS_PRODUCTION = process.env.NODE_ENV === "production";

export function getAppOrigin(host) {
  if (process.env.APP_ORIGIN) {
    return process.env.APP_ORIGIN;
  }

  return `http://${host || `localhost:${DEV_API_PORT}`}`;
}

export function getSessionCookieSecret() {
  const secret = process.env.SESSION_COOKIE_SECRET?.trim();

  if (secret && secret.length >= 32) {
    return secret;
  }

  if (IS_PRODUCTION) {
    throw new Error("SESSION_COOKIE_SECRET must be set with at least 32 characters in production.");
  }

  return secret || "frontdex-dev-secret-change-me";
}
