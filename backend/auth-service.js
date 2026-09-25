import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import {
  getSessionCookieSecret,
  MAX_ACTIVE_SESSIONS,
  SESSION_COOKIE_NAME,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_MAX_AGE_MS,
  SESSION_TOUCH_INTERVAL_MS,
} from "./config.js";
import { dbQuery, dbTransaction } from "./db.js";
import {
  HttpError,
  clearSessionCookie,
  createSessionCookie,
  getClientIp,
  getUserAgent,
  parseCookies,
} from "./http.js";
import { buildSeedQueries } from "./seed.js";

const scrypt = promisify(scryptCallback);

export async function registerAccount(requestBody, request) {
  const shopName = requireText(requestBody.shopName, "Nome da barbearia");
  const displayName = requireText(requestBody.displayName, "Nome do responsável");
  const email = normalizeEmail(requestBody.email);
  const password = String(requestBody.password || "");

  validatePassword(password);

  const existingUser = await dbQuery("SELECT id FROM users WHERE email = $1 LIMIT 1", [email]);
  if (existingUser.length) {
    throw new HttpError(409, "Já existe uma conta com este e-mail.", {
      code: "email_taken",
    });
  }

  const shopId = randomUUID();
  const userId = randomUUID();
  const session = createSessionRecord(userId, request);
  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(password, passwordSalt);

  await dbTransaction((sql) => [
    sql.query("INSERT INTO shops (id, name) VALUES ($1, $2)", [shopId, shopName]),
    sql.query(
      `INSERT INTO users (
        id, shop_id, email, password_hash, password_salt, display_name, role, last_login_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'owner', NOW())`,
      [userId, shopId, email, passwordHash, passwordSalt, displayName],
    ),
    sql.query(
      `INSERT INTO sessions (
        id, user_id, token_hash, expires_at, idle_expires_at, last_seen_at, user_agent, ip_address
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)`,
      [
        session.id,
        userId,
        session.tokenHash,
        session.expiresAt.toISOString(),
        session.idleExpiresAt.toISOString(),
        session.userAgent,
        session.ipAddress,
      ],
    ),
    ...buildSeedQueries(sql, shopId),
  ]);

  return {
    session: {
      user: {
        id: userId,
        shopId,
        displayName,
        email,
        role: "owner",
        shopName,
      },
    },
    cookie: createSessionCookie(session.rawToken, session.expiresAt),
  };
}

export async function loginAccount(requestBody, request) {
  const email = normalizeEmail(requestBody.email);
  const password = String(requestBody.password || "");

  const [user] = await dbQuery(
    `SELECT u.id, u.shop_id, u.email, u.password_hash, u.password_salt, u.display_name, u.role, s.name AS shop_name
     FROM users u
     INNER JOIN shops s ON s.id = u.shop_id
     WHERE u.email = $1
     LIMIT 1`,
    [email],
  );

  if (!user) {
    throw new HttpError(401, "E-mail ou senha inválidos.", { code: "invalid_credentials" });
  }

  const validPassword = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!validPassword) {
    throw new HttpError(401, "E-mail ou senha inválidos.", { code: "invalid_credentials" });
  }

  const session = createSessionRecord(user.id, request);

  await dbTransaction((sql) => [
    sql.query("UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1", [user.id]),
    sql.query(
      `INSERT INTO sessions (
        id, user_id, token_hash, expires_at, idle_expires_at, last_seen_at, user_agent, ip_address
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)`,
      [
        session.id,
        user.id,
        session.tokenHash,
        session.expiresAt.toISOString(),
        session.idleExpiresAt.toISOString(),
        session.userAgent,
        session.ipAddress,
      ],
    ),
  ]);

  await pruneSessions(user.id);

  return {
    session: {
      user: {
        id: user.id,
        shopId: user.shop_id,
        displayName: user.display_name,
        email: user.email,
        role: user.role,
        shopName: user.shop_name,
      },
    },
    cookie: createSessionCookie(session.rawToken, session.expiresAt),
  };
}

export async function logoutAccount(request) {
  const token = parseCookies(request)[SESSION_COOKIE_NAME];
  if (token) {
    await dbQuery("DELETE FROM sessions WHERE token_hash = $1", [hashSessionToken(token)]);
  }

  return { cookie: clearSessionCookie() };
}

