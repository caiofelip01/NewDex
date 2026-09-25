import { createHash, randomUUID } from "node:crypto";

import { IS_PRODUCTION, MAX_JSON_BODY_BYTES, SESSION_COOKIE_NAME } from "./config.js";

export class HttpError extends Error {
  constructor(status, message, options = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = options.code || "http_error";
    this.details = options.details || null;
    this.headers = options.headers || {};
  }
}

export function jsonResponse(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  applySecurityHeaders(headers);

  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}

export function emptyResponse(init = {}) {
  const headers = new Headers(init.headers || {});
  applySecurityHeaders(headers);
  return new Response(null, { ...init, headers });
}

export async function parseJsonBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (request.body && !contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Use Content-Type application/json.", {
      code: "unsupported_media_type",
    });
  }

  return request.text().then((text) => {
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new HttpError(400, "JSON inválido.", { code: "invalid_json" });
    }
  });
}

export function createRequestId(request) {
  const provided = request.headers.get("x-request-id")?.trim();
  return provided && /^[A-Za-z0-9._:-]{1,100}$/.test(provided) ? provided : randomUUID();
}

export function withRequestId(response, requestId) {
  response.headers.set("x-request-id", requestId);
  return response;
}

export function parseCookies(request) {
  const raw = request.headers.get("cookie") || "";
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((all, part) => {
      const index = part.indexOf("=");
      if (index <= 0) {
        return all;
      }

      const key = decodeURIComponent(part.slice(0, index).trim());
      const value = decodeURIComponent(part.slice(index + 1).trim());
      all[key] = value;
      return all;
    }, {});
}

export function createSessionCookie(token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    `Expires=${expiresAt.toUTCString()}`,
  ];

  if (IS_PRODUCTION) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function clearSessionCookie() {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
  ];

  if (IS_PRODUCTION) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return request.headers.get("x-real-ip") || "local";
}

export function getUserAgent(request) {
  return request.headers.get("user-agent") || "unknown";
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function toWebRequest(nodeRequest, origin) {
  const headers = new Headers();

  for (const [key, value] of Object.entries(nodeRequest.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  const body =
    nodeRequest.method === "GET" || nodeRequest.method === "HEAD"
      ? undefined
      : await readNodeStream(nodeRequest);

  return new Request(new URL(nodeRequest.url || "/", origin), {
    method: nodeRequest.method,
    headers,
    body: body?.length ? body : undefined,
  });
}

export async function sendNodeResponse(nodeResponse, response) {
  nodeResponse.statusCode = response.status;

  response.headers.forEach((value, key) => {
    nodeResponse.setHeader(key, value);
  });

  if (response.body) {
    const body = Buffer.from(await response.arrayBuffer());
    nodeResponse.end(body);
    return;
  }

  nodeResponse.end();
}

function readNodeStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    stream.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;

      if (size > MAX_JSON_BODY_BYTES) {
        reject(new HttpError(413, "Payload excede o limite permitido.", {
          code: "payload_too_large",
        }));
        stream.destroy();
        return;
      }

      chunks.push(buffer);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function applySecurityHeaders(headers) {
  headers.set("cache-control", "no-store");
  headers.set("content-security-policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
}
