import assert from "node:assert/strict";
import test from "node:test";

import { validateRequestBody, validateRouteParams } from "./validation.js";

test("accepts only declared body fields", () => {
  assert.deepEqual(validateRequestBody({ nome: "Ana" }, ["nome"]), { nome: "Ana" });
  assert.throws(
    () => validateRequestBody({ nome: "Ana", role: "admin" }, ["nome"]),
    (error) => error.status === 400 && error.code === "unexpected_fields",
  );
});

test("rejects arrays and invalid route identifiers", () => {
  assert.throws(() => validateRequestBody([], []), (error) => error.code === "invalid_request_body");
  assert.throws(() => validateRouteParams({ id: "1" }), (error) => error.code === "invalid_route_parameter");
  assert.doesNotThrow(() => validateRouteParams({ id: "68df1d99-b9c1-4c26-83a0-31d68b8c0287" }));
});
