import { HttpError } from "./http.js";

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateRequestBody(body, allowedFields) {
  if (!isPlainObject(body)) {
    throw new HttpError(400, "O corpo da requisicao deve ser um objeto JSON.", {
      code: "invalid_request_body",
    });
  }

  const allowed = new Set(allowedFields);
  const unexpected = Object.keys(body).filter((key) => BLOCKED_KEYS.has(key) || !allowed.has(key));

  if (unexpected.length) {
    throw new HttpError(400, "O corpo da requisicao contem campos nao permitidos.", {
      code: "unexpected_fields",
      details: { fields: unexpected },
    });
  }

  return body;
}

export function validateRouteParams(params) {
  for (const [name, value] of Object.entries(params)) {
    if (!UUID_PATTERN.test(value)) {
      throw new HttpError(400, `Parametro ${name} invalido.`, { code: "invalid_route_parameter" });
    }
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
