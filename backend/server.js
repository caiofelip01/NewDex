import { createServer } from "node:http";

import {
  AUTH_RATE_LIMIT_MAX_ATTEMPTS,
  AUTH_RATE_LIMIT_WINDOW_MS,
  DEV_API_PORT,
  getAppOrigin,
} from "./config.js";
import { getSessionFromRequest, loginAccount, logoutAccount, registerAccount } from "./auth-service.js";
import { ensureSchema } from "./db.js";
import {
  createBoardCard,
  deleteCustomer,
  deleteFinancialEntry,
  deleteProduct,
  moveBoardCard,
  registerProductPurchase,
  saveAppointment,
  saveCustomer,
  saveEmployee,
  saveFinancialEntry,
  saveGoal,
  saveProduct,
  updateAppointmentStatus,
} from "./entity-service.js";
import { getAppStateForShop } from "./app-state-service.js";
import {
  HttpError,
  createRequestId,
  emptyResponse,
  jsonResponse,
  parseJsonBody,
  sendNodeResponse,
  toWebRequest,
  withRequestId,
} from "./http.js";
import { assertRateLimit } from "./rate-limit.js";
import { validateRequestBody, validateRouteParams } from "./validation.js";

const BODY_FIELDS_BY_HANDLER = new Map([
  [handleRegister, ["shopName", "displayName", "email", "password"]],
  [handleLogin, ["email", "password"]],
  [handleLogout, []],
  [
    handleCreateAppointment,
    ["cliente", "clienteId", "barbeiro", "barbeiroId", "servico", "data", "hora", "valor", "dur", "status"],
  ],
  [
    handleUpdateAppointment,
    ["cliente", "clienteId", "barbeiro", "barbeiroId", "servico", "data", "hora", "valor", "dur", "status"],
  ],
  [handleUpdateAppointmentStatus, ["status"]],
  [handleCreateCustomer, ["nome", "telefone", "instagram", "email", "nascimento", "observacoes", "visitas", "gasto", "avatar", "ultimaVisita"]],
  [handleUpdateCustomer, ["nome", "telefone", "instagram", "email", "nascimento", "observacoes", "visitas", "gasto", "avatar", "ultimaVisita"]],
  [handleCreateEmployee, ["nome", "cargo", "telefone", "email", "admissao", "comissao", "avatar", "cor", "sessoes", "faturamento", "dias", "especialidades"]],
  [handleUpdateEmployee, ["nome", "cargo", "telefone", "email", "admissao", "comissao", "avatar", "cor", "sessoes", "faturamento", "dias", "especialidades"]],
  [handleCreateFinancialEntry, ["tipo", "descricao", "categoria", "valor", "data"]],
  [handleUpdateFinancialEntry, ["tipo", "descricao", "categoria", "valor", "data"]],
  [handleCreateProduct, ["produto", "categoria", "quantidade", "minimo", "preco", "marca"]],
  [handleUpdateProduct, ["produto", "categoria", "quantidade", "minimo", "preco", "marca"]],
  [handleRegisterProductPurchase, ["quantidade", "custoUnitario", "data", "observacao"]],
  [handleUpdateGoal, ["faturamento", "atual", "monthKey"]],
  [handleCreateBoardCard, ["columnId", "titulo", "prioridade", "due", "responsavelId"]],
  [handleMoveBoardCard, ["targetColumnId", "targetIndex"]],
]);