export async function getSessionFromRequest(request) {
  const token = parseCookies(request)[SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }

  const [session] = await dbQuery(
    `SELECT
      sess.id AS session_id,
      sess.user_id,
      sess.expires_at,
      sess.idle_expires_at,
      sess.last_seen_at,
      usr.shop_id,
      usr.display_name,
      usr.email,
      usr.role,
      shp.name AS shop_name
     FROM sessions sess
     INNER JOIN users usr ON usr.id = sess.user_id
     INNER JOIN shops shp ON shp.id = usr.shop_id
     WHERE sess.token_hash = $1
     LIMIT 1`,
    [hashSessionToken(token)],
  );

  if (!session) {
    return { invalid: true, cookie: clearSessionCookie() };
  }

  const now = Date.now();
  const expiresAt = new Date(session.expires_at).getTime();
  const idleExpiresAt = new Date(session.idle_expires_at).getTime();

  if (expiresAt <= now || idleExpiresAt <= now) {
    await dbQuery("DELETE FROM sessions WHERE id = $1", [session.session_id]);
    return { invalid: true, cookie: clearSessionCookie() };
  }

  if (now - new Date(session.last_seen_at).getTime() > SESSION_TOUCH_INTERVAL_MS) {
    const nextIdleExpiry = new Date(now + SESSION_IDLE_TIMEOUT_MS);
    await dbQuery(
      "UPDATE sessions SET last_seen_at = NOW(), idle_expires_at = $2 WHERE id = $1",
      [session.session_id, nextIdleExpiry.toISOString()],
    );
  }

  return {
    session: {
      id: session.session_id,
      userId: session.user_id,
      shopId: session.shop_id,
      user: {
        id: session.user_id,
        shopId: session.shop_id,
        displayName: session.display_name,
        email: session.email,
        role: session.role,
        shopName: session.shop_name,
      },
    },
  };
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Informe um e-mail válido.", { code: "invalid_email" });
  }

  return email;
}

function requireText(value, label) {
  const text = String(value || "").trim();
  if (!text) {
    throw new HttpError(400, `${label} é obrigatório.`, { code: "missing_field" });
  }

  if (text.length > 120) {
    throw new HttpError(400, `${label} excede o tamanho permitido.`, { code: "field_too_long" });
  }

  return text;
}

function validatePassword(password) {
  const strongEnough =
    password.length <= 128 &&
    password.length >= 10 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password);

  if (!strongEnough) {
    throw new HttpError(
      400,
      "A senha precisa ter no mínimo 10 caracteres, com maiúsculas, minúsculas e números.",
      { code: "weak_password" },
    );
  }
}

async function hashPassword(password, salt) {
  const derivedKey = await scrypt(password, salt, 64);
  return derivedKey.toString("hex");
}

async function verifyPassword(password, salt, expectedHash) {
  const candidate = await scrypt(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(expectedHash, "hex"));
}

function createSessionRecord(userId, request) {
  const rawToken = createSessionToken();
  const now = Date.now();

  return {
    id: randomUUID(),
    userId,
    rawToken,
    tokenHash: hashSessionToken(rawToken),
    expiresAt: new Date(now + SESSION_MAX_AGE_MS),
    idleExpiresAt: new Date(now + SESSION_IDLE_TIMEOUT_MS),
    userAgent: getUserAgent(request),
    ipAddress: getClientIp(request),
  };
}

function createSessionToken() {
  const nonce = randomBytes(32).toString("hex");
  return createHmac("sha256", getSessionCookieSecret()).update(nonce).digest("hex");
}

function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function pruneSessions(userId) {
  await dbQuery(
    "DELETE FROM sessions WHERE user_id = $1 AND (expires_at <= NOW() OR idle_expires_at <= NOW())",
    [userId],
  );

  const activeSessions = await dbQuery(
    `SELECT id
     FROM sessions
     WHERE user_id = $1
     ORDER BY last_seen_at DESC, created_at DESC`,
    [userId],
  );

  if (activeSessions.length <= MAX_ACTIVE_SESSIONS) {
    return;
  }

  const removable = activeSessions.slice(MAX_ACTIVE_SESSIONS).map((session) => session.id);
  await dbQuery("DELETE FROM sessions WHERE id = ANY($1::uuid[])", [removable]);
}
