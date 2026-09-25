export class ApiError extends Error {
  // Padroniza os erros da camada HTTP para o front tratar tudo do mesmo jeito.
  constructor(message, status, code, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

// Centraliza chamadas para a API com timeout, parse automático e erros normalizados.
export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Reaproveita um AbortSignal externo sem perder o timeout interno da request.
  const removeAbortBridge = bridgeAbortSignal(options.signal, controller);
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort(new Error("request_timeout"));
  }, timeoutMs);

  try {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers,
      body: serializeBody(options.body, headers),
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    const hasJson = contentType.includes("application/json");
    const payload = hasJson ? await response.json() : await response.text();

    if (!response.ok) {
      // Converte respostas não-200 em ApiError para o resto da app não depender do fetch cru.
      throw new ApiError(
        hasJson ? payload?.message || "Erro ao comunicar com a API." : payload || "Erro ao comunicar com a API.",
        response.status,
        hasJson ? payload?.error || "api_error" : "api_error",
        hasJson ? payload?.details || null : null,
      );
    }

    return payload;
  } catch (error) {
    if (error?.name === "AbortError" || error?.message === "request_timeout") {
      throw new ApiError("A requisicao demorou demais para responder.", 408, "request_timeout", null);
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
    removeAbortBridge();
  }
}

// Só serializa para JSON quando o body ainda não estiver em um formato nativo do fetch.
function serializeBody(body, headers) {
  if (body == null) {
    return undefined;
  }

  if (
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob
  ) {
    return body;
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return JSON.stringify(body);
}

// Liga um sinal externo ao controller local e devolve uma função de limpeza do listener.
function bridgeAbortSignal(signal, controller) {
  if (!signal) {
    return () => {};
  }

  const abortRequest = () => {
    controller.abort(signal.reason);
  };

  if (signal.aborted) {
    abortRequest();
    return () => {};
  }

  signal.addEventListener("abort", abortRequest, { once: true });
  return () => signal.removeEventListener("abort", abortRequest);
}