// Tabela simples de rotas: método, pattern e handler correspondente.
const routes = [
  route("GET", "/api/health", handleHealth),
  route("POST", "/api/auth/register", handleRegister),
  route("POST", "/api/auth/login", handleLogin),
  route("POST", "/api/auth/logout", handleLogout),
  route("GET", "/api/auth/session", handleSession),
  route("GET", "/api/app-state", handleAppState, { auth: true }),
  route("POST", "/api/appointments", handleCreateAppointment, { auth: true }),
  route("PUT", "/api/appointments/:id", handleUpdateAppointment, { auth: true }),
  route("PATCH", "/api/appointments/:id/status", handleUpdateAppointmentStatus, { auth: true }),
  route("POST", "/api/customers", handleCreateCustomer, { auth: true }),
  route("PUT", "/api/customers/:id", handleUpdateCustomer, { auth: true }),
  route("DELETE", "/api/customers/:id", handleDeleteCustomer, { auth: true }),
  route("POST", "/api/employees", handleCreateEmployee, { auth: true }),
  route("PUT", "/api/employees/:id", handleUpdateEmployee, { auth: true }),
  route("POST", "/api/financial-entries", handleCreateFinancialEntry, {
    auth: true,
    roles: ["owner", "admin"],
  }),
  route("PUT", "/api/financial-entries/:id", handleUpdateFinancialEntry, {
    auth: true,
    roles: ["owner", "admin"],
  }),
  route("DELETE", "/api/financial-entries/:id", handleDeleteFinancialEntry, {
    auth: true,
    roles: ["owner", "admin"],
  }),
  route("POST", "/api/products", handleCreateProduct, { auth: true }),
  route("PUT", "/api/products/:id", handleUpdateProduct, { auth: true }),
  route("DELETE", "/api/products/:id", handleDeleteProduct, { auth: true }),
  route("POST", "/api/products/:id/purchases", handleRegisterProductPurchase, {
    auth: true,
    roles: ["owner", "admin"],
  }),
  route("PUT", "/api/goals/current", handleUpdateGoal, {
    auth: true,
    roles: ["owner", "admin"],
  }),
  route("POST", "/api/board-cards", handleCreateBoardCard, { auth: true }),
  route("PATCH", "/api/board-cards/:id/move", handleMoveBoardCard, { auth: true }),
];

// Pipeline principal da API: valida origem, resolve rota, lê body e executa o handler.
export async function handleFetchRequest(request) {
  const requestId = createRequestId(request);
  if (request.method === "OPTIONS") {
    return withRequestId(emptyResponse({ status: 204 }), requestId);
  }

  try {
    verifyTrustedRequestSource(request);

    const url = new URL(request.url);
    const rewrittenPath =
      url.pathname === "/api" && url.searchParams.get("path")
        ? `/api/${url.searchParams.get("path")}`
        : url.pathname;
    const matched = matchRoute(request.method, rewrittenPath);
    const allowedMethods = findAllowedMethods(rewrittenPath);

    if (!matched && allowedMethods.length) {
      throw new HttpError(405, "Metodo nao permitido para esta rota.", {
        code: "method_not_allowed",
        headers: { allow: allowedMethods.join(", ") },
      });
    }

    if (!matched) {
      throw new HttpError(404, "Rota não encontrada.", { code: "route_not_found" });
    }

    // Só exige sessão quando a rota realmente estiver marcada como protegida.
    validateRouteParams(matched.params);
    const sessionContext = matched.auth ? await requireSession(request) : await getSessionFromRequest(request);
    assertRouteRole(matched, sessionContext?.session);
    const body = request.method === "GET" || request.method === "HEAD" ? null : await parseJsonBody(request);
    const allowedBodyFields = BODY_FIELDS_BY_HANDLER.get(matched.handler);
    if (allowedBodyFields) {
      validateRequestBody(body, allowedBodyFields);
    }

    const response = await matched.handler({
      request,
      url,
      params: matched.params,
      body,
      session: sessionContext?.session || null,
    });

    if (sessionContext?.invalid && response.headers.get("set-cookie") == null) {
      response.headers.set("set-cookie", sessionContext.cookie);
    }

    return withRequestId(response, requestId);
  } catch (error) {
    return withRequestId(handleError(error, requestId), requestId);
  }
}

// Adaptador para rodar a mesma API tanto em Web Request quanto em Node HTTP puro.
export async function handleNodeRequest(req, res) {
  let response;

  try {
    const request = await toWebRequest(req, getAppOrigin(req.headers.host));
    response = await handleFetchRequest(request);
  } catch (error) {
    response = handleError(error);
  }

  await sendNodeResponse(res, response);
}

// Sobe o servidor local usado no desenvolvimento do backend.
export function startDevServer() {
  const server = createServer((req, res) => {
    handleNodeRequest(req, res).catch((error) => {
      const fallback = jsonResponse(
        {
          ok: false,
          error: "unexpected_failure",
          message: "Erro interno do servidor.",
        },
        { status: 500 },
      );

      sendNodeResponse(res, fallback);
    });
  });

  server.listen(DEV_API_PORT, () => {
    console.log(`Frontdex API rodando em http://localhost:${DEV_API_PORT}`);
  });

  return server;
}

// Pré-processa o pattern da rota para facilitar o match por segmento.
function route(method, pattern, handler, options = {}) {
  const segments = pattern.split("/").filter(Boolean);
  return {
    method,
    pattern,
    segments,
    handler,
    auth: Boolean(options.auth),
    roles: Array.isArray(options.roles) ? options.roles : [],
  };
}

function assertRouteRole(routeDefinition, session) {
  if (!routeDefinition.roles.length) {
    return;
  }

  if (!session?.user || !routeDefinition.roles.includes(session.user.role)) {
    throw new HttpError(403, "Seu perfil não tem permissão para esta operação.", {
      code: "forbidden",
    });
  }
}

// Faz um match manual de rotas com suporte a parâmetros no estilo :id.
function matchRoute(method, pathname) {
  const pathnameSegments = pathname.split("/").filter(Boolean);

  for (const routeDefinition of routes) {
    if (routeDefinition.method !== method) {
      continue;
    }

    if (routeDefinition.segments.length !== pathnameSegments.length) {
      continue;
    }

    const params = {};
    let matches = true;

    for (let index = 0; index < routeDefinition.segments.length; index += 1) {
      const routeSegment = routeDefinition.segments[index];
      const pathSegment = pathnameSegments[index];

      if (routeSegment.startsWith(":")) {
        params[routeSegment.slice(1)] = pathSegment;
        continue;
      }

      if (routeSegment !== pathSegment) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return { ...routeDefinition, params };
    }
  }

  return null;
}

function findAllowedMethods(pathname) {
  const pathnameSegments = pathname.split("/").filter(Boolean);
  return routes
    .filter((definition) =>
      definition.segments.length === pathnameSegments.length &&
      definition.segments.every(
        (segment, index) => segment.startsWith(":") || segment === pathnameSegments[index],
      ),
    )
    .map((definition) => definition.method);
}

// Garante que rotas protegidas sempre recebam uma sessão válida.
async function requireSession(request) {
  const sessionContext = await getSessionFromRequest(request);

  if (!sessionContext?.session) {
    throw new HttpError(401, "Sessão inválida ou expirada.", {
      code: "unauthorized",
      headers: sessionContext?.cookie ? { "set-cookie": sessionContext.cookie } : {},
    });
  }

  return sessionContext;
}

// Health check usado no bootstrap do front para decidir entre API real e modo demo.
async function handleHealth() {
  try {
    await ensureSchema();
    return jsonResponse({ ok: true, database: "ready" });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        database: "unavailable",
        message: "Banco indisponivel.",
      },
      { status: 500 },
    );
  }
}

// Cria uma conta nova e devolve a sess�o j� autenticada via cookie.
async function handleRegister({ body, request }) {
  enforceAuthRateLimit(request, "register");
  const result = await registerAccount(body, request);
  const response = jsonResponse({ ok: true, session: result.session }, { status: 201 });
  response.headers.set("set-cookie", result.cookie);
  return response;
}

// Autentica o usu�rio e renova o cookie de sess�o.
async function handleLogin({ body, request }) {
  enforceAuthRateLimit(request, "login");
  const result = await loginAccount(body, request);
  const response = jsonResponse({ ok: true, session: result.session });
  response.headers.set("set-cookie", result.cookie);
  return response;
}

// Encerra a sess�o atual e limpa o cookie no navegador.
async function handleLogout({ request }) {
  const result = await logoutAccount(request);
  const response = jsonResponse({ ok: true });
  response.headers.set("set-cookie", result.cookie);
  return response;
}

// Informa ao front se existe uma sess�o v�lida para restaurar a aplica��o.
async function handleSession({ request }) {
  const sessionContext = await getSessionFromRequest(request);
  if (!sessionContext?.session) {
    const response = jsonResponse({ ok: false, session: null }, { status: 401 });
    if (sessionContext?.cookie) {
      response.headers.set("set-cookie", sessionContext.cookie);
    }
    return response;
  }

  return jsonResponse({ ok: true, session: { user: sessionContext.session.user } });
}

// Entrega todo o estado inicial da loja ap�s o login.
async function handleAppState({ session }) {
  const data = await getAppStateForShop(session.shopId);
  return jsonResponse({ ok: true, data, session: { user: session.user } });
}

// Cria um novo agendamento e retorna o id para o front.
async function handleCreateAppointment({ body, session }) {
  const id = await saveAppointment(session.shopId, body);
  return jsonResponse({ ok: true, id }, { status: 201 });
}

// Atualiza um agendamento existente identificado pela rota.
async function handleUpdateAppointment({ body, params, session }) {
  const id = await saveAppointment(session.shopId, body, params.id);
  return jsonResponse({ ok: true, id });
}

// Troca somente o status do agendamento para a��es r�pidas na UI.
async function handleUpdateAppointmentStatus({ body, params, session }) {
  await updateAppointmentStatus(session.shopId, params.id, body.status);
  return jsonResponse({ ok: true });
}

// Cadastra um cliente novo.
async function handleCreateCustomer({ body, session }) {
  const id = await saveCustomer(session.shopId, body);
  return jsonResponse({ ok: true, id }, { status: 201 });
}

// Edita um cliente existente.
async function handleUpdateCustomer({ body, params, session }) {
  const id = await saveCustomer(session.shopId, body, params.id);
  return jsonResponse({ ok: true, id });
}

// Remove um cliente do banco da loja atual.
async function handleDeleteCustomer({ params, session }) {
  await deleteCustomer(session.shopId, params.id);
  return jsonResponse({ ok: true });
}

// Cadastra um profissional novo.
async function handleCreateEmployee({ body, session }) {
  const id = await saveEmployee(session.shopId, body);
  return jsonResponse({ ok: true, id }, { status: 201 });
}

// Atualiza os dados de um profissional.
async function handleUpdateEmployee({ body, params, session }) {
  const id = await saveEmployee(session.shopId, body, params.id);
  return jsonResponse({ ok: true, id });
}

// Salva uma nova entrada ou sa�da financeira.
async function handleCreateFinancialEntry({ body, session }) {
  const id = await saveFinancialEntry(session.shopId, body);
  return jsonResponse({ ok: true, id }, { status: 201 });
}

// Atualiza um lan�amento financeiro existente.
async function handleUpdateFinancialEntry({ body, params, session }) {
  const id = await saveFinancialEntry(session.shopId, body, params.id);
  return jsonResponse({ ok: true, id });
}

// Exclui um lan�amento financeiro da loja.
async function handleDeleteFinancialEntry({ params, session }) {
  await deleteFinancialEntry(session.shopId, params.id);
  return jsonResponse({ ok: true });
}

// Cadastra um produto novo no estoque.
async function handleCreateProduct({ body, session }) {
  const id = await saveProduct(session.shopId, body);
  return jsonResponse({ ok: true, id }, { status: 201 });
}

// Atualiza os dados de um produto existente.
async function handleUpdateProduct({ body, params, session }) {
  const id = await saveProduct(session.shopId, body, params.id);
  return jsonResponse({ ok: true, id });
}

// Remove um produto do estoque.
async function handleDeleteProduct({ params, session }) {
  await deleteProduct(session.shopId, params.id);
  return jsonResponse({ ok: true });
}

// Uma compra atualiza estoque, historico de movimentacoes e financeiro na mesma transacao.
async function handleRegisterProductPurchase({ body, params, session }) {
  const result = await registerProductPurchase(session.shopId, params.id, body);
  return jsonResponse(
    {
      ok: true,
      id: result.id,
      financeiroId: result.financialEntryId,
    },
    { status: 201 },
  );
}

// Persiste a meta principal exibida no dashboard.
async function handleUpdateGoal({ body, session }) {
  await saveGoal(session.shopId, body);
  return jsonResponse({ ok: true });
}

// Cria um card no quadro kanban da opera��o.
async function handleCreateBoardCard({ body, session }) {
  const id = await createBoardCard(session.shopId, body);
  return jsonResponse({ ok: true, id }, { status: 201 });
}

// Move ou reordena um card entre colunas do kanban.
async function handleMoveBoardCard({ body, params, session }) {
  await moveBoardCard(session.shopId, params.id, body);
  return jsonResponse({ ok: true });
}

// Normaliza erros esperados e inesperados para um formato HTTP consistente.
function handleError(error, requestId) {
  if (error instanceof HttpError) {
    return jsonResponse(
      {
        ok: false,
        error: error.code,
        message: error.message,
        details: error.details,
        requestId,
      },
      {
        status: error.status,
        headers: error.headers,
      },
    );
  }

  console.error(error);
  return jsonResponse(
    {
      ok: false,
      error: "internal_error",
      message: "Erro interno do servidor.",
      requestId,
    },
    { status: 500 },
  );
}

// Limita tentativas seguidas de login/cadastro para reduzir abuso.
function enforceAuthRateLimit(request, action) {
  // Prefere IPs encaminhados por proxy, mas cai para headers locais no dev.
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip") || "local";

  try {
    assertRateLimit(`${action}:${ip}`, {
      limit: AUTH_RATE_LIMIT_MAX_ATTEMPTS,
      windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
      message: "Muitas tentativas de autenticação. Tente novamente em alguns minutos.",
    });
  } catch (error) {
    throw new HttpError(429, error.message, {
      code: "too_many_auth_attempts",
      headers: error.retryAfterSeconds ? { "retry-after": String(error.retryAfterSeconds) } : {},
    });
  }
}

// Rejeita muta��es vindas de origens n�o confi�veis para endurecer a API.
function verifyTrustedRequestSource(request) {
  if (!isMutationMethod(request.method)) {
    return;
  }

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && !["same-origin", "same-site", "none"].includes(secFetchSite)) {
    throw new HttpError(403, "Origem da requisicao nao permitida.", {
      code: "forbidden_request_origin",
    });
  }

  const allowedOrigins = getAllowedOrigins(request);
  const origin = request.headers.get("origin");

  if (origin && !allowedOrigins.has(normalizeOrigin(origin))) {
    throw new HttpError(403, "Origem da requisicao nao permitida.", {
      code: "forbidden_request_origin",
    });
  }

  const referer = request.headers.get("referer");
  if (!origin && referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!allowedOrigins.has(refererOrigin)) {
        throw new HttpError(403, "Origem da requisicao nao permitida.", {
          code: "forbidden_request_origin",
        });
      }
    } catch {
      throw new HttpError(403, "Origem da requisicao nao permitida.", {
        code: "forbidden_request_origin",
      });
    }
  }
}

// Identifica m�todos que realmente alteram estado e precisam de valida��o extra.
function isMutationMethod(method) {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

// Monta a lista de origens permitidas considerando host atual, proxy e env.
function getAllowedOrigins(request) {
  const allowedOrigins = new Set();
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost || request.headers.get("host");
  const protocol = forwardedProto || requestUrl.protocol.replace(":", "");

  allowedOrigins.add(requestUrl.origin);

  if (host) {
    allowedOrigins.add(`${protocol}://${host}`);
  }

  if (process.env.APP_ORIGIN) {
    allowedOrigins.add(normalizeOrigin(process.env.APP_ORIGIN));
  }

  return allowedOrigins;
}

// Remove path/query e deixa apenas a origem usada na compara��o.
function normalizeOrigin(value) {
  return new URL(value).origin;
}
